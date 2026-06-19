import { createServerSupabaseClient } from '@agent-workbench/sdk';
import { chatCompletion } from './llm/client';
import { runTool } from './tools';
import { generateEmbedding } from './embeddings';
import { randomUUID } from 'crypto';
import {
  type AgentRunQueueJob,
  persistExecutionStep,
  markRunCompleted,
  markRunFailed,
  markQueueJobCompleted,
  markQueueJobFailed,
  incrementAttemptsAndMaybeDead,
  reclaimStaleJobs,
  updateRunTelemetry,
  setProcessing,
  type ExecutionStep
} from './queue';

const MAX_RETRIES = 3;

function roleDescription(role: string): string {
  switch (role.toLowerCase()) {
    case 'planner':
      return 'You break the user task into concise, ordered steps that an executor can follow.';
    case 'executor':
      return 'You execute the plan and generate a practical result or analysis based on the user goal.';
    case 'reviewer':
      return 'You verify the executor output, improve it if needed, and provide a final, polished response.';
    default:
      return `You act as ${role} within a multi-agent orchestration pipeline.`;
  }
}

function formatMemoryContext(
  memories: Array<{ role: 'user' | 'assistant'; content: string; similarity: number }> = []
): string {
  if (memories.length === 0) {
    return 'No relevant memory found for this request.';
  }

  return memories
    .map(
      (memory) =>
        `- ${memory.role === 'user' ? 'User said' : 'Assistant responded'}: ${memory.content} (Similarity: ${memory.similarity.toFixed(2)})`
    )
    .join('\n');
}

function parseToolCall(text: string) {
  const match = text.match(/TOOL_CALL:\s*({[\s\S]*})/);
  if (!match) return null;

  try {
    const parsed = JSON.parse(match[1]);
    if (typeof parsed.name !== 'string' || typeof parsed.args !== 'object' || parsed.args === null) {
      return null;
    }
    return parsed as { name: string; args: Record<string, unknown> };
  } catch {
    return null;
  }
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getExponentialBackoff(retryCount: number): number {
  return Math.pow(2, retryCount) * 1000; // 1s, 2s, 4s
}

// NOTE: Step-level persistence and realtime broadcasts are handled by `persistExecutionStep` in queue.ts

export async function processAgentRunJob(job: AgentRunQueueJob): Promise<void> {
  const { runId, message, workflow, memories } = job;
  const supabase = createServerSupabaseClient();

  try {
    setProcessing(runId, true);

    // Fetch current run to get existing trace (for recovery)
    const { data: existingRun, error: fetchError } = await supabase
      .from('agent_runs')
      .select('execution_trace, current_step, status, organization_id')
      .eq('id', runId)
      .single();

    if (fetchError) {
      throw new Error(`Failed to fetch run state: ${fetchError.message}`);
    }

    const existingTrace = (existingRun?.execution_trace as Array<Record<string, unknown>>) || [];
    let currentStep = existingRun?.current_step || 0;

    const { data: conversation, error: conversationError } = await supabase
      .from('conversations')
      .select('agent_id')
      .eq('id', job.conversationId)
      .single();

    const organizationId = existingRun?.organization_id ?? null;

    if (conversationError || !conversation) {
      throw new Error(`Conversation not found for id ${job.conversationId}`);
    }

    const { data: agent, error: agentError } = await supabase
      .from('agents')
      .select('name, system_prompt, model')
      .eq('id', conversation.agent_id)
      .single();

    if (agentError) {
      throw new Error(`Failed to load agent configuration: ${agentError.message}`);
    }

    const agentName = agent?.name ?? 'AI agent';
    const baseAgentPrompt = agent?.system_prompt ? `Agent prompt:\n${agent.system_prompt}\n\n` : '';
    const agentModel = (agent?.model as string | undefined) ?? 'gpt-4o-mini';

    // Update status to running
    await supabase.from('agent_runs').update({ status: 'running' }).eq('id', runId);

    const memoryContext = formatMemoryContext(memories);
    const episode: string[] = [];
    let allToolsCalled: string[] = [];
    let totalIterations = 0;
    let lastAgentOutput = '';
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let totalTokens = 0;
    let totalEstimatedCost = 0;
    let totalLatencyMs = 0;
    let lastModelName: string | undefined;

    // Resume from current_step in case of restart
    for (let stepIndex = currentStep; stepIndex < workflow.length; stepIndex += 1) {
      const role = workflow[stepIndex]!;
      const toolsCalled: string[] = [];
      let modelIterations = 0;
      let stepFailed = false;
      let stepError: string | null = null;

      // Retry logic for this step
      for (let retryAttempt = 0; retryAttempt <= MAX_RETRIES; retryAttempt += 1) {
        try {
          const rolePrompt = [
            {
              role: 'system',
              content: `${baseAgentPrompt}You are ${role}. ${roleDescription(role)} Use available memory and tools when appropriate.`
            },
            {
              role: 'user',
              content: `Agent: ${agentName}

User task: ${message}

Memory context:
${memoryContext}

Previous agent output:
${episode.join('\n')}

Respond with your assigned role output.`
            }
          ];

          const agentResult = await chatCompletion({
            model: agentModel,
            messages: rolePrompt,
            temperature: 0.7,
            max_tokens: 1200
          });
          let agentOutput = agentResult.content;
          modelIterations += 1;
          totalIterations += 1;
          let finalOutput = agentOutput;
          totalInputTokens += agentResult.prompt_tokens;
          totalOutputTokens += agentResult.completion_tokens;
          totalTokens += agentResult.total_tokens;
          totalEstimatedCost += agentResult.estimated_cost;
          totalLatencyMs += agentResult.latency_ms;
          lastModelName = agentResult.model_name;
          await updateRunTelemetry(runId, {
            input_tokens: totalInputTokens,
            output_tokens: totalOutputTokens,
            total_tokens: totalTokens,
            estimated_cost: totalEstimatedCost,
            latency_ms: totalLatencyMs,
            model_name: lastModelName
          });

          let stepTokens = agentResult.total_tokens;
          let stepLatencyMs = agentResult.latency_ms;

          const toolCall = parseToolCall(agentOutput);
          if (toolCall) {
            toolsCalled.push(toolCall.name);
            allToolsCalled.push(toolCall.name);

            const toolResult = await runTool(toolCall.name, toolCall.args, runId, organizationId);
            const toolPrompt = [
              ...rolePrompt,
              {
                role: 'system',
                content: `Tool ${toolCall.name} executed. Result:
${JSON.stringify(toolResult, null, 2)}`
              },
              {
                role: 'user',
                content: 'Use the tool result to continue your role output and complete the task.'
              }
            ];

            const toolResultOutput = await chatCompletion({
              model: agentModel,
              messages: toolPrompt,
              temperature: 0.7,
              max_tokens: 1200
            });
            finalOutput = toolResultOutput.content;
            modelIterations += 1;
            totalIterations += 1;
            totalInputTokens += toolResultOutput.prompt_tokens;
            totalOutputTokens += toolResultOutput.completion_tokens;
            totalTokens += toolResultOutput.total_tokens;
            totalEstimatedCost += toolResultOutput.estimated_cost;
            totalLatencyMs += toolResultOutput.latency_ms;
            lastModelName = toolResultOutput.model_name;
            await updateRunTelemetry(runId, {
              input_tokens: totalInputTokens,
              output_tokens: totalOutputTokens,
              total_tokens: totalTokens,
              estimated_cost: totalEstimatedCost,
              latency_ms: totalLatencyMs,
              model_name: lastModelName
            });
            stepTokens += toolResultOutput.total_tokens;
            stepLatencyMs += toolResultOutput.latency_ms;
          }

          episode.push(`${role.toUpperCase()} OUTPUT:\n${finalOutput}`);
          lastAgentOutput = finalOutput;

          // Build rich execution step and persist it (this will also broadcast via Supabase)
          const execStep: ExecutionStep = {
            id: randomUUID(),
            run_id: runId,
            step: role.toLowerCase() as ExecutionStep['step'],
            status: 'completed',
            input: message,
            output: finalOutput,
            timestamp: new Date().toISOString(),
            metadata: {
              model: lastModelName,
              tokens: stepTokens,
              toolName: toolsCalled[0],
              latency_ms: stepLatencyMs
            }
          };

          await persistExecutionStep(runId, execStep);

          // Step succeeded, break retry loop
          stepFailed = false;
          break;
        } catch (error) {
          stepError = error instanceof Error ? error.message : String(error);
          stepFailed = true;

          if (retryAttempt < MAX_RETRIES) {
            const backoffMs = getExponentialBackoff(retryAttempt);
            console.log(
              `Step ${stepIndex} (${role}) failed, retrying in ${backoffMs}ms (attempt ${retryAttempt + 1}/${MAX_RETRIES})`
            );
            await sleep(backoffMs);
          } else {
            console.error(`Step ${stepIndex} (${role}) failed after ${MAX_RETRIES} retries:`, stepError);
          }
        }
      }

      if (stepFailed) {
        // Persist error step and broadcast
        const errorExecStep: ExecutionStep = {
          id: randomUUID(),
          run_id: runId,
          step: role.toLowerCase() as ExecutionStep['step'],
          status: 'failed',
          input: message,
          output: '',
          error: stepError || undefined,
          timestamp: new Date().toISOString(),
          metadata: {
            model: lastModelName,
            tokens: undefined,
            toolName: toolsCalled[0]
          }
        };

        await persistExecutionStep(runId, errorExecStep);
        await markRunFailed(runId, `Step ${stepIndex} (${role}) failed after ${MAX_RETRIES} retries: ${stepError}`);
        await markQueueJobFailed(runId, stepError ?? `Step ${stepIndex} (${role}) failed`);
        setProcessing(runId, false);
        throw new Error(`Workflow failed at step ${stepIndex}`);
      }

      currentStep = stepIndex + 1;
    }

    // Persist the final assistant response to conversation history
    if (lastAgentOutput) {
      const { data: assistantRow, error: assistantError } = await supabase
        .from('messages')
        .insert([{ conversation_id: job.conversationId, role: 'assistant', content: lastAgentOutput }])
        .select('id')
        .single();

      if (assistantError || !assistantRow) {
        console.error('Failed to persist assistant message:', assistantError);
      } else {
        try {
          const assistantEmbedding = await generateEmbedding(lastAgentOutput);
          await supabase.from('messages').update({ embedding: assistantEmbedding }).eq('id', assistantRow.id);
        } catch (error) {
          console.error('Failed to generate assistant embedding:', error);
        }
      }
    }

    // Mark complete
    await markRunCompleted(runId);
    await markQueueJobCompleted(runId);
    setProcessing(runId, false);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('Workflow execution failed:', errorMessage);
    try {
      const { attempts, maxAttempts, isDead } = await incrementAttemptsAndMaybeDead(runId, errorMessage);
      if (isDead) {
        await markRunFailed(runId, `Job failed after ${attempts}/${maxAttempts} attempts: ${errorMessage}`);
      }
    } catch (qErr) {
      console.warn('Failed to update job attempts/queue state:', qErr);
    }
    throw error;
  }
}

export async function startBackgroundWorker(): Promise<void> {
  const { dequeueAgentRun } = await import('./queue');

  const worker = async () => {
    while (true) {
      try {
        const job = await dequeueAgentRun();
        if (!job) {
          // no jobs - attempt to reclaim any stale jobs periodically
          await reclaimStaleJobs().catch(() => {});
          await sleep(1000);
          continue;
        }

        await processAgentRunJob(job);
      } catch (error) {
        console.error('Background worker error:', error);
        await sleep(5000);
      }
    }
  };

  worker();
}
