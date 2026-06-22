import type { LLMResponse } from './llm/types';
export type ExecutionTrace = {
    memoryUsed: boolean;
    toolsCalled: string[];
    modelIterations: number;
    agentsUsed: string[];
    model_name?: string;
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
    estimated_cost?: number;
    latency_ms?: number;
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
    systemPrompt?: string;
    runId?: string;
};
export type AgentWorkflowResult = {
    message: string;
    trace: ExecutionTrace;
};
export declare function callOpenAI(messages: Array<{
    role: string;
    content: string;
}>, model?: string): Promise<LLMResponse>;
export declare function runMultiAgentWorkflow({ userId, conversationId, message, workflow, memories, runId }: AgentWorkflowInput, modelOverride?: string): Promise<AgentWorkflowResult>;
export {};
//# sourceMappingURL=agentRouter.d.ts.map