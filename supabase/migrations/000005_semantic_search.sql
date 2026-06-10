-- Semantic search helper for message embeddings

create or replace function match_messages(
  query_embedding vector(1536),
  match_threshold float,
  match_count int
)
returns table (
  id uuid,
  conversation_id uuid,
  content text,
  similarity float
)
language sql stable as $$
  select
    id,
    conversation_id,
    content,
    1 - (embedding <=> query_embedding) as similarity
  from messages
  where embedding is not null
    and (
      match_threshold is null
      or 1 - (embedding <=> query_embedding) >= match_threshold
    )
  order by embedding <=> query_embedding
  limit match_count;
$$;
