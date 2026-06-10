import { createServerSupabaseClient } from '@agent-workbench/sdk';
import { processAgentRunJob } from '../packages/agent-runtime/src/worker';
import { agentRuns } from '../packages/sdk/src/agentRuns';

async function main() {
  const supabase = createServerSupabaseClient();

  console.log('Creating test run...');
  const { data: runRow, error: insertError } = await supabase
    .from('agent_runs')
    .insert([
      {
        user_id: 'e2e-test-user',
        conversation_id: 'e2e-test-conv',
        workflow: ['Planner', 'Executor', 'Reviewer'],
        status: 'pending'
      }
    ])
    .select('id')
    .single();

  if (insertError || !runRow) {
    console.error('Failed to create run row:', insertError);
    process.exit(2);
  }

  const runId = runRow.id as string;
  console.log('Run created:', runId);

  const job = {
    runId,
    userId: 'e2e-test-user',
    conversationId: 'e2e-test-conv',
    message: 'Hello from e2e smoke test',
    workflow: ['Planner', 'Executor', 'Reviewer'],
    memories: []
  } as const;

  console.log('Processing job in-process...');
  try {
    await processAgentRunJob(job as any);
  } catch (err) {
    console.error('Worker processing failed:', err);
    process.exit(3);
  }

  console.log('Fetching run replay payload...');
  try {
    const replay = await agentRuns.replay(runId);
    if (!replay) {
      console.error('Replay payload missing');
      process.exit(4);
    }

    console.log('Run status:', replay.status);
    console.log('Execution trace length:', (replay.execution_trace || []).length);

    if (replay.status !== 'completed') {
      console.error('Run not completed as expected');
      process.exit(5);
    }

    if (!Array.isArray(replay.execution_trace) || replay.execution_trace.length === 0) {
      console.error('No execution steps persisted');
      process.exit(6);
    }

    console.log('E2E smoke test succeeded');
    process.exit(0);
  } catch (err) {
    console.error('Failed to fetch replay payload:', err);
    process.exit(7);
  }
}

main();
