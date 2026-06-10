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
  const queryEmbedding = await generateEmbedding(query);

  const { data, error } = await supabase.rpc('match_messages', {
    query_embedding: queryEmbedding,
    match_threshold: 0.75,
    match_count: 10
  });

  if (error) {
    throw error;
  }

  const memories = (data ?? []) as MemorySnippet[];
  const filtered = memories.filter((memory) => memory.conversation_id === conversationId);

  return filtered.sort((a, b) => b.similarity - a.similarity);
}
