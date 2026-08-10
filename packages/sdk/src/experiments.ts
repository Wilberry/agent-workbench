import { createServerSupabaseClient } from './supabaseClient';
import { evaluations } from './evaluations';
import type { Database, Experiment } from './types';
import type { SupabaseClient } from '@supabase/supabase-js';

export const experiments = {
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
          organization_id: payload.organizationId ?? null,
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
      experiment = await this.getExperiment(payload.experimentId, supabase);
      if (!experiment) throw new Error('Experiment not found');

      if (experiment.status === 'running' && experiment.run_a_id && experiment.run_b_id) {
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
            organization_id: payload.organizationId ?? null,
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
        .select('*')
        .single();

      if (updateError || !runningExperiment) {
        throw updateError ?? new Error('Failed to persist experiment evaluation runs');
      }

      return {
        experiment: runningExperiment as Experiment,
        runA: runA.run,
        runB: runB.run
      };
    } catch (error) {
      await supabase.from('experiments').update({ status: 'failed' }).eq('id', experiment.id);
      throw error;
    }
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

    if (!experiment.run_a_id || !experiment.run_b_id) {
      if (experiment.status !== 'running') {
        const { data, error: updateError } = await supabase
          .from('experiments')
          .update({ status: 'running' })
          .eq('id', experiment.id)
          .select('*')
          .single();
        if (updateError) throw updateError;
        return data as Experiment;
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
    if (statusA === 'failed' || statusB === 'failed') {
      nextStatus = 'failed';
    } else if (statusA === 'completed' && statusB === 'completed') {
      nextStatus = 'completed';
    }

    if (experiment.status === nextStatus) return experiment as Experiment;

    const { data: updated, error: updateError } = await supabase
      .from('experiments')
      .update({ status: nextStatus })
      .eq('id', experiment.id)
      .select('*')
      .single();
    if (updateError) throw updateError;
    return updated as Experiment;
  }
};
