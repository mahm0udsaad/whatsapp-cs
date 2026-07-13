-- Manual, conversation-level customer satisfaction analyses.
--
-- Results are immutable snapshots. The API reuses the newest row when its
-- input_hash still matches the conversation/orders/Nehgz evidence, so opening
-- the modal repeatedly does not spend another model call.

create table if not exists public.customer_satisfaction_analyses (
  id                    uuid primary key default gen_random_uuid(),
  restaurant_id         uuid not null references public.restaurants(id) on delete cascade,
  conversation_id       uuid not null references public.conversations(id) on delete cascade,
  customer_phone        text not null,
  customer_name         text,
  score                 integer not null check (score between 0 and 100),
  sentiment             text not null check (sentiment in ('positive', 'neutral', 'negative', 'mixed')),
  risk_level            text not null check (risk_level in ('low', 'medium', 'high')),
  confidence            integer not null check (confidence between 0 and 100),
  summary               text not null,
  strengths             jsonb not null default '[]'::jsonb,
  concerns              jsonb not null default '[]'::jsonb,
  unanswered_questions  jsonb not null default '[]'::jsonb,
  recommended_actions   jsonb not null default '[]'::jsonb,
  evidence              jsonb not null default '[]'::jsonb,
  metrics               jsonb not null default '{}'::jsonb,
  analysis_mode         text not null check (analysis_mode in ('fresh', 'reanalysis')),
  source_message_count  integer not null default 0,
  new_message_count     integer not null default 0,
  latest_message_at     timestamptz,
  whatsapp_status       text not null default 'unknown',
  nehgz_status          text not null default 'not_paired',
  input_hash            text not null,
  model                 text not null,
  prompt_version        text not null,
  created_by_user_id    uuid,
  created_at            timestamptz not null default now()
);

create index if not exists customer_satisfaction_conversation_created_idx
  on public.customer_satisfaction_analyses (conversation_id, created_at desc);

create index if not exists customer_satisfaction_restaurant_created_idx
  on public.customer_satisfaction_analyses (restaurant_id, created_at desc);

create index if not exists customer_satisfaction_input_hash_idx
  on public.customer_satisfaction_analyses (conversation_id, input_hash);

alter table public.customer_satisfaction_analyses enable row level security;

-- The table is intentionally server-managed. Both web and mobile read it
-- through the authenticated API, which verifies tenant membership before
-- using the service-role client.

comment on table public.customer_satisfaction_analyses is
  'Immutable, evidence-backed satisfaction snapshots generated manually from a conversation.';
