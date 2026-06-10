-- Add embedding vector support to messages

alter table messages add column embedding vector(1536);

create index if not exists messages_embedding_idx
  on messages using ivfflat (embedding vector_cosine_ops)
  with (lists = 128);
