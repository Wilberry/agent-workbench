import { runTool } from './tools';

export type ExecutionTrace = {
  memoryUsed: boolean;
  toolsCalled: string[];
  modelIterations: number;
  agentsUsed: string[];
};

type MemorySnippet = {
  role: 'user' | 'assistant';
  content: string;
  similarity: number;
};

type AgentWorkflowInput = {
  userId: string;
  conversationId: string;
  message: string;
  workflow?: string[];
  memories?: MemorySnippet[];
};

export type AgentWorkflowResult = {
  message: string;
  trace: ExecutionTrace;
};

const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;


export async function callOpenAI(messages: Array<{ role: string; content: string }>, model = 'gpt-4o-mini') {
  if (!OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY is required for multi-agent workflows');
  }

  const res = await fetch(OPENAI_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${OPENAI_API_KEY}`
    },
    body: JSON.stringify({ model, messages, temperature: 0.7, max_tokens: 1200 })
  });

  if (!res.ok) {
    throw new Error(`OpenAI request failed: ${res.status} ${await res.text()}`);
  }

  const payload = await res.json();
  return payload.choices?.[0]?.message?.content ?? '';
}

function formatMemoryContext(memories: MemorySnippet[] = []) {
  if (memories.length === 0) {
    return 'No relevant memory found for this request.';
  }

  return memories
    .map((memory) =>
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

function roleDescription(role: string) {
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

export async function runMultiAgentWorkflow(
  { userId, conversationId, message, workflow, memories = [] }: AgentWorkflowInput,
  modelOverride?: string
): Promise<AgentWorkflowResult> {
  const agentRoles = workflow && workflow.length > 0 ? workflow : ['Planner', 'Executor', 'Reviewer'];
  const memoryContext = formatMemoryContext(memories);
  const toolsCalled: string[] = [];
  let modelIterations = 0;
  const episode: string[] = [];

  for (const role of agentRoles) {
    const rolePrompt = [
      {
        role: 'system',
        content: `You are ${role}. ${roleDescription(role)} Use available memory and tools when appropriate.`
      },
      {
        role: 'user',
        content: `User task: ${message}

Memory context:
${memoryContext}

Previous agent output:
${episode.join('\n')}

Respond with your assigned role output.`
      }
    ];

    const agentOutput = await callOpenAI(rolePrompt, modelOverride ?? 'gpt-4o-mini');
    modelIterations += 1;
    let finalOutput = agentOutput;

    const toolCall = parseToolCall(agentOutput);
    if (toolCall) {
      toolsCalled.push(toolCall.name);
      const toolResult = await runTool(toolCall.name, toolCall.args);
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

            finalOutput = await callOpenAI(toolPrompt, modelOverride ?? 'gpt-4o-mini');
      modelIterations += 1;
    }

    episode.push(`${role.toUpperCase()} OUTPUT:
${finalOutput}`);
  }

  return {
    message: episode[episode.length - 1] ?? '',
    trace: {
      memoryUsed: memories.length > 0,
      toolsCalled,
      modelIterations,
      agentsUsed: agentRoles
    }
  };
}
