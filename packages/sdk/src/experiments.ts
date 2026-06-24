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

      const { error: statusError } = await supabase
        .from('experiments')
        .update({ status: 'running' })
        .eq('id', experiment.id);

      if (statusError) throw statusError;
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
            status: 'running'
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

      const runA = await evaluations.createEvaluationRun(userId, {
        datasetId,
        agentVersionId: versionAId,
        organizationId
      }, supabase);

      const runB = await evaluations.createEvaluationRun(userId, {
        datasetId,
        agentVersionId: versionBId,
        organizationId
      }, supabase);

      const { error: updateError } = await supabase
        .from('experiments')
        .update({
          status: 'completed',
          run_a_id: runA.run.id,
          run_b_id: runB.run.id
        })
        .eq('id', experiment.id);

      if (updateError) throw updateError;

      return {
        experiment: { ...experiment, status: 'completed', run_a_id: runA.run.id, run_b_id: runB.run.id } as Experiment,
        runA: runA.run,
        runB: runB.run
      };
    } catch (error) {
      await supabase.from('experiments').update({ status: 'failed' }).eq('id', experiment.id);
      throw error;
    }
  }
};
