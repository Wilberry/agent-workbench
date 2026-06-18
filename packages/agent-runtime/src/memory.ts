import { createServerSupabaseClient } from '@agent-workbench/sdk';
import { generateEmbedding } from './embeddings';

type MemorySnippet = {
  id: string;
  conversation_id: string;
  role: 'user' | 'assistant';
  content: string;
  similarity: number;
};

export async function getRelevantMemories({ conversationId, query }: { conversationId: string; query: string }) {
  const supabase = createServerSupabaseClient();

  let queryEmbedding: number[];
  try {
    queryEmbedding = await generateEmbedding(query);
  } catch (error) {
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

    const memories = (data ?? []) as MemorySnippet[];
    return memories.filter((memory) => memory.conversation_id === conversationId).sort((a, b) => b.similarity - a.similarity);
  } catch (error) {
    console.error('Failed to retrieve memories; continuing without memories', { conversationId, query, error });
    return [];
  }
}
