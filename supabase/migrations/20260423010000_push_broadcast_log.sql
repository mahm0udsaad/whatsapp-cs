-- =============================================================================
-- push_broadcast_log — observability for the broadcast-escalation endpoint
-- =============================================================================
-- Every invocation of /api/internal/broadcast-escalation appends one row so
-- we can diagnose "I didn't get a notification" without tailing Vercel logs.
--
-- Schema mirrors the endpoint's response shape. `ok=false` rows capture
-- failure paths (no recipients, no tokens, expo error) so we can query for
-- silent drops.
-- =============================================================================

create table if not exists public.push_broadcast_log (
  id                  uuid primary key default gen_random_uuid(),
  order_id            uuid references public.orders(id) on delete cascade,
  restaurant_id       uuid,
  kind                text not null check (kind in ('escalation','reservation')),
  ok                  boolean not null,
  sent                int not null default 0,
  skipped             int not null default 0,
  invalid             int not null default 0,
  on_duty_count       int not null default 0,
  recipient_count     int not null default 0,
  manager_fallback    boolean not null default false,
  skipped_reason      text,
  error_message       text,
  created_at          timestamptz not null default now()
);

create index if not exists push_broadcast_log_order_idx
  on public.push_broadcast_log (order_id, created_at desc);
create index if not exists push_broadcast_log_restaurant_idx
  on public.push_broadcast_log (restaurant_id, created_at desc);

alter table public.push_broadcast_log enable row level security;

-- Managers (owner + admin team members) can read their tenant's log. Writes
-- happen via service-role only.
drop policy if exists push_broadcast_log_select_admin on public.push_broadcast_log;
create policy push_broadcast_log_select_admin
  on public.push_broadcast_log
  for select
  using (
    restaurant_id is not null
    and public.is_restaurant_admin(restaurant_id, auth.uid())
  );
