type MemorySnippet = {
    id: string;
    conversation_id: string;
    role: 'user' | 'assistant';
    content: string;
    similarity: number;
};
export declare function getRelevantMemories({ conversationId, query }: {
    conversationId: string;
    query: string;
}): Promise<MemorySnippet[]>;
export {};
//# sourceMappingURL=memory.d.ts.map