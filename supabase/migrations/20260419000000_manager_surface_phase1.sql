-- =============================================================================
-- Manager Surface — Phase 1
-- =============================================================================
-- Lays the groundwork for the mobile manager interface:
--   1. is_restaurant_admin() helper (owner OR super_admin OR team_member.role='admin')
--   2. restaurants.ai_enabled column (global AI kill-switch)
--   3. Defensive: ensure conversations.bot_paused exists (referenced by app code
--      but missing from the migration history)
--   4. Backfill missing RLS policies on public.conversations so admins + agents
--      cannot cross-tenant leak rows
--   5. Policy allowing admins to UPDATE restaurants (for the kill-switch)
--   6. ai_kill_switch_log audit table
-- Idempotent.
-- =============================================================================

-- ---- 1. Manager helper ----------------------------------------------------
create or replace function public.is_restaurant_admin(
  p_restaurant_id uuid,
  p_user_id uuid
) returns boolean
language sql stable security definer set search_path = public as $$
  select
    p_user_id is not null
    and p_restaurant_id is not null
    and (
      -- Restaurant owner
      exists (
        select 1 from public.restaurants r
         where r.id = p_restaurant_id
           and r.owner_id = p_user_id
      )
      -- Admin-role team member
      or exists (
        select 1 from public.team_members tm
         where tm.restaurant_id = p_restaurant_id
           and tm.user_id = p_user_id
           and tm.is_active = true
           and tm.role = 'admin'
      )
      -- Cross-tenant super admin
      or exists (
        select 1 from public.profiles pr
         where pr.id = p_user_id
           and pr.is_super_admin = true
      )
    );
$$;

revoke all on function public.is_restaurant_admin(uuid, uuid) from public;
grant execute on function public.is_restaurant_admin(uuid, uuid)
  to authenticated, service_role;

-- ---- 2. Restaurant-level AI kill-switch -----------------------------------
alter table public.restaurants
  add column if not exists ai_enabled boolean not null default true;

-- ---- 3. Defensive: ensure bot_paused exists -------------------------------
-- Referenced by src/lib/ai-reply-jobs.ts and src/app/api/orders/[id]/claim/
-- but never declared in a migration. Safe to add if already present.
alter table public.conversations
  add column if not exists bot_paused boolean not null default false;

-- ---- 4. Conversations RLS backfill ----------------------------------------
-- The table currently has no explicit member-level SELECT/UPDATE policies.
-- The mobile inbox works only because client code filters by restaurant_id.
-- Add explicit policies so the DB itself enforces tenant isolation.
alter table public.conversations enable row level security;

drop policy if exists conversations_select_members on public.conversations;
create policy conversations_select_members
  on public.conversations
  for select
  using (public.is_restaurant_member(restaurant_id, auth.uid()));

drop policy if exists conversations_update_members on public.conversations;
create policy conversations_update_members
  on public.conversations
  for update
  using (public.is_restaurant_member(restaurant_id, auth.uid()))
  with check (public.is_restaurant_member(restaurant_id, auth.uid()));

-- ---- 5. Admins can update restaurants (needed for ai_enabled toggle) ------
drop policy if exists restaurants_update_admin on public.restaurants;
create policy restaurants_update_admin
  on public.restaurants
  for update
  using (public.is_restaurant_admin(id, auth.uid()))
  with check (public.is_restaurant_admin(id, auth.uid()));

-- ---- 6. AI kill-switch audit log ------------------------------------------
create table if not exists public.ai_kill_switch_log (
  id              uuid primary key default gen_random_uuid(),
  restaurant_id   uuid not null references public.restaurants(id) on delete cascade,
  actor_user_id   uuid not null references auth.users(id),
  enabled_from    boolean not null,
  enabled_to      boolean not null,
  created_at      timestamptz not null default now()
);

create index if not exists ai_kill_switch_log_restaurant_idx
  on public.ai_kill_switch_log (restaurant_id, created_at desc);

alter table public.ai_kill_switch_log enable row level security;

drop policy if exists ai_kill_switch_log_select_admin on public.ai_kill_switch_log;
create policy ai_kill_switch_log_select_admin
  on public.ai_kill_switch_log
  for select
  using (public.is_restaurant_admin(restaurant_id, auth.uid()));

-- Writes go through service-role only (server routes), so no insert policy.
