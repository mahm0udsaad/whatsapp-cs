-- =============================================================================
-- Fix infinite recursion on public.team_members RLS.
--
-- The two existing policies (`team_members_select`, `team_members_admin_manage`)
-- both contain `EXISTS (SELECT 1 FROM team_members ...)` clauses. Postgres
-- re-evaluates RLS on the inner SELECT, which re-evaluates RLS on its inner
-- SELECT, etc. — Postgres detects this and errors with
--   ERROR: 42P17: infinite recursion detected in policy for relation "team_members"
-- on EVERY read attempt by an authenticated user.
--
-- Fix: rebuild the policies on top of `public.is_restaurant_member` /
-- `public.is_restaurant_owner`, which are SECURITY DEFINER functions that
-- bypass RLS internally — no recursion, single check.
--
-- Idempotent.
-- =============================================================================

-- Drop the recursive policies if they exist.
do $$
begin
  if exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='team_members'
      and policyname='team_members_select'
  ) then
    drop policy team_members_select on public.team_members;
  end if;

  if exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='team_members'
      and policyname='team_members_admin_manage'
  ) then
    drop policy team_members_admin_manage on public.team_members;
  end if;
end
$$;

-- 1. SELECT: a user can always read their own team_members rows (so the
--    mobile app's loadTeamMemberships call works), AND any restaurant owner
--    or super-admin can read all members of their tenant.
create policy team_members_select_self_or_owner
  on public.team_members
  for select
  using (
    user_id = auth.uid()
    or public.is_restaurant_owner(restaurant_id, auth.uid())
  );

-- 2. INSERT/UPDATE/DELETE: only the restaurant owner (or super-admin).
create policy team_members_owner_insert
  on public.team_members
  for insert
  with check ( public.is_restaurant_owner(restaurant_id, auth.uid()) );

create policy team_members_owner_update
  on public.team_members
  for update
  using ( public.is_restaurant_owner(restaurant_id, auth.uid()) )
  with check ( public.is_restaurant_owner(restaurant_id, auth.uid()) );

create policy team_members_owner_delete
  on public.team_members
  for delete
  using ( public.is_restaurant_owner(restaurant_id, auth.uid()) );
