-- =============================================================================
-- Legacy RLS lockdown.
--
-- The Supabase advisor flagged two public tables with RLS DISABLED:
--   - public.knowledge_chunks      — RAG vectors (multi-tenant content)
--   - public.restaurant_members    — legacy username/password staff table
--
-- Both predate this migration and have always been accessed exclusively via
-- the service-role admin client (`src/lib/supabase/admin.ts`) on the server.
-- Enabling RLS makes that explicit and prevents any future anon/authenticated
-- direct read by mistake.
--
-- Strategy:
--   1. knowledge_chunks  — SELECT for active restaurant members of the same
--                          tenant; no anon/authenticated writes (admin only).
--   2. restaurant_members — RLS enabled with NO public policies. Service-role
--                          bypasses RLS, so the existing member-login flow
--                          continues to work via the admin client.
--
-- Idempotent.
-- =============================================================================

-- ----------------------------------------------------------------------------
-- 1. knowledge_chunks
-- ----------------------------------------------------------------------------
alter table public.knowledge_chunks enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename  = 'knowledge_chunks'
      and policyname = 'knowledge_chunks_select_members'
  ) then
    create policy knowledge_chunks_select_members
      on public.knowledge_chunks
      for select
      using ( public.is_restaurant_member(restaurant_id, auth.uid()) );
  end if;

  -- No insert/update/delete policies for anon/authenticated. The ingest
  -- script (`scripts/ingest-knowledge-base.ts`) and the seeders use the
  -- service-role key which bypasses RLS.
end
$$;

-- ----------------------------------------------------------------------------
-- 2. restaurant_members (legacy username/password staff accounts)
-- ----------------------------------------------------------------------------
alter table public.restaurant_members enable row level security;

-- No policies added. The member-login route in src/lib/member-auth.ts uses the
-- service-role admin client; everything else is denied by default.
