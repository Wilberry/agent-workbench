import { createServerSupabaseClient } from './supabaseClient';
import { evaluations } from './evaluations';
import type { Database, Experiment } from './types';
import type { SupabaseClient } from '@supabase/supabase-js';

async function hasOrganizationAccess(
  supabase: SupabaseClient<Database>,
  userId: string,
  organizationId: string | null | undefined
) {
  if (!organizationId) return false;
  const { data, error } = await supabase
    .from('organization_memberships')
    .select('id')
    .eq('org_id', organizationId)
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  return Boolean(data);
}

async function authorizeExperimentTarget(
  supabase: SupabaseClient<Database>,
  userId: string,
  payload: {
    agentId: string;
    versionAId: string;
    versionBId: string;
    datasetId: string;
    organizationId?: string | null;
  }
): Promise<{ organizationId: string | null }> {
  const { data: dataset, error: datasetError } = await supabase
    .from('evaluation_datasets')
    .select('id,user_id,organization_id,agent_id')
    .eq('id', payload.datasetId)
    .maybeSingle();
  if (datasetError) throw datasetError;
  if (!dataset) throw new Error('Evaluation dataset not found');

  const datasetAuthorized =
    dataset.user_id === userId ||
    await hasOrganizationAccess(supabase, userId, dataset.organization_id);
  if (!datasetAuthorized) throw new Error('Not authorized to use this evaluation dataset');

  const { data: agent, error: agentError } = await supabase
    .from('agents')
    .select('id,user_id,organization_id')
    .eq('id', payload.agentId)
    .maybeSingle();
  if (agentError) throw agentError;
  if (!agent) throw new Error('Agent not found');

  const agentAuthorized =
    agent.user_id === userId ||
    await hasOrganizationAccess(supabase, userId, agent.organization_id);
  if (!agentAuthorized) throw new Error('Not authorized to experiment on this agent');

  const { data: versions, error: versionsError } = await supabase
    .from('agent_versions')
    .select('id,agent_id')
    .in('id', [payload.versionAId, payload.versionBId]);
  if (versionsError) throw versionsError;

  const versionAgentIds = new Map((versions ?? []).map((version) => [version.id, version.agent_id]));
  if (versionAgentIds.get(payload.versionAId) !== payload.agentId) {
    throw new Error('versionAId does not belong to the experiment agent');
  }
  if (versionAgentIds.get(payload.versionBId) !== payload.agentId) {
    throw new Error('versionBId does not belong to the experiment agent');
  }
  if (dataset.agent_id && dataset.agent_id !== payload.agentId) {
    throw new Error('Evaluation dataset does not belong to the experiment agent');
  }

  if (
    dataset.organization_id &&
    agent.organization_id &&
    dataset.organization_id !== agent.organization_id
  ) {
    throw new Error('Evaluation dataset and agent must belong to the same organization');
  }

  const organizationId = dataset.organization_id ?? agent.organization_id ?? null;
  if (payload.organizationId && payload.organizationId !== organizationId) {
    throw new Error('Experiment organization must match the dataset and agent organization');
  }

  return { organizationId };
}

export const experiments = {
  async assertExperimentAccess(
    userId: string,
    experimentId: string,
    client?: SupabaseClient<Database>
  ) {
    const supabase = client ?? createServerSupabaseClient();
    const { data: experiment, error } = await supabase
      .from('experiments')
      .select('*')
      .eq('id', experimentId)
      .maybeSingle();

    if (error) throw error;
    if (!experiment) throw new Error('Experiment not found');
    if (experiment.created_by === userId) return experiment as Experiment;

    if (experiment.organization_id) {
      const authorized = await hasOrganizationAccess(
        supabase,
        userId,
        experiment.organization_id
      );
      if (authorized) return experiment as Experiment;
    }

    throw new Error('Not authorized to access this experiment');
  },

  async createExperiment(
    userId: string,
    payload: {
      name: string;
      agentId: string;
      versionAId: string;
      versionBId: string;
      datasetId: string;
      organizationId?: string | null;
    },
    client?: SupabaseClient<Database>
  ) {
    const supabase = client ?? createServerSupabaseClient();
    const { organizationId } = await authorizeExperimentTarget(supabase, userId, payload);

    const { data, error } = await supabase
      .from('experiments')
      .insert([
        {
          name: payload.name,
          agent_id: payload.agentId,
          version_a_id: payload.versionAId,
          version_b_id: payload.versionBId,
          dataset_id: payload.datasetId,
          created_by: userId,
          organization_id: organizationId,
          status: 'draft'
        }
      ])
      .select('*')
      .single();

    if (error) throw error;
    return data as Experiment;
  },

  async listExperiments(
    userId?: string,
    options?: { organizationId?: string | null },
    client?: SupabaseClient<Database>
  ) {
    const supabase = client ?? createServerSupabaseClient();
    let query = supabase.from('experiments').select('*').order('created_at', { ascending: false });

    if (userId) {
      query = query.or(`created_by.eq.${userId}${options?.organizationId ? `,organization_id.eq.${options.organizationId}` : ''}`);
    } else if (options?.organizationId) {
      query = query.eq('organization_id', options.organizationId);
    }

    const { data, error } = await query;
    if (error) throw error;
    return (data ?? []) as Experiment[];
  },

  async getExperiment(experimentId: string, client?: SupabaseClient<Database>) {
    const supabase = client ?? createServerSupabaseClient();
    const { data, error } = await supabase
      .from('experiments')
      .select('*')
      .eq('id', experimentId)
      .single();

    if (error) throw error;
    return data as Experiment;
  },

  /**
   * Start an experiment by enqueueing both evaluation runs. This method returns
   * as soon as the durable queue rows exist; completion is reconciled by the
   * evaluation worker as each side finishes.
   */
  async executeExperiment(
    userId: string,
    payload: {
      experimentId?: string;
      name?: string;
      agentId?: string;
      versionAId?: string;
      versionBId?: string;
      datasetId?: string;
      organizationId?: string | null;
    },
    client?: SupabaseClient<Database>
  ) {
    const supabase = client ?? createServerSupabaseClient();
    let experiment: Experiment | null = null;

    if (payload.experimentId) {
      experiment = await this.assertExperimentAccess(userId, payload.experimentId, supabase);
      if (!experiment) throw new Error('Experiment not found');
      if (experiment.status === 'cancelled') {
        throw new Error('Experiment is already cancelled');
      }

      await authorizeExperimentTarget(supabase, userId, {
        agentId: experiment.agent_id,
        versionAId: experiment.version_a_id,
        versionBId: experiment.version_b_id,
        datasetId: experiment.dataset_id,
        organizationId: experiment.organization_id ?? null
      });

      // Once both evaluation run IDs are persisted, execution is idempotent.
      // Repeated start requests must never reset terminal experiments or create
      // duplicate evaluation runs.
      if (experiment.run_a_id && experiment.run_b_id) {
        const [runA, runB] = await Promise.all([
          evaluations.getEvaluationRun(experiment.run_a_id, supabase),
          evaluations.getEvaluationRun(experiment.run_b_id, supabase)
        ]);
        return { experiment, runA, runB };
      }
    } else {
      if (!payload.name || !payload.agentId || !payload.versionAId || !payload.versionBId || !payload.datasetId) {
        throw new Error('Missing required experiment payload fields');
      }

      const { organizationId } = await authorizeExperimentTarget(supabase, userId, {
        agentId: payload.agentId,
        versionAId: payload.versionAId,
        versionBId: payload.versionBId,
        datasetId: payload.datasetId,
        organizationId: payload.organizationId ?? null
      });

      const { data, error: createError } = await supabase
        .from('experiments')
        .insert([
          {
            name: payload.name,
            agent_id: payload.agentId,
            version_a_id: payload.versionAId,
            version_b_id: payload.versionBId,
            dataset_id: payload.datasetId,
            created_by: userId,
            organization_id: organizationId,
            status: 'draft'
          }
        ])
        .select('*')
        .single();

      if (createError || !data) throw createError ?? new Error('Failed to create experiment');
      experiment = data as Experiment;
    }

    try {
      const versionAId = payload.versionAId ?? experiment.version_a_id;
      const versionBId = payload.versionBId ?? experiment.version_b_id;
      const datasetId = payload.datasetId ?? experiment.dataset_id;
      const organizationId = payload.organizationId ?? experiment.organization_id ?? null;

      const runA = experiment.run_a_id
        ? { run: await evaluations.getEvaluationRun(experiment.run_a_id, supabase) }
        : await evaluations.createEvaluationRun(userId, {
            datasetId,
            agentVersionId: versionAId,
            organizationId
          }, supabase);

      const runB = experiment.run_b_id
        ? { run: await evaluations.getEvaluationRun(experiment.run_b_id, supabase) }
        : await evaluations.createEvaluationRun(userId, {
            datasetId,
            agentVersionId: versionBId,
            organizationId
          }, supabase);

      const { data: runningExperiment, error: updateError } = await supabase
        .from('experiments')
        .update({
          status: 'running',
          run_a_id: runA.run.id,
          run_b_id: runB.run.id
        })
        .eq('id', experiment.id)
        .neq('status', 'cancelled')
        .select('*')
        .maybeSingle();

      if (updateError || !runningExperiment) {
        if (!updateError) throw new Error('Experiment was cancelled before execution started');
        throw updateError;
      }

      return {
        experiment: runningExperiment as Experiment,
        runA: runA.run,
        runB: runB.run
      };
    } catch (error) {
      const latest = await this.getExperiment(experiment.id, supabase);
      if (latest.status !== 'cancelled') {
        await supabase.from('experiments').update({ status: 'failed' }).eq('id', experiment.id);
      }
      throw error;
    }
  },

  async cancelExperiment(
    userId: string,
    experimentId: string,
    reason?: string | null,
    client?: SupabaseClient<Database>
  ) {
    const supabase = client ?? createServerSupabaseClient();
    const experiment = await this.assertExperimentAccess(userId, experimentId, supabase);

    if (experiment.status === 'cancelled') {
      const [runA, runB] = await Promise.all([
        experiment.run_a_id ? evaluations.getEvaluationRun(experiment.run_a_id, supabase) : null,
        experiment.run_b_id ? evaluations.getEvaluationRun(experiment.run_b_id, supabase) : null
      ]);
      return { experiment, runA, runB };
    }
    if (experiment.status === 'completed' || experiment.status === 'failed') {
      throw new Error(`Experiment is already ${experiment.status}`);
    }

    const cancelledAt = new Date().toISOString();
    const cancellationReason = reason?.trim() || null;
    const { data: cancelledExperiment, error: cancelError } = await supabase
      .from('experiments')
      .update({
        status: 'cancelled',
        cancelled_at: cancelledAt,
        cancellation_reason: cancellationReason
      })
      .eq('id', experimentId)
      .in('status', ['draft', 'running'])
      .select('*')
      .maybeSingle();
    if (cancelError) throw cancelError;

    const target = (cancelledExperiment ?? await this.getExperiment(experimentId, supabase)) as Experiment;
    if (target.status !== 'cancelled') {
      throw new Error(`Experiment is already ${target.status}`);
    }

    const cancelRunIfActive = async (runId?: string | null) => {
      if (!runId) return null;
      const run = await evaluations.getEvaluationRun(runId, supabase);
      if (run.status === 'pending' || run.status === 'running') {
        return evaluations.cancelEvaluationRun(userId, runId, cancellationReason, supabase);
      }
      return run;
    };

    const [runA, runB] = await Promise.all([
      cancelRunIfActive(target.run_a_id),
      cancelRunIfActive(target.run_b_id)
    ]);

    return { experiment: target, runA, runB };
  },

  /**
   * Reconcile an experiment when one of its queued evaluation runs changes
   * terminal state. No-op when the run is not attached to an experiment.
   */
  async syncExperimentStatusForRun(runId: string, client?: SupabaseClient<Database>) {
    const supabase = client ?? createServerSupabaseClient();
    const { data: experiment, error } = await supabase
      .from('experiments')
      .select('*')
      .or(`run_a_id.eq.${runId},run_b_id.eq.${runId}`)
      .maybeSingle();

    if (error) throw error;
    if (!experiment) return null;
    if (experiment.status === 'cancelled') return experiment as Experiment;

    if (!experiment.run_a_id || !experiment.run_b_id) {
      if (experiment.status !== 'running') {
        const { data, error: updateError } = await supabase
          .from('experiments')
          .update({ status: 'running' })
          .eq('id', experiment.id)
          .neq('status', 'cancelled')
          .select('*')
          .maybeSingle();
        if (updateError) throw updateError;
        return (data ?? experiment) as Experiment;
      }
      return experiment as Experiment;
    }

    const { data: runs, error: runsError } = await supabase
      .from('evaluation_runs')
      .select('id,status')
      .in('id', [experiment.run_a_id, experiment.run_b_id]);
    if (runsError) throw runsError;

    const statuses = new Map((runs ?? []).map((run) => [run.id, run.status]));
    const statusA = statuses.get(experiment.run_a_id);
    const statusB = statuses.get(experiment.run_b_id);

    let nextStatus: Experiment['status'] = 'running';
    if (statusA === 'cancelled' || statusB === 'cancelled') {
      nextStatus = 'cancelled';
    } else if (statusA === 'failed' || statusB === 'failed') {
      nextStatus = 'failed';
    } else if (statusA === 'completed' && statusB === 'completed') {
      nextStatus = 'completed';
    }

    if (experiment.status === nextStatus) return experiment as Experiment;

    const updates: Database['public']['Tables']['experiments']['Update'] = {
      status: nextStatus
    };
    if (nextStatus === 'cancelled') {
      updates.cancelled_at = experiment.cancelled_at ?? new Date().toISOString();
    }

    const { data: updated, error: updateError } = await supabase
      .from('experiments')
      .update(updates)
      .eq('id', experiment.id)
      .neq('status', 'cancelled')
      .select('*')
      .maybeSingle();
    if (updateError) throw updateError;
    return (updated ?? experiment) as Experiment;
  }
};
