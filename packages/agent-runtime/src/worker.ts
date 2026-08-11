import { createServerSupabaseClient, agents } from '@agent-workbench/sdk';
import { isProviderRequestError } from './llm/http';
import { LLMToolArgumentsError } from './llm/tooling';
import type { LLMMessage } from './llm/types';
import { resolveExecutionToolDefinitions } from './tools';
import {
  executeLLMToolLoop,
  LLMToolCheckpointError,
  LLMToolContinuationError,
  LLMToolExecutionError,
  LLMToolLoopLimitError,
  LLMToolNotAllowedError,
  type LLMToolLoopCheckpoint
} from './toolExecution';
import {
  AgentExecutionCancelledError,
  isAgentExecutionCancelledError,
  registerActiveRun,
  throwIfAborted
} from './cancellation';
import { generateEmbedding } from './embeddings';
import { randomUUID } from 'crypto';
import {
  type AgentRunQueueJob,
  clearRunCheckpoint,
  getRunCheckpoint,
  incrementAttemptsAndMaybeDead,
  markQueueJobCancelled,
  markQueueJobCompleted,
  markQueueJobFailed,
  markRunCancelled,
  markRunCompleted,
  markRunFailed,
  persistExecutionStep,
  persistRunCheckpoint,
  rebuildWorkflowEpisode,
  reclaimStaleJobs,
  setProcessing,
  updateRunTelemetry,
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
  if (memories.length === 0) return 'No relevant memory found for this request.';
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

async function sleepWithSignal(ms: number, signal: AbortSignal): Promise<void> {
  throwIfAborted(signal);
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new AgentExecutionCancelledError(
        typeof signal.reason === 'string' && signal.reason.trim()
          ? signal.reason.trim()
          : 'Agent run cancelled'
      ));
    };
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

function getExponentialBackoff(retryCount: number): number {
  return Math.pow(2, retryCount) * 1000;
}

function isNonRetryableToolContractError(error: unknown): boolean {
  if (error instanceof LLMToolContinuationError) return !error.resumeSafe;
  return error instanceof LLMToolNotAllowedError ||
    error instanceof LLMToolArgumentsError ||
    error instanceof LLMToolExecutionError ||
    error instanceof LLMToolCheckpointError ||
    error instanceof LLMToolLoopLimitError;
}

function lastCompletedOutput(trace: unknown, currentStep: number): string {
  if (!Array.isArray(trace) || currentStep <= 0) return '';
  const completed = trace.filter((entry: any) =>
    entry?.status === 'completed' &&
    entry?.step !== 'checkpoint' &&
    entry?.step !== 'tool' &&
    entry?.step !== 'memory' &&
    entry?.step !== 'error' &&
    typeof entry?.output === 'string'
  );
  const indexed = completed
    .filter((entry: any) => typeof entry?.metadata?.stepIndex === 'number' && entry.metadata.stepIndex < currentStep)
    .sort((a: any, b: any) => a.metadata.stepIndex - b.metadata.stepIndex);
  const selected = indexed.length > 0 ? indexed : completed.slice(0, currentStep);
  return selected[selected.length - 1]?.output ?? '';
}

async function assertRunActive(
  supabase: ReturnType<typeof createServerSupabaseClient>,
  runId: string,
  signal: AbortSignal
): Promise<void> {
  throwIfAborted(signal);
  const runtimeClient = supabase as any;
  const { data: run, error } = await runtimeClient
    .from('agent_runs')
    .select('status,cancellation_reason')
    .eq('id', runId)
    .single();
  if (error || !run) throw error ?? new Error('Agent run not found');
  if (String(run.status) === 'cancelled') {
    throw new AgentExecutionCancelledError(
      typeof run.cancellation_reason === 'string' && run.cancellation_reason.trim()
        ? run.cancellation_reason
        : 'Agent run cancelled'
    );
  }
  throwIfAborted(signal);
}

export async function processAgentRunJob(job: AgentRunQueueJob): Promise<void> {
  const { runId, message, workflow, memories } = job;
  const supabase = createServerSupabaseClient();
  const runtimeClient = supabase as any;
  const executionController = new AbortController();
  const unregisterActive = registerActiveRun(runId, executionController);

  const persistEvent = async (eventType: string, payload: unknown) => {
    void persistTraceEvent(runId, eventType, payload).catch((err) => {
      console.warn('Failed to persist trace event', err);
    });
  };

  try {
    setProcessing(runId, true);

    const { data: existingRun, error: fetchError } = await runtimeClient
      .from('agent_runs')
      .select('execution_trace,current_step,status,organization_id,agent_version_id,input_tokens,output_tokens,total_tokens,estimated_cost,latency_ms,provider_name,model_name,cancellation_reason')
      .eq('id', runId)
      .single();

    if (fetchError || !existingRun) {
      throw new Error(`Failed to fetch run state: ${fetchError?.message ?? 'not found'}`);
    }
    if (String(existingRun.status) === 'cancelled') {
      await markQueueJobCancelled(runId, existingRun.cancellation_reason ?? 'Cancelled');
      return;
    }

    let currentStep = Number(existingRun.current_step ?? 0);
    const pinnedAgentVersionId = existingRun.agent_version_id ?? null;

    const { data: conversation, error: conversationError } = await supabase
      .from('conversations')
      .select('agent_id')
      .eq('id', job.conversationId)
      .single();

    const organizationId = existingRun.organization_id ?? null;
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
          if (pinnedVersion.model) selectedModel = pinnedVersion.model;
          if (pinnedVersion.provider) selectedProvider = normalizeProviderName(pinnedVersion.provider);
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

    await assertRunActive(supabase, runId, executionController.signal);
    void persistEvent('run_started', {
      workflow: effectiveWorkflow,
      message,
      organizationId,
      provider: agentProvider,
      model: agentModel,
      tools: availableTools.map((tool) => tool.name),
      resumed_from_step: currentStep
    });

    const { data: claimedRun, error: runningError } = await runtimeClient
      .from('agent_runs')
      .update({ status: 'running' })
      .eq('id', runId)
      .in('status', ['pending', 'running'])
      .select('id')
      .maybeSingle();
    if (runningError) throw runningError;
    if (!claimedRun) {
      await assertRunActive(supabase, runId, executionController.signal);
      throw new Error('Agent run is not executable');
    }

    const memoryContext = formatMemoryContext(memories);
    const episode = rebuildWorkflowEpisode(existingRun.execution_trace, currentStep);
    let lastAgentOutput = lastCompletedOutput(existingRun.execution_trace, currentStep);
    let totalInputTokens = Number(existingRun.input_tokens ?? 0);
    let totalOutputTokens = Number(existingRun.output_tokens ?? 0);
    let totalTokens = Number(existingRun.total_tokens ?? 0);
    let totalEstimatedCost = Number(existingRun.estimated_cost ?? 0);
    let totalLatencyMs = Number(existingRun.latency_ms ?? 0);
    let lastProviderName: string | undefined = existingRun.provider_name ?? undefined;
    let lastModelName: string | undefined = existingRun.model_name ?? undefined;

    for (let stepIndex = currentStep; stepIndex < effectiveWorkflow.length; stepIndex += 1) {
      await assertRunActive(supabase, runId, executionController.signal);
      const role = effectiveWorkflow[stepIndex]!;
      let toolsCalled: string[] = [];
      let stepFailed = false;
      let stepError: string | null = null;
      let stepCause: unknown = null;
      let resumeCheckpoint: LLMToolLoopCheckpoint | undefined = getRunCheckpoint(
        existingRun.execution_trace,
        stepIndex,
        role
      );

      for (let retryAttempt = 0; retryAttempt <= MAX_RETRIES; retryAttempt += 1) {
        try {
          await assertRunActive(supabase, runId, executionController.signal);
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

          const inputBeforeStep = Math.max(0, totalInputTokens - Number(resumeCheckpoint?.prompt_tokens ?? 0));
          const outputBeforeStep = Math.max(0, totalOutputTokens - Number(resumeCheckpoint?.completion_tokens ?? 0));
          const tokensBeforeStep = Math.max(0, totalTokens - Number(resumeCheckpoint?.total_tokens ?? 0));
          const costBeforeStep = Math.max(0, totalEstimatedCost - Number(resumeCheckpoint?.estimated_cost ?? 0));
          const latencyBeforeStep = Math.max(0, totalLatencyMs - Number(resumeCheckpoint?.latency_ms ?? 0));

          const roleResult = await executeLLMToolLoop({
            provider: agentProvider,
            model: agentModel,
            messages: rolePrompt,
            tools: availableTools,
            runId,
            organizationId,
            ownerUserId,
            agentId: conversation.agent_id,
            conversationId: job.conversationId,
            maxToolRounds: 2,
            signal: executionController.signal,
            resumeFrom: resumeCheckpoint,
            assertActive: () => assertRunActive(supabase, runId, executionController.signal),
            async onCheckpoint(checkpoint) {
              await persistRunCheckpoint(runId, stepIndex, role, checkpoint);
              resumeCheckpoint = checkpoint;
            },
            async onModelResponse(_response, aggregate) {
              lastProviderName = aggregate.provider_name ?? agentProvider;
              lastModelName = aggregate.model_name ?? agentModel;
              await updateRunTelemetry(runId, {
                input_tokens: inputBeforeStep + aggregate.prompt_tokens,
                output_tokens: outputBeforeStep + aggregate.completion_tokens,
                total_tokens: tokensBeforeStep + aggregate.total_tokens,
                estimated_cost: costBeforeStep + aggregate.estimated_cost,
                latency_ms: latencyBeforeStep + aggregate.latency_ms,
                provider_name: lastProviderName,
                model_name: lastModelName
              });
            },
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

          if (roleResult.resumeCheckpoint) resumeCheckpoint = roleResult.resumeCheckpoint;
          await assertRunActive(supabase, runId, executionController.signal);
          const finalOutput = roleResult.content;
          toolsCalled = [...roleResult.toolsCalled];
          totalInputTokens = inputBeforeStep + roleResult.prompt_tokens;
          totalOutputTokens = outputBeforeStep + roleResult.completion_tokens;
          totalTokens = tokensBeforeStep + roleResult.total_tokens;
          totalEstimatedCost = costBeforeStep + roleResult.estimated_cost;
          totalLatencyMs = latencyBeforeStep + roleResult.latency_ms;
          lastProviderName = roleResult.provider_name ?? agentProvider;
          lastModelName = roleResult.model_name ?? agentModel;

          const stepTokens = roleResult.total_tokens;
          const stepLatencyMs = roleResult.latency_ms;
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
              latency_ms: stepLatencyMs,
              stepIndex,
              role
            }
          };

          await persistExecutionStep(runId, execStep);
          await clearRunCheckpoint(runId, stepIndex);
          resumeCheckpoint = undefined;

          episode.push(`${role.toUpperCase()} OUTPUT:\n${finalOutput}`);
          lastAgentOutput = finalOutput;
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
          if (isAgentExecutionCancelledError(error)) throw error;

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

          if (error instanceof LLMToolContinuationError) {
            console.error(
              `Step ${stepIndex} (${role}) provider continuation failed; resumeSafe=${error.resumeSafe}:`,
              stepError
            );
            break;
          }

          if (isNonRetryableToolContractError(error)) {
            console.error(`Step ${stepIndex} (${role}) tool contract failed:`, stepError);
            break;
          }

          if (retryAttempt < MAX_RETRIES) {
            const backoffMs = getExponentialBackoff(retryAttempt);
            console.log(
              `Step ${stepIndex} (${role}) failed, retrying in ${backoffMs}ms (attempt ${retryAttempt + 1}/${MAX_RETRIES})`
            );
            await sleepWithSignal(backoffMs, executionController.signal);
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
          toolsCalled,
          resumable: stepCause instanceof LLMToolContinuationError ? stepCause.resumeSafe : false
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
            toolName: toolsCalled[0],
            stepIndex,
            role
          }
        };

        await persistExecutionStep(runId, errorExecStep);

        if (stepCause instanceof Error) throw stepCause;
        throw new Error(`Workflow failed at step ${stepIndex}: ${stepError}`);
      }
      currentStep = stepIndex + 1;
    }

    await assertRunActive(supabase, runId, executionController.signal);
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

    await assertRunActive(supabase, runId, executionController.signal);
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

    if (isAgentExecutionCancelledError(error)) {
      void persistEvent('run_cancelled', { reason: errorMessage });
      await Promise.allSettled([
        markRunCancelled(runId, errorMessage),
        markQueueJobCancelled(runId, errorMessage)
      ]);
      return;
    }

    void persistEvent('run_failed', {
      error: errorMessage,
      provider: isProviderRequestError(error) ? error.provider : undefined,
      request_id: isProviderRequestError(error) ? error.requestId : undefined,
      resumable: error instanceof LLMToolContinuationError ? error.resumeSafe : undefined
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
        const prefix = error instanceof LLMToolCheckpointError
          ? 'Non-retryable execution checkpoint failure'
          : 'Non-retryable tool failure';
        await markRunFailed(runId, `${prefix}: ${errorMessage}`);
      } catch (qErr) {
        console.warn('Failed to mark non-retryable runtime failure terminal:', qErr);
      }
      throw error;
    }

    try {
      const { attempts, maxAttempts, isDead, wasCancelled } = await incrementAttemptsAndMaybeDead(runId, errorMessage);
      if (wasCancelled) {
        await markRunCancelled(runId, errorMessage);
        return;
      }
      if (isDead) {
        await markRunFailed(runId, `Job failed after ${attempts}/${maxAttempts} attempts: ${errorMessage}`);
      } else {
        await runtimeClient
          .from('agent_runs')
          .update({ status: 'pending', error_message: null })
          .eq('id', runId)
          .neq('status', 'cancelled');
      }
    } catch (qErr) {
      console.warn('Failed to update job attempts/queue state:', qErr);
    }
    throw error;
  } finally {
    unregisterActive();
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
