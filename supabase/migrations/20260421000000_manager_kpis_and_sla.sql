-- =============================================================================
-- Manager KPIs + SLA bookkeeping — Phase 5
-- =============================================================================
-- 1. restaurant_kpis_today RPC — single round trip for the Overview screen.
-- 2. sla_notification_log — tracks which unassigned conversations already
--    fired an SLA-breach push, so the cron job doesn't spam managers.
-- =============================================================================

-- ---- 1. KPI aggregation ---------------------------------------------------
create or replace function public.restaurant_kpis_today(p_restaurant_id uuid)
returns table (
  unassigned_count       int,
  human_active_count     int,
  bot_active_count       int,
  expired_count          int,
  orders_pending_count   int,
  agents_on_shift_count  int
)
language sql stable security definer set search_path = public as $$
  select
    (select count(*)::int from public.conversations
      where restaurant_id = p_restaurant_id
        and handler_mode = 'unassigned'
        and status = 'active'),
    (select count(*)::int from public.conversations
      where restaurant_id = p_restaurant_id
        and handler_mode = 'human'
        and status = 'active'),
    (select count(*)::int from public.conversations
      where restaurant_id = p_restaurant_id
        and handler_mode = 'bot'
        and status = 'active'),
    (select count(*)::int from public.conversations
      where restaurant_id = p_restaurant_id
        and status = 'active'
        and last_inbound_at < now() - interval '24 hours'),
    (select count(*)::int from public.orders
      where restaurant_id = p_restaurant_id
        and type = 'escalation'
        and status = 'pending'),
    (select count(distinct tm.id)::int
       from public.team_members tm
       join public.agent_shifts s on s.team_member_id = tm.id
      where tm.restaurant_id = p_restaurant_id
        and tm.is_active = true
        and s.starts_at <= now()
        and s.ends_at > now())
  where public.is_restaurant_admin(p_restaurant_id, auth.uid());
$$;

revoke all on function public.restaurant_kpis_today(uuid) from public;
grant execute on function public.restaurant_kpis_today(uuid) to authenticated, service_role;

-- ---- 2. SLA notification bookkeeping --------------------------------------
create table if not exists public.sla_notification_log (
  id              uuid primary key default gen_random_uuid(),
  restaurant_id   uuid not null references public.restaurants(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  notified_at     timestamptz not null default now(),
  notification_type text not null default 'sla_breach'
);

create index if not exists sla_notification_log_conv_idx
  on public.sla_notification_log (conversation_id, notified_at desc);
create index if not exists sla_notification_log_restaurant_idx
  on public.sla_notification_log (restaurant_id, notified_at desc);

alter table public.sla_notification_log enable row level security;

drop policy if exists sla_notification_log_select_admin on public.sla_notification_log;
create policy sla_notification_log_select_admin
  on public.sla_notification_log
  for select
  using (public.is_restaurant_admin(restaurant_id, auth.uid()));

-- Inserts happen via service-role from the SLA sweep cron.
