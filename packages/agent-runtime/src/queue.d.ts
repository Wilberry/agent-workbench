export type WorkflowExecutionStep = {
    stepIndex: number;
    agentRole: string;
    input: string;
    output: string;
    toolsCalled: string[];
    memoryUsed: boolean;
    timestamp: string;
    modelIterations: number;
};
export type ExecutionStep = {
    id: string;
    run_id: string;
    step: 'planner' | 'executor' | 'reviewer' | 'tool' | 'memory' | 'error';
    status: 'started' | 'completed' | 'failed';
    input?: any;
    output?: any;
    error?: string;
    timestamp: string;
    metadata?: {
        model?: string;
        tokens?: number;
        toolName?: string;
        latency_ms?: number;
    } | null;
};
export type AgentRunQueueJob = {
    runId: string;
    userId: string;
    conversationId: string;
    message: string;
    workflow: string[];
    memories: Array<{
        role: 'user' | 'assistant';
        content: string;
        similarity: number;
    }>;
    agentVersionId?: string | null;
    organizationId?: string | null;
};
export declare function enqueueAgentRun(job: AgentRunQueueJob): Promise<string>;
export declare function dequeueAgentRun(userId?: string): Promise<AgentRunQueueJob | null>;
export declare function incrementAttemptsAndMaybeDead(runId: string, failureReason?: string): Promise<{
    attempts: number;
    maxAttempts: number;
    isDead: boolean;
}>;
export declare function reclaimStaleJobs(leaseInterval?: string): Promise<string[]>;
export declare function markQueueJobCompleted(runId: string): Promise<void>;
export declare function markQueueJobFailed(runId: string, failureReason?: string): Promise<void>;
export type RunTelemetryUpdate = {
    input_tokens?: number;
    output_tokens?: number;
    total_tokens?: number;
    estimated_cost?: number;
    latency_ms?: number;
    model_name?: string | null;
};
export declare function updateRunTelemetry(runId: string, telemetry: RunTelemetryUpdate): Promise<void>;
export declare function persistToolCall(params: {
    runId: string;
    organizationId?: string | null;
    toolName: string;
    status: 'success' | 'failed';
    latencyMs: number;
    inputPayload: Record<string, unknown>;
    outputPayload: unknown;
}): Promise<void>;
export declare function isProcessing(runId: string): boolean;
export declare function setProcessing(runId: string, isProcessing: boolean): void;
export declare function persistExecutionStep(runId: string, step: ExecutionStep): Promise<void>;
export declare function markRunCompleted(runId: string): Promise<void>;
export declare function markRunFailed(runId: string, errorMessage: string): Promise<void>;
export declare function getAgentRun(runId: string): Promise<{
    id: string;
    user_id: string;
    created_at: string;
    organization_id?: string | null | undefined;
    conversation_id: string;
    updated_at: string;
    workflow: string[];
    current_step: number;
    execution_trace: Array<{
        id?: string;
        run_id?: string;
        step?: string;
        status?: string;
        input?: any;
        output?: any;
        error?: string;
        timestamp?: string;
        metadata?: {
            model?: string;
            tokens?: number;
            toolName?: string;
        } | null;
    }>;
    input_tokens: number;
    output_tokens: number;
    total_tokens: number;
    estimated_cost: number;
    latency_ms: number;
    model_name?: string | null | undefined;
    agent_version_id?: string | null | undefined;
    replay_of_run_id?: string | null | undefined;
    replay_reason?: string | null | undefined;
    status: "pending" | "running" | "completed" | "failed";
    error_message?: string | null | undefined;
}>;
//# sourceMappingURL=queue.d.ts.map