-- =============================================================================
-- Claim-first human takeover, shift management, push notifications,
-- and AI-manager-trained instruction system.
--
-- Staff model: public.team_members (restaurant_id, user_id -> auth.users,
-- role in ('admin','agent'), is_active, is_available).
-- Claim semantics: orders.assigned_to (already exists, FK -> team_members.id)
-- IS the claim column. We add timestamps + AI-draft + Rekaz-deep-link columns
-- on top of what already exists.
--
-- Idempotent: safe to re-run. Adds only — never alters existing columns.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 0. profiles.is_super_admin — gates the ops surfaces (cross-tenant)
-- -----------------------------------------------------------------------------
alter table public.profiles
  add column if not exists is_super_admin boolean not null default false;

-- -----------------------------------------------------------------------------
-- Membership helpers
--
-- A "restaurant member" is either:
--   - the restaurant owner (restaurants.owner_id matches auth.uid()), or
--   - an active team_members row linking auth.uid() to the restaurant, or
--   - a super-admin profile (ops role).
-- A "restaurant owner" is the owner_id path, or super-admin.
-- These helpers let RLS and RPCs converge on one rule.
-- -----------------------------------------------------------------------------
create or replace function public.is_restaurant_member(
  p_restaurant_id uuid,
  p_user_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    p_user_id is not null
    and p_restaurant_id is not null
    and (
      exists (
        select 1 from public.restaurants r
        where r.id = p_restaurant_id
          and r.owner_id = p_user_id
      )
      or exists (
        select 1 from public.team_members tm
        where tm.restaurant_id = p_restaurant_id
          and tm.user_id = p_user_id
          and tm.is_active = true
      )
      or exists (
        select 1 from public.profiles pr
        where pr.id = p_user_id
          and pr.is_super_admin = true
      )
    );
$$;

create or replace function public.is_restaurant_owner(
  p_restaurant_id uuid,
  p_user_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    p_user_id is not null
    and p_restaurant_id is not null
    and (
      exists (
        select 1 from public.restaurants r
        where r.id = p_restaurant_id
          and r.owner_id = p_user_id
      )
      or exists (
        select 1 from public.profiles pr
        where pr.id = p_user_id
          and pr.is_super_admin = true
      )
    );
$$;

revoke all on function public.is_restaurant_member(uuid, uuid) from public;
grant execute on function public.is_restaurant_member(uuid, uuid) to authenticated, service_role;
revoke all on function public.is_restaurant_owner(uuid, uuid) from public;
grant execute on function public.is_restaurant_owner(uuid, uuid) to authenticated, service_role;

-- =============================================================================
-- 1. orders — add claim-first metadata (reuse existing assigned_to as claimer)
-- =============================================================================
alter table public.orders
  add column if not exists claimed_at timestamptz,
  add column if not exists ai_draft_reply text,
  add column if not exists ai_draft_generated_at timestamptz,
  add column if not exists hanan_escalated_at timestamptz,
  add column if not exists rekaz_booking_url text;

-- Unclaimed escalation queue — the inbox hot path.
create index if not exists orders_unclaimed_escalations_idx
  on public.orders (restaurant_id, created_at)
  where type = 'escalation' and assigned_to is null;

-- "Claimed but unresolved" per-agent view.
create index if not exists orders_assigned_to_status_idx
  on public.orders (assigned_to, status)
  where assigned_to is not null;

-- "Still unclaimed after N seconds" query needs a cheap index on created_at
-- restricted to escalations. Piggyback on the partial index above — the
-- planner can use it directly.

-- =============================================================================
-- 2. agent_shifts — on-duty roster authored by the owner (Hanan)
-- =============================================================================
create table if not exists public.agent_shifts (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  team_member_id uuid not null references public.team_members(id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  note text,
  created_at timestamptz not null default timezone('utc', now()),
  created_by uuid references auth.users(id) on delete set null,
  constraint agent_shifts_time_range_check check (ends_at > starts_at)
);

create index if not exists agent_shifts_restaurant_window_idx
  on public.agent_shifts (restaurant_id, starts_at, ends_at);

create index if not exists agent_shifts_team_member_idx
  on public.agent_shifts (team_member_id, starts_at);

alter table public.agent_shifts enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'agent_shifts'
      and policyname = 'agent_shifts_select_members'
  ) then
    create policy agent_shifts_select_members
      on public.agent_shifts
      for select
      using ( public.is_restaurant_member(restaurant_id, auth.uid()) );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'agent_shifts'
      and policyname = 'agent_shifts_insert_owner'
  ) then
    create policy agent_shifts_insert_owner
      on public.agent_shifts
      for insert
      with check ( public.is_restaurant_owner(restaurant_id, auth.uid()) );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'agent_shifts'
      and policyname = 'agent_shifts_update_owner'
  ) then
    create policy agent_shifts_update_owner
      on public.agent_shifts
      for update
      using ( public.is_restaurant_owner(restaurant_id, auth.uid()) )
      with check ( public.is_restaurant_owner(restaurant_id, auth.uid()) );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'agent_shifts'
      and policyname = 'agent_shifts_delete_owner'
  ) then
    create policy agent_shifts_delete_owner
      on public.agent_shifts
      for delete
      using ( public.is_restaurant_owner(restaurant_id, auth.uid()) );
  end if;
end
$$;

-- =============================================================================
-- 3. user_push_tokens — Expo push tokens per team_member per device
-- =============================================================================
create table if not exists public.user_push_tokens (
  id uuid primary key default gen_random_uuid(),
  team_member_id uuid not null references public.team_members(id) on delete cascade,
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  expo_token text not null,
  device_id text,
  platform text,
  last_seen_at timestamptz not null default timezone('utc', now()),
  disabled boolean not null default false,
  created_at timestamptz not null default timezone('utc', now())
);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'user_push_tokens_platform_check'
      and conrelid = 'public.user_push_tokens'::regclass
  ) then
    alter table public.user_push_tokens
      add constraint user_push_tokens_platform_check
      check (platform is null or platform in ('ios','android','web'));
  end if;
end
$$;

-- Unique per (team_member, device). Re-login on same device updates the same row.
create unique index if not exists user_push_tokens_member_device_key
  on public.user_push_tokens (team_member_id, device_id)
  where device_id is not null;

-- Unique by raw token across the whole table — same physical token should never
-- be active under two team_members at the same time.
create unique index if not exists user_push_tokens_expo_token_key
  on public.user_push_tokens (expo_token)
  where disabled = false;

create index if not exists user_push_tokens_restaurant_active_idx
  on public.user_push_tokens (restaurant_id)
  where disabled = false;

alter table public.user_push_tokens enable row level security;

-- Agents register and update their own tokens. They must be an authenticated
-- user linked via team_members to the given restaurant.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'user_push_tokens'
      and policyname = 'user_push_tokens_select_self'
  ) then
    create policy user_push_tokens_select_self
      on public.user_push_tokens
      for select
      using (
        exists (
          select 1 from public.team_members tm
          where tm.id = user_push_tokens.team_member_id
            and tm.user_id = auth.uid()
        )
        or public.is_restaurant_owner(restaurant_id, auth.uid())
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'user_push_tokens'
      and policyname = 'user_push_tokens_insert_self'
  ) then
    create policy user_push_tokens_insert_self
      on public.user_push_tokens
      for insert
      with check (
        exists (
          select 1 from public.team_members tm
          where tm.id = user_push_tokens.team_member_id
            and tm.user_id = auth.uid()
            and tm.restaurant_id = user_push_tokens.restaurant_id
            and tm.is_active = true
        )
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'user_push_tokens'
      and policyname = 'user_push_tokens_update_self'
  ) then
    create policy user_push_tokens_update_self
      on public.user_push_tokens
      for update
      using (
        exists (
          select 1 from public.team_members tm
          where tm.id = user_push_tokens.team_member_id
            and tm.user_id = auth.uid()
        )
      )
      with check (
        exists (
          select 1 from public.team_members tm
          where tm.id = user_push_tokens.team_member_id
            and tm.user_id = auth.uid()
        )
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'user_push_tokens'
      and policyname = 'user_push_tokens_delete_self'
  ) then
    create policy user_push_tokens_delete_self
      on public.user_push_tokens
      for delete
      using (
        exists (
          select 1 from public.team_members tm
          where tm.id = user_push_tokens.team_member_id
            and tm.user_id = auth.uid()
        )
      );
  end if;
end
$$;

-- =============================================================================
-- 4. owner_ai_manager_threads + owner_ai_manager_messages
--    Hanan's private chat with the AI-Manager; emits versioned agent_instructions.
-- =============================================================================
create table if not exists public.owner_ai_manager_threads (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  title text,
  status text not null default 'open',
  last_message_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'owner_ai_manager_threads_status_check'
      and conrelid = 'public.owner_ai_manager_threads'::regclass
  ) then
    alter table public.owner_ai_manager_threads
      add constraint owner_ai_manager_threads_status_check
      check (status in ('open','archived'));
  end if;
end
$$;

create index if not exists owner_ai_manager_threads_restaurant_idx
  on public.owner_ai_manager_threads (restaurant_id, last_message_at desc nulls last);

create index if not exists owner_ai_manager_threads_owner_idx
  on public.owner_ai_manager_threads (owner_user_id);

alter table public.owner_ai_manager_threads enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'owner_ai_manager_threads'
      and policyname = 'owner_ai_manager_threads_owner_all'
  ) then
    create policy owner_ai_manager_threads_owner_all
      on public.owner_ai_manager_threads
      for all
      using (
        owner_user_id = auth.uid()
        or public.is_restaurant_owner(restaurant_id, auth.uid())
      )
      with check (
        owner_user_id = auth.uid()
        or public.is_restaurant_owner(restaurant_id, auth.uid())
      );
  end if;
end
$$;

drop trigger if exists owner_ai_manager_threads_set_updated_at
  on public.owner_ai_manager_threads;
create trigger owner_ai_manager_threads_set_updated_at
  before update on public.owner_ai_manager_threads
  for each row execute function public.set_updated_at_timestamp();

create table if not exists public.owner_ai_manager_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.owner_ai_manager_threads(id) on delete cascade,
  role text not null,
  content text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'owner_ai_manager_messages_role_check'
      and conrelid = 'public.owner_ai_manager_messages'::regclass
  ) then
    alter table public.owner_ai_manager_messages
      add constraint owner_ai_manager_messages_role_check
      check (role in ('owner','assistant','system'));
  end if;
end
$$;

create index if not exists owner_ai_manager_messages_thread_created_idx
  on public.owner_ai_manager_messages (thread_id, created_at);

alter table public.owner_ai_manager_messages enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'owner_ai_manager_messages'
      and policyname = 'owner_ai_manager_messages_owner_all'
  ) then
    create policy owner_ai_manager_messages_owner_all
      on public.owner_ai_manager_messages
      for all
      using (
        exists (
          select 1 from public.owner_ai_manager_threads t
          where t.id = owner_ai_manager_messages.thread_id
            and (
              t.owner_user_id = auth.uid()
              or public.is_restaurant_owner(t.restaurant_id, auth.uid())
            )
        )
      )
      with check (
        exists (
          select 1 from public.owner_ai_manager_threads t
          where t.id = owner_ai_manager_messages.thread_id
            and (
              t.owner_user_id = auth.uid()
              or public.is_restaurant_owner(t.restaurant_id, auth.uid())
            )
        )
      );
  end if;
end
$$;

-- =============================================================================
-- 5. agent_instructions — versioned rules the AI-Manager emits
-- =============================================================================
create table if not exists public.agent_instructions (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  version integer not null,
  title text not null,
  body text not null,
  tags text[] not null default '{}',
  status text not null default 'active',
  author_user_id uuid references auth.users(id) on delete set null,
  authored_via text not null default 'ai_manager',
  source_thread_id uuid references public.owner_ai_manager_threads(id) on delete set null,
  superseded_by uuid references public.agent_instructions(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now())
);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'agent_instructions_status_check'
      and conrelid = 'public.agent_instructions'::regclass
  ) then
    alter table public.agent_instructions
      add constraint agent_instructions_status_check
      check (status in ('active','archived','draft'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'agent_instructions_authored_via_check'
      and conrelid = 'public.agent_instructions'::regclass
  ) then
    alter table public.agent_instructions
      add constraint agent_instructions_authored_via_check
      check (authored_via in ('ai_manager','manual'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'agent_instructions_restaurant_version_key'
      and conrelid = 'public.agent_instructions'::regclass
  ) then
    alter table public.agent_instructions
      add constraint agent_instructions_restaurant_version_key
      unique (restaurant_id, version);
  end if;
end
$$;

create index if not exists agent_instructions_restaurant_status_idx
  on public.agent_instructions (restaurant_id, status);

create index if not exists agent_instructions_tags_gin_idx
  on public.agent_instructions using gin (tags);

-- Auto-version per tenant. Advisory lock serializes concurrent inserts.
create or replace function public.assign_agent_instruction_version()
returns trigger
language plpgsql
as $$
declare
  v_next integer;
begin
  if new.restaurant_id is null then
    raise exception 'agent_instructions.restaurant_id cannot be null';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('agent_instructions_version', 0),
    hashtextextended(new.restaurant_id::text, 0)
  );

  select coalesce(max(version), 0) + 1
    into v_next
    from public.agent_instructions
    where restaurant_id = new.restaurant_id;

  new.version := v_next;
  return new;
end;
$$;

drop trigger if exists agent_instructions_assign_version
  on public.agent_instructions;
create trigger agent_instructions_assign_version
  before insert on public.agent_instructions
  for each row execute function public.assign_agent_instruction_version();

alter table public.agent_instructions enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'agent_instructions'
      and policyname = 'agent_instructions_owner_all'
  ) then
    create policy agent_instructions_owner_all
      on public.agent_instructions
      for all
      using ( public.is_restaurant_owner(restaurant_id, auth.uid()) )
      with check ( public.is_restaurant_owner(restaurant_id, auth.uid()) );
  end if;

  -- Agents (on-duty or not) may READ active instructions so the inbox can
  -- surface them as context while composing. No write access.
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'agent_instructions'
      and policyname = 'agent_instructions_select_members'
  ) then
    create policy agent_instructions_select_members
      on public.agent_instructions
      for select
      using ( public.is_restaurant_member(restaurant_id, auth.uid()) );
  end if;
end
$$;

-- =============================================================================
-- 6. Realtime publications
--    Orders for claim races + shifts for roster UI + messages for live threads.
-- =============================================================================
do $$
begin
  if not exists ( select 1 from pg_publication where pubname = 'supabase_realtime' ) then
    return;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'orders'
  ) then
    execute 'alter publication supabase_realtime add table public.orders';
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'agent_shifts'
  ) then
    execute 'alter publication supabase_realtime add table public.agent_shifts';
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'messages'
  ) then
    execute 'alter publication supabase_realtime add table public.messages';
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'conversations'
  ) then
    execute 'alter publication supabase_realtime add table public.conversations';
  end if;
end
$$;

-- =============================================================================
-- 7. RPCs: current_on_duty_agents + claim_escalation
-- =============================================================================

-- Returns the team_members who are on-duty right now for a restaurant.
-- "On duty" = has an agent_shifts row covering now() AND team_members.is_active.
-- Note: team_members.is_available is a soft "do-not-disturb" toggle the agent
--       flips; shifts define scheduled on-duty windows. We return ON SHIFT
--       agents and include is_available so the broadcaster can decide whether
--       to skip them.
create or replace function public.current_on_duty_agents(
  p_restaurant_id uuid
)
returns table (
  team_member_id uuid,
  user_id uuid,
  full_name text,
  role text,
  is_available boolean,
  shift_starts_at timestamptz,
  shift_ends_at timestamptz,
  note text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    tm.id as team_member_id,
    tm.user_id,
    tm.full_name,
    tm.role,
    tm.is_available,
    s.starts_at as shift_starts_at,
    s.ends_at   as shift_ends_at,
    s.note
  from public.agent_shifts s
  join public.team_members tm
    on tm.id = s.team_member_id
   and tm.is_active = true
  where s.restaurant_id = p_restaurant_id
    and s.starts_at <= timezone('utc', now())
    and s.ends_at   >  timezone('utc', now());
$$;

revoke all on function public.current_on_duty_agents(uuid) from public;
grant execute on function public.current_on_duty_agents(uuid) to authenticated, service_role;

-- Atomic claim. Writes orders.assigned_to and the timestamps.
-- Returns the claimed row, or NULL if:
--   - order doesn't exist
--   - order isn't an escalation
--   - order is already claimed
--   - caller isn't the team_member (auth.uid() mismatch) or a member of the tenant
create or replace function public.claim_escalation(
  p_order_id uuid,
  p_team_member_id uuid
)
returns public.orders
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order        public.orders;
  v_restaurant   uuid;
  v_member_user  uuid;
  v_member_active boolean;
  v_member_tenant uuid;
begin
  if p_order_id is null or p_team_member_id is null then
    return null;
  end if;

  select restaurant_id into v_restaurant
    from public.orders where id = p_order_id;
  if v_restaurant is null then
    return null;
  end if;

  select user_id, is_active, restaurant_id
    into v_member_user, v_member_active, v_member_tenant
    from public.team_members where id = p_team_member_id;
  if v_member_user is null then
    return null;
  end if;

  -- The team_member must belong to the tenant of the order and be active,
  -- and must correspond to the authenticated caller (unless the caller is the
  -- owner or a super_admin acting on someone else's behalf via service role,
  -- in which case auth.uid() is NULL and we allow if membership checks pass).
  if v_member_tenant <> v_restaurant then
    return null;
  end if;
  if v_member_active = false then
    return null;
  end if;

  if auth.uid() is not null
     and auth.uid() <> v_member_user
     and not public.is_restaurant_owner(v_restaurant, auth.uid()) then
    return null;
  end if;

  update public.orders
     set assigned_to = p_team_member_id,
         claimed_at  = timezone('utc', now()),
         updated_at  = timezone('utc', now())
   where id = p_order_id
     and type = 'escalation'
     and assigned_to is null
  returning * into v_order;

  return v_order;
end;
$$;

revoke all on function public.claim_escalation(uuid, uuid) from public;
grant execute on function public.claim_escalation(uuid, uuid) to authenticated, service_role;
