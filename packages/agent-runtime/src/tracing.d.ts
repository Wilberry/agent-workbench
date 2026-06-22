export type TraceEvent = {
    id: string;
    run_id: string;
    event_type: string;
    payload: unknown;
    created_at: string;
};
export declare function persistTraceEvent(runId: string, eventType: string, payload?: unknown): Promise<void>;
export declare function getRunTraceEvents(runId: string): Promise<TraceEvent[]>;
//# sourceMappingURL=tracing.d.ts.map