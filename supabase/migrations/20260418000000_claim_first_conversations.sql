-- =============================================================================
-- Claim-First Conversation Broadcast
-- =============================================================================
-- Adds conversation-level assignment + handler_mode so inbound messages go to
-- the employee who claims them instead of auto-replying with the bot.
-- Adds:
--   * conversations.handler_mode        ('unassigned' | 'human' | 'bot')
--   * conversations.assigned_to         -> team_members(id)
--   * conversations.assigned_at, assigned_by_user_id
--   * conversations.last_inbound_at     (safety; webhook already writes it)
--   * conversation_claim_events         audit trail
--   * claim_conversation(...) RPC       atomic first-writer-wins claim
-- =============================================================================

-- ---- columns ---------------------------------------------------------------
alter table public.conversations
  add column if not exists last_inbound_at     timestamptz,
  add column if not exists handler_mode        text
    check (handler_mode in ('unassigned','human','bot'))
    default 'unassigned',
  add column if not exists assigned_to         uuid references public.team_members(id),
  add column if not exists assigned_at         timestamptz,
  add column if not exists assigned_by_user_id uuid references auth.users(id);

-- Backfill existing rows to unassigned (safe: default only applies to new rows).
update public.conversations
   set handler_mode = 'unassigned'
 where handler_mode is null;

create index if not exists conversations_restaurant_last_inbound_idx
  on public.conversations (restaurant_id, last_inbound_at desc nulls last);

create index if not exists conversations_assignee_idx
  on public.conversations (assigned_to)
  where assigned_to is not null;

create index if not exists conversations_handler_mode_idx
  on public.conversations (restaurant_id, handler_mode);

-- ---- claim audit trail -----------------------------------------------------
create table if not exists public.conversation_claim_events (
  id                 uuid primary key default gen_random_uuid(),
  conversation_id    uuid not null references public.conversations(id) on delete cascade,
  restaurant_id      uuid not null references public.restaurants(id)   on delete cascade,
  team_member_id     uuid not null references public.team_members(id),
  mode               text not null check (mode in ('human','bot')),
  claimed_at         timestamptz not null default now(),
  claimed_by_user_id uuid references auth.users(id)
);

create index if not exists claim_events_conv_idx
  on public.conversation_claim_events (conversation_id, claimed_at desc);

create index if not exists claim_events_restaurant_idx
  on public.conversation_claim_events (restaurant_id, claimed_at desc);

alter table public.conversation_claim_events enable row level security;

-- Members of the restaurant can read its claim events.
drop policy if exists "claim_events_read" on public.conversation_claim_events;
create policy "claim_events_read"
  on public.conversation_claim_events
  for select
  using (
    exists (
      select 1 from public.team_members tm
       where tm.restaurant_id = conversation_claim_events.restaurant_id
         and tm.user_id = auth.uid()
         and tm.is_active = true
    )
  );

-- Writes happen only via the RPC (security definer), so no insert policy.

-- ---- claim RPC: atomic first-writer-wins -----------------------------------
create or replace function public.claim_conversation(
  p_conversation_id uuid,
  p_mode            text,
  p_team_member_id  uuid
)
returns public.conversations
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user   uuid := auth.uid();
  v_member public.team_members%rowtype;
  v_conv   public.conversations%rowtype;
begin
  if p_conversation_id is null or p_team_member_id is null then
    raise exception 'missing_arguments';
  end if;

  if p_mode not in ('human','bot') then
    raise exception 'invalid_mode';
  end if;

  -- Caller must own the team_member row.
  select *
    into v_member
    from public.team_members
   where id = p_team_member_id
     and user_id = v_user
     and is_active = true;

  if not found then
    raise exception 'not_a_team_member';
  end if;

  -- Atomic: only claim when still unassigned.
  update public.conversations
     set handler_mode        = p_mode,
         assigned_to         = p_team_member_id,
         assigned_at         = now(),
         assigned_by_user_id = v_user
   where id = p_conversation_id
     and restaurant_id = v_member.restaurant_id
     and handler_mode = 'unassigned'
  returning * into v_conv;

  if not found then
    -- Already claimed (or wrong tenant). Return the current row so the caller
    -- can show who already has it without overwriting anything.
    select *
      into v_conv
      from public.conversations
     where id = p_conversation_id
       and restaurant_id = v_member.restaurant_id;

    if not found then
      raise exception 'conversation_not_found';
    end if;

    return v_conv;
  end if;

  insert into public.conversation_claim_events
    (conversation_id, restaurant_id, team_member_id, mode, claimed_by_user_id)
    values (v_conv.id, v_conv.restaurant_id, p_team_member_id, p_mode, v_user);

  return v_conv;
end
$$;

revoke all on function public.claim_conversation(uuid, text, uuid) from public;
grant execute on function public.claim_conversation(uuid, text, uuid)
  to authenticated, service_role;

-- ---- realtime --------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime'
       and schemaname = 'public'
       and tablename = 'conversation_claim_events'
  ) then
    execute 'alter publication supabase_realtime add table public.conversation_claim_events';
  end if;
end
$$;
