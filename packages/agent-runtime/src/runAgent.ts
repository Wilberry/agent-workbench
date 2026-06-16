import type { Message } from '@agent-workbench/sdk';
import { createServerSupabaseClient } from '@agent-workbench/sdk';
import { generateEmbedding } from './embeddings';
import { getRelevantMemories } from './memory';
import { runTool, toolList } from './tools';
import { runMultiAgentWorkflow } from './agentRouter';

export type ExecutionTrace = {
  memoryUsed: boolean;
  toolsCalled: string[];
  modelIterations: number;
};

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';


async function callOpenAI(model: string, messages: Array<{ role: string; content: string }>) {
  if (!OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY is required for agent runtime');
  }

  const res = await fetch(OPENAI_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${OPENAI_API_KEY}`
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.7,
      max_tokens: 1200
    })
  });

  if (!res.ok) {
    throw new Error(`OpenAI request failed: ${res.status} ${await res.text()}`);
  }

  const payload = await res.json();
  return payload.choices?.[0]?.message?.content ?? '';
}

function formatMemoryContext(memories: Array<{ role: 'user' | 'assistant'; content: string; similarity: number }>) {
  if (memories.length === 0) {
    return 'No relevant memory was found for this conversation.';
  }

  return memories
    .map(
      (memory) =>
        `- ${memory.role === 'user' ? 'User said' : 'Assistant responded'}: ${memory.content} (Similarity: ${memory.similarity.toFixed(2)})`
    )
    .join('\n');
}

function buildSystemPrompt(agentPrompt: string, tools: typeof toolList, memoryContext: string) {
  const toolDescriptions = tools
    .map((tool) => `- ${tool.name}: ${tool.description}`)
    .join('\n');

  return `You are an AI agent inside a multi-agent workbench system.

You may:
- Use tools when needed.
- Use memory context to improve responses.
- Ask clarifying questions when the user request is ambiguous.

TOOLS AVAILABLE:
${toolDescriptions}

When calling a tool, respond exactly with the following format:
TOOL_CALL: {"name":"tool_name","args":{...}}
Only call a tool when necessary.

MEMORY CONTEXT:
${memoryContext}

CONVERSATION HISTORY:
${agentPrompt}`;
}

function parseToolCall(text: string) {
  const match = text.match(/TOOL_CALL:\s*({[\s\S]*})/);
  if (!match) return null;

  try {
    const toolCall = JSON.parse(match[1]);
    if (typeof toolCall.name !== 'string' || typeof toolCall.args !== 'object') {
      return null;
    }
    return toolCall as { name: string; args: Record<string, unknown> };
  } catch {
    return null;
  }
}

export async function runAgent({
  agentId,
  conversationId,
  userMessage,
  debug = false
}: {
  agentId: string;
  conversationId: string;
  userMessage: string;
  debug?: boolean;
}) {
  const supabase = createServerSupabaseClient();

  const { data: agent, error: agentError } = await supabase
    .from('agents')
    .select('system_prompt, model')
    .eq('id', agentId)
    .single();

  if (agentError || !agent) {
    throw agentError ?? new Error('Agent not found');
  }

  const { data: userMessageRow, error: userMessageError } = await supabase
    .from('messages')
    .insert([{ conversation_id: conversationId, role: 'user', content: userMessage }])
    .select('id')
    .single();

  if (userMessageError || !userMessageRow) {
    throw userMessageError ?? new Error('Failed to persist user message');
  }

  const userEmbeddingPromise = generateEmbedding(userMessage)
    .then((vector) =>
      supabase.from('messages').update({ embedding: vector }).eq('id', (userMessageRow as Pick<Message, 'id'>).id)
    )
    .catch((error) => {
      console.error('Failed to generate user message embedding:', error);
    });

  const { data: history, error: historyError } = await supabase
    .from('messages')
    .select('*')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true });

  if (historyError) {
    throw historyError;
  }

  const memories = await getRelevantMemories({ conversationId, query: userMessage });
  const memoryContext = formatMemoryContext(memories);
  const conversationHistory = ((history ?? []) as Message[]).map((message) => ({ role: message.role, content: message.content }));
  // Prefer agent version if available
  let selectedSystemPrompt = agent.system_prompt;
  let selectedModel = agent.model ?? 'gpt-4o-mini';
  let versionWorkflow: string[] | undefined = undefined;

  try {
    const { data: versionData, error: versionError } = await supabase
      .from('agent_versions')
      .select('*')
      .eq('agent_id', agentId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!versionError && versionData) {
      if (versionData.system_prompt) selectedSystemPrompt = versionData.system_prompt;
      if (versionData.metadata && typeof versionData.metadata.model === 'string') selectedModel = versionData.metadata.model;
      if (Array.isArray(versionData.workflow) && versionData.workflow.length > 0) versionWorkflow = versionData.workflow;
    }
  } catch (err) {
    // ignore version fetch errors and fall back to agent defaults
  }

  const baseSystemPrompt = buildSystemPrompt(selectedSystemPrompt, toolList, memoryContext);
  // Attempt to find a versioned agent configuration (prefer latest)
  try {
    const { data: versionData, error: versionError } = await supabase
      .from('agent_versions')
      .select('version, system_prompt, workflow, metadata')
      .eq('agent_id', agentId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (!versionError && versionData) {
      // Use version system_prompt if provided
      if (versionData.system_prompt) {
        // prepend version prompt to base prompt
        // keep tools list and memory context intact
      }
      // If workflow is defined in version, prefer it
      if (Array.isArray(versionData.workflow) && versionData.workflow.length > 0) {
        // override agentRoles later in runMultiAgent workflows when needed
      }
    }
  } catch (err) {
    // non-fatal
  }

  const messageBatch: Array<{ role: string; content: string }> = [
    { role: 'system', content: baseSystemPrompt },
    ...conversationHistory,
    { role: 'user', content: userMessage }
  ];

  const toolsCalled: string[] = [];
  let modelIterations = 0;
  let finalAssistantResponse = '';

  // If a version workflow is present, delegate to the multi-agent router
  if (Array.isArray(versionWorkflow) && versionWorkflow.length > 0) {
    const { data: userInfo } = await supabase.auth.getUser();
    const userId = userInfo?.user?.id ?? '';
    try {
      const result = await runMultiAgentWorkflow({
        userId,
        conversationId,
        message: userMessage,
        workflow: versionWorkflow,
        memories
      }, selectedModel);

      finalAssistantResponse = result.message;
      // merge trace info
      toolsCalled.push(...(result.trace.toolsCalled || []));
      modelIterations = result.trace.modelIterations || modelIterations;
    } catch (err) {
      console.error('Multi-agent workflow failed, falling back to single-agent:', err);
    }
  }

  // Fallback to single-agent loop if multi-agent did not produce a result
  if (!finalAssistantResponse) {
    let currentMessages = [...messageBatch];
    for (let iteration = 0; iteration < 3; iteration += 1) {
      modelIterations += 1;
      const assistantResponse = await callOpenAI(selectedModel, currentMessages);
      const toolCall = parseToolCall(assistantResponse);

      if (!toolCall) {
        finalAssistantResponse = assistantResponse;
        break;
      }

      toolsCalled.push(toolCall.name);
      const toolResult = await runTool(toolCall.name, toolCall.args);
      const toolResultText = JSON.stringify(toolResult, null, 2);

      currentMessages.push({ role: 'assistant', content: assistantResponse });
      currentMessages.push({ role: 'system', content: `Tool ${toolCall.name} executed. Result:
${toolResultText}` });
      currentMessages.push({ role: 'user', content: 'Continue the response using the tool result above.' });
    }
  }

  if (!finalAssistantResponse) {
    finalAssistantResponse = 'I was unable to complete the task after multiple tool executions.';
  }

  const trace: ExecutionTrace = {
    memoryUsed: memories.length > 0,
    toolsCalled,
    modelIterations
  };

  if (debug) {
    return new Response(JSON.stringify({ response: finalAssistantResponse, trace }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const textStream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();
      const chunkSize = 1024;
      for (let i = 0; i < finalAssistantResponse.length; i += chunkSize) {
        const chunk = finalAssistantResponse.slice(i, i + chunkSize);
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    }
  });

  const { data: assistantRow, error: assistantError } = await supabase
    .from('messages')
    .insert([{ conversation_id: conversationId, role: 'assistant', content: finalAssistantResponse }])
    .select('id')
    .single();

  if (assistantError || !assistantRow) {
    console.error('Failed to persist assistant message:', assistantError);
  } else {
    try {
      const assistantEmbedding = await generateEmbedding(finalAssistantResponse);
      await supabase.from('messages').update({ embedding: assistantEmbedding }).eq('id', (assistantRow as Pick<Message, 'id'>).id);
    } catch (error) {
      console.error('Failed to generate assistant embedding:', error);
    }
  }

  await userEmbeddingPromise;

  return new Response(textStream, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-store'
    }
  });
}
