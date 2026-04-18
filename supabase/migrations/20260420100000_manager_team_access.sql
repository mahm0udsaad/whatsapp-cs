-- =============================================================================
-- Manager Team Access — Phase 3
-- =============================================================================
-- Extends team_members RLS so an admin team_member (not only the restaurant
-- owner) can read every member of their tenant. Needed for the mobile Team
-- roster screen. Writes remain owner-only — the mobile app never creates
-- team_members; that is dashboard territory.
-- =============================================================================

drop policy if exists team_members_select_self_or_owner on public.team_members;

create policy team_members_select_self_admin_or_owner
  on public.team_members
  for select
  using (
    user_id = auth.uid()
    or public.is_restaurant_admin(restaurant_id, auth.uid())
  );

-- Allow admin team_members (not just owners) to UPDATE is_available on any
-- member of their tenant. This powers the manager "force offline" action.
drop policy if exists team_members_admin_update on public.team_members;
create policy team_members_admin_update
  on public.team_members
  for update
  using (public.is_restaurant_admin(restaurant_id, auth.uid()))
  with check (public.is_restaurant_admin(restaurant_id, auth.uid()));
