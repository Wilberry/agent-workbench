import { createServerSupabaseClient, agents } from '@agent-workbench/sdk';
import { isProviderRequestError } from './llm/http';
import { LLMToolArgumentsError } from './llm/tooling';
import type { LLMMessage } from './llm/types';
import { resolveExecutionToolDefinitions } from './tools';
import {
  executeLLMToolLoop,
  LLMToolLoopLimitError,
  LLMToolNotAllowedError
} from './toolExecution';
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
import { persistTraceEvent } from './tracing';

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

function normalizeProviderName(provider?: string | null): string {
  return provider?.trim().toLowerCase() || 'openai';
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getExponentialBackoff(retryCount: number): number {
  return Math.pow(2, retryCount) * 1000; // 1s, 2s, 4s
}

function isNonRetryableToolContractError(error: unknown): boolean {
  return error instanceof LLMToolNotAllowedError || error instanceof LLMToolArgumentsError;
}

// NOTE: Step-level persistence and realtime broadcasts are handled by `persistExecutionStep` in queue.ts

export async function processAgentRunJob(job: AgentRunQueueJob): Promise<void> {
  const { runId, message, workflow, memories } = job;
  const supabase = createServerSupabaseClient();

  const persistEvent = async (eventType: string, payload: unknown) => {
    void persistTraceEvent(runId, eventType, payload).catch((err) => {
      console.warn('Failed to persist trace event', err);
    });
  };

  try {
    setProcessing(runId, true);

    const { data: existingRun, error: fetchError } = await supabase
      .from('agent_runs')
      .select('execution_trace, current_step, status, organization_id, agent_version_id')
      .eq('id', runId)
      .single();

    if (fetchError) {
      throw new Error(`Failed to fetch run state: ${fetchError.message}`);
    }

    let currentStep = existingRun?.current_step || 0;
    const pinnedAgentVersionId = existingRun?.agent_version_id ?? null;

    const { data: conversation, error: conversationError } = await supabase
      .from('conversations')
      .select('agent_id')
      .eq('id', job.conversationId)
      .single();

    const organizationId = existingRun?.organization_id ?? null;

    if (conversationError || !conversation) {
      throw new Error(`Conversation not found for id ${job.conversationId}`);
    }

    const agent = await agents.get(conversation.agent_id, supabase);
    const agentName = agent?.name ?? 'AI agent';
    let selectedSystemPrompt = agent?.system_prompt ? `Agent prompt:\n${agent.system_prompt}\n\n` : '';
    let selectedModel = (agent?.model as string | undefined) ?? 'gpt-4o-mini';
    let selectedProvider = normalizeProviderName(agent?.provider as string | undefined);
    let versionWorkflow: string[] | undefined;
    let versionTools: unknown = undefined;

    if (pinnedAgentVersionId) {
      try {
        const pinnedVersion = await agents.getVersion(pinnedAgentVersionId, supabase);
        if (pinnedVersion) {
          if (pinnedVersion.system_prompt) {
            selectedSystemPrompt = `Agent prompt:\n${pinnedVersion.system_prompt}\n\n`;
          }
          if (pinnedVersion.model) {
            selectedModel = pinnedVersion.model;
          }
          if (pinnedVersion.provider) {
            selectedProvider = normalizeProviderName(pinnedVersion.provider);
          }
          if (Array.isArray(pinnedVersion.workflow) && pinnedVersion.workflow.length > 0) {
            versionWorkflow = pinnedVersion.workflow;
          }
          if (Array.isArray(pinnedVersion.tools) && pinnedVersion.tools.length > 0) {
            versionTools = pinnedVersion.tools;
          }
        }
      } catch (err) {
        console.warn(`Failed to load pinned agent version ${pinnedAgentVersionId}:`, err);
      }
    }

    const baseAgentPrompt = selectedSystemPrompt;
    const agentModel = selectedModel;
    const agentProvider = selectedProvider;
    const effectiveWorkflow = versionWorkflow ?? job.workflow;
    const ownerUserId = agent?.user_id ?? null;
    const availableTools = await resolveExecutionToolDefinitions({
      versionTools,
      organizationId,
      ownerUserId,
      client: supabase
    });

    void persistEvent('run_started', {
      workflow: effectiveWorkflow,
      message,
      organizationId,
      provider: agentProvider,
      model: agentModel,
      tools: availableTools.map((tool) => tool.name)
    });

    await supabase.from('agent_runs').update({ status: 'running' }).eq('id', runId);

    const memoryContext = formatMemoryContext(memories);
    const episode: string[] = [];
    let lastAgentOutput = '';
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let totalTokens = 0;
    let totalEstimatedCost = 0;
    let totalLatencyMs = 0;
    let lastProviderName: string | undefined;
    let lastModelName: string | undefined;

    for (let stepIndex = currentStep; stepIndex < effectiveWorkflow.length; stepIndex += 1) {
      const role = effectiveWorkflow[stepIndex]!;
      const toolsCalled: string[] = [];
      let stepFailed = false;
      let stepError: string | null = null;
      let stepCause: unknown = null;

      // Non-provider failures retain the legacy step retry loop. Provider
      // transport failures already exhausted their bounded HTTP retries and
      // are delegated to the durable queue layer below.
      for (let retryAttempt = 0; retryAttempt <= MAX_RETRIES; retryAttempt += 1) {
        try {
          const rolePrompt: LLMMessage[] = [
            {
              role: 'system',
              content: `${baseAgentPrompt}You are ${role}. ${roleDescription(role)} Use available memory and tools when appropriate.`
            },
            {
              role: 'user',
              content: `Agent: ${agentName}\n\nUser task: ${message}\n\nMemory context:\n${memoryContext}\n\nPrevious agent output:\n${episode.join('\n')}\n\nRespond with your assigned role output.`
            }
          ];

          const roleResult = await executeLLMToolLoop({
            provider: agentProvider,
            model: agentModel,
            messages: rolePrompt,
            tools: availableTools,
            runId,
            organizationId,
            ownerUserId,
            maxToolRounds: 2,
            onToolExecuted(record) {
              void persistEvent('tool_call', {
                stepIndex,
                toolName: record.call.name,
                status: 'success',
                input: record.call.arguments,
                output: record.result,
                latency_ms: record.latency_ms,
                mode: record.mode
              });
            }
          });

          const finalOutput = roleResult.content;
          toolsCalled.push(...roleResult.toolsCalled);
          totalInputTokens += roleResult.prompt_tokens;
          totalOutputTokens += roleResult.completion_tokens;
          totalTokens += roleResult.total_tokens;
          totalEstimatedCost += roleResult.estimated_cost;
          totalLatencyMs += roleResult.latency_ms;
          lastProviderName = roleResult.provider_name ?? agentProvider;
          lastModelName = roleResult.model_name;
          await updateRunTelemetry(runId, {
            input_tokens: totalInputTokens,
            output_tokens: totalOutputTokens,
            total_tokens: totalTokens,
            estimated_cost: totalEstimatedCost,
            latency_ms: totalLatencyMs,
            provider_name: lastProviderName,
            model_name: lastModelName
          });

          const stepTokens = roleResult.total_tokens;
          const stepLatencyMs = roleResult.latency_ms;

          episode.push(`${role.toUpperCase()} OUTPUT:\n${finalOutput}`);
          lastAgentOutput = finalOutput;

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
          void persistEvent('step_completed', {
            stepIndex,
            step: role,
            status: 'completed',
            output: finalOutput,
            provider: lastProviderName,
            model: lastModelName,
            tokens: stepTokens,
            latency_ms: stepLatencyMs,
            toolName: toolsCalled[0] ?? null,
            toolsCalled
          });

          stepFailed = false;
          break;
        } catch (error) {
          stepCause = error;
          stepError = error instanceof Error ? error.message : String(error);
          stepFailed = true;

          if (isProviderRequestError(error)) {
            console.error(
              `Step ${stepIndex} (${role}) provider request failed after ${error.attempts} transport attempt(s):`,
              stepError
            );
            break;
          }

          if (isNonRetryableToolContractError(error) || error instanceof LLMToolLoopLimitError) {
            console.error(`Step ${stepIndex} (${role}) tool contract failed:`, stepError);
            break;
          }

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
        void persistEvent('step_failed', {
          stepIndex,
          step: role,
          error: stepError,
          provider: lastProviderName ?? agentProvider,
          model: lastModelName ?? agentModel,
          toolName: toolsCalled[0] ?? null,
          toolsCalled
        });

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
            model: lastModelName ?? agentModel,
            tokens: undefined,
            toolName: toolsCalled[0]
          }
        };

        await persistExecutionStep(runId, errorExecStep);
        // persistExecutionStep keeps the failed attempt in the trace, but its
        // legacy cursor update must not make durable recovery skip this role.
        await supabase.from('agent_runs').update({ current_step: stepIndex }).eq('id', runId);

        if (stepCause instanceof Error) throw stepCause;
        throw new Error(`Workflow failed at step ${stepIndex}: ${stepError}`);
      }
      currentStep = stepIndex + 1;
    }

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

    void persistEvent('run_completed', {
      total_steps: effectiveWorkflow.length,
      total_tokens: totalTokens,
      estimated_cost: totalEstimatedCost,
      latency_ms: totalLatencyMs,
      provider_name: lastProviderName ?? agentProvider,
      model_name: lastModelName ?? agentModel
    });
    await markRunCompleted(runId);
    await markQueueJobCompleted(runId);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    void persistEvent('run_failed', {
      error: errorMessage,
      provider: isProviderRequestError(error) ? error.provider : undefined,
      request_id: isProviderRequestError(error) ? error.requestId : undefined
    });
    console.error('Workflow execution failed:', errorMessage);

    if (isProviderRequestError(error) && !error.retryable) {
      try {
        await markQueueJobFailed(runId, errorMessage);
        await markRunFailed(runId, `Non-retryable provider failure: ${errorMessage}`);
      } catch (qErr) {
        console.warn('Failed to mark non-retryable provider failure terminal:', qErr);
      }
      throw error;
    }

    if (isNonRetryableToolContractError(error)) {
      try {
        await markQueueJobFailed(runId, errorMessage);
        await markRunFailed(runId, `Non-retryable tool contract failure: ${errorMessage}`);
      } catch (qErr) {
        console.warn('Failed to mark non-retryable tool contract failure terminal:', qErr);
      }
      throw error;
    }

    try {
      const { attempts, maxAttempts, isDead } = await incrementAttemptsAndMaybeDead(runId, errorMessage);
      if (isDead) {
        await markRunFailed(runId, `Job failed after ${attempts}/${maxAttempts} attempts: ${errorMessage}`);
      } else {
        await supabase
          .from('agent_runs')
          .update({ status: 'pending', error_message: null })
          .eq('id', runId);
      }
    } catch (qErr) {
      console.warn('Failed to update job attempts/queue state:', qErr);
    }
    throw error;
  } finally {
    setProcessing(runId, false);
  }
}

export async function startBackgroundWorker(): Promise<void> {
  const { dequeueAgentRun } = await import('./queue');

  const worker = async () => {
    while (true) {
      try {
        const job = await dequeueAgentRun();
        if (!job) {
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

  void worker();
}
