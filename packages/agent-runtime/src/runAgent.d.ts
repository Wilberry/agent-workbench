export type ExecutionTrace = {
    memoryUsed: boolean;
    toolsCalled: string[];
    modelIterations: number;
    model_name?: string;
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
    estimated_cost?: number;
    latency_ms?: number;
};
export declare function runAgent({ agentId, conversationId, userMessage, debug, runId }: {
    agentId: string;
    conversationId: string;
    userMessage: string;
    debug?: boolean;
    runId?: string;
}): Promise<Response>;
//# sourceMappingURL=runAgent.d.ts.map