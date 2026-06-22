import { createServerSupabaseClient } from '@agent-workbench/sdk';
import { generateEmbedding } from './embeddings';
export async function getRelevantMemories({ conversationId, query }) {
    const supabase = createServerSupabaseClient();
    let queryEmbedding;
    try {
        queryEmbedding = await generateEmbedding(query);
    }
    catch (error) {
        console.error('Failed to generate memory query embedding; continuing without memories', {
            conversationId,
            query,
            error
        });
        return [];
    }
    try {
        const { data, error } = await supabase.rpc('match_messages', {
            query_embedding: queryEmbedding,
            match_threshold: 0.75,
            match_count: 10
        });
        if (error) {
            console.error('Failed to run match_messages RPC; continuing without memories', {
                error,
                conversationId,
                query
            });
            return [];
        }
        const memories = (data ?? []);
        return memories.filter((memory) => memory.conversation_id === conversationId).sort((a, b) => b.similarity - a.similarity);
    }
    catch (error) {
        console.error('Failed to retrieve memories; continuing without memories', { conversationId, query, error });
        return [];
    }
}
