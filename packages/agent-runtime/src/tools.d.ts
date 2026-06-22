export type Tool = {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
    execute: (args: Record<string, unknown>) => Promise<unknown>;
};
export declare const toolList: Tool[];
export declare function runTool(name: string, args: Record<string, unknown>, runId?: string, organizationId?: string | null): Promise<unknown>;
//# sourceMappingURL=tools.d.ts.map