-- ===========================================================================
-- Conversation unread tracking
--
-- Adds the per-conversation unread counter that the mobile + web inbox need
-- to render "X new messages" badges and reorder cues without an expensive
-- "count messages since last_read_at" scan on every list render.
--
-- Semantics
--   conversations.unread_count  → number of customer messages received since
--                                 the conversation was last marked read.
--   conversations.last_read_at  → timestamp when any member last opened +
--                                 scrolled to the bottom of the chat. Used
--                                 to decide which side of a session boundary
--                                 a message falls on for future analytics.
--
-- Write paths
--   * Trigger on messages INSERT (role='customer') increments the counter on
--     the owning conversations row. Idempotent — if somehow the counter is
--     already stale we still add 1, so we never under-count.
--   * The client marks a conversation read by:
--         update conversations set unread_count = 0, last_read_at = now()
--         where id = :id;
--     RLS (conversations_update_members) already grants this to members.
--
-- We intentionally do NOT touch last_message_at / last_inbound_at here — the
-- Twilio webhook already maintains those. Duplicating would cause race
-- conditions in timestamp ordering.
-- ===========================================================================

-- ---- 1. Columns ------------------------------------------------------------
alter table public.conversations
  add column if not exists unread_count integer not null default 0;

alter table public.conversations
  add column if not exists last_read_at timestamptz;

-- Partial index for the "has unread" filter we'll drive from the inbox.
create index if not exists conversations_unread_idx
  on public.conversations (restaurant_id, last_message_at desc)
  where unread_count > 0;

-- ---- 2. Trigger: increment on customer message insert ----------------------
create or replace function public.tg_increment_unread_on_customer_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.role = 'customer' then
    update public.conversations
       set unread_count = coalesce(unread_count, 0) + 1
     where id = new.conversation_id;
  end if;
  return new;
end;
$$;

drop trigger if exists increment_unread_on_customer_message
  on public.messages;

create trigger increment_unread_on_customer_message
  after insert on public.messages
  for each row
  execute function public.tg_increment_unread_on_customer_message();

-- ---- 3. Backfill -----------------------------------------------------------
-- Deliberately starting every existing conversation at 0. Counting historical
-- customer messages would show huge, misleading badges on long-running
-- conversations the team has already read. From this migration forward, the
-- trigger keeps the counter accurate.
--
-- last_read_at is left NULL for existing rows; treated as "read through
-- migration time" by the UI (since unread_count = 0).

comment on column public.conversations.unread_count is
  'Customer messages received since last_read_at. Maintained by trigger on messages INSERT; zeroed by client on scroll-to-bottom.';
comment on column public.conversations.last_read_at is
  'Most recent time any tenant member marked this conversation read.';
