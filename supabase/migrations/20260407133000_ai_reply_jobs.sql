create table if not exists public.ai_reply_jobs (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  inbound_message_id uuid not null references public.messages(id) on delete cascade,
  status text not null default 'pending',
  attempt_count integer not null default 0,
  max_attempts integer not null default 5,
  locked_at timestamptz,
  processed_at timestamptz,
  last_error text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now())
);

create unique index if not exists ai_reply_jobs_inbound_message_id_key
  on public.ai_reply_jobs (inbound_message_id);

drop trigger if exists set_updated_at_ai_reply_jobs on public.ai_reply_jobs;
create trigger set_updated_at_ai_reply_jobs
before update on public.ai_reply_jobs
for each row execute function public.set_updated_at();
