-- Enable pgvector extension for vector similarity search
create extension if not exists vector;

-- Knowledge chunks table — stores embedded text chunks per restaurant
create table if not exists public.knowledge_chunks (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  content text not null,
  embedding vector(768),      -- Google text-embedding-004 produces 768-dim vectors
  source_file text,           -- which .md file this chunk came from
  chunk_index integer,        -- order within the source file
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists knowledge_chunks_restaurant_id_idx
  on public.knowledge_chunks (restaurant_id);

-- IVFFlat index for fast cosine similarity search
-- (recreate after ingestion if chunk count grows beyond ~10k)
create index if not exists knowledge_chunks_embedding_idx
  on public.knowledge_chunks using ivfflat (embedding vector_cosine_ops)
  with (lists = 100);

-- RPC used by the bot to retrieve the top-N most relevant chunks
create or replace function match_knowledge_chunks(
  query_embedding vector(768),
  match_restaurant_id uuid,
  match_count int default 5,
  match_threshold float default 0.4
)
returns table (
  id uuid,
  content text,
  source_file text,
  similarity float
)
language sql stable
as $$
  select
    kc.id,
    kc.content,
    kc.source_file,
    1 - (kc.embedding <=> query_embedding) as similarity
  from public.knowledge_chunks kc
  where
    kc.restaurant_id = match_restaurant_id
    and 1 - (kc.embedding <=> query_embedding) > match_threshold
  order by kc.embedding <=> query_embedding
  limit match_count;
$$;
