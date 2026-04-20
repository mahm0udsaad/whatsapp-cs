-- =============================================================================
-- Team Performance — per-agent metrics + manager notes + goals
-- =============================================================================
-- Adds two SECURITY DEFINER RPCs consumed by the web + mobile performance
-- surfaces, plus two small tables for manager notes and per-agent targets.
--
-- All metrics are derived from data we already record: `messages`,
-- `conversations`, `conversation_claim_events`, `sla_notification_log`,
-- `conversation_label_assignments`. No backfill required.
-- =============================================================================

-- ---- 1. team_performance ---------------------------------------------------
-- One row per team member for the window [p_from, p_to). Inclusive/exclusive
-- on purpose so month-to-month ranges don't double-count midnight rows.
create or replace function public.team_performance(
  p_restaurant_id uuid,
  p_from          timestamptz,
  p_to            timestamptz
) returns table (
  team_member_id            uuid,
  full_name                 text,
  role                      text,
  is_active                 boolean,
  is_available              boolean,
  messages_sent             int,
  conversations_handled     int,
  active_now                int,
  first_response_p50_sec    int,
  first_response_p90_sec    int,
  reply_latency_p50_sec     int,
  takeovers_from_bot        int,
  reassigns_received        int,
  reassigns_given           int,
  sla_breaches              int,
  labels_applied            int,
  approx_hours_worked       numeric
)
language sql stable security definer set search_path = public as $$
with
tenant_members as (
  select tm.id, tm.user_id, tm.full_name, tm.role,
         tm.is_active, tm.is_available
    from team_members tm
   where tm.restaurant_id = p_restaurant_id
),
-- All agent-authored messages in window. `role='agent'` excludes the bot
-- (which has role='assistant') so we measure human effort only.
agent_msgs as (
  select m.sender_team_member_id as tm_id,
         m.conversation_id,
         m.created_at
    from messages m
    join conversations c on c.id = m.conversation_id
   where c.restaurant_id = p_restaurant_id
     and m.role = 'agent'
     and m.sender_team_member_id is not null
     and m.created_at >= p_from
     and m.created_at <  p_to
),
-- For each agent message, find the prior message in the same conversation.
-- A customer→agent adjacency is a "reply"; diff = latency.
reply_latencies as (
  select m.sender_team_member_id as tm_id,
         extract(epoch from (m.created_at - prev.created_at))::int as latency_sec
    from messages m
    join conversations c on c.id = m.conversation_id
    join lateral (
      select p.role, p.created_at
        from messages p
       where p.conversation_id = m.conversation_id
         and p.created_at < m.created_at
       order by p.created_at desc
       limit 1
    ) prev on true
   where c.restaurant_id = p_restaurant_id
     and m.role = 'agent'
     and m.sender_team_member_id is not null
     and m.created_at >= p_from
     and m.created_at <  p_to
     and prev.role = 'customer'  -- customer inbound
),
-- First response time per (agent, conversation): time between last customer
-- inbound *before* the agent's first reply and that first reply.
first_responses as (
  select fa.tm_id, fa.conversation_id,
         extract(epoch from (fa.first_reply - last_cust.created_at))::int as frt_sec
    from (
      select tm_id,
             conversation_id,
             min(created_at) as first_reply
        from agent_msgs
       group by 1, 2
    ) fa
    join lateral (
      select p.created_at
        from messages p
       where p.conversation_id = fa.conversation_id
         and p.created_at < fa.first_reply
         and p.role = 'customer'
       order by p.created_at desc
       limit 1
    ) last_cust on true
),
-- Rough "hours worked" per agent: for each day they sent any message, sum
-- (last_msg - first_msg) capped at 12h. It's a proxy until we have an
-- availability audit log.
daily_windows as (
  select tm_id,
         date_trunc('day', created_at) as day,
         least(
           extract(epoch from (max(created_at) - min(created_at))) / 3600.0,
           12
         ) as hours
    from agent_msgs
   group by 1, 2
),
claim_events as (
  select ce.team_member_id, ce.claimed_by_user_id, ce.event_type, ce.mode
    from conversation_claim_events ce
   where ce.restaurant_id = p_restaurant_id
     and ce.claimed_at >= p_from
     and ce.claimed_at <  p_to
),
sla as (
  select c.assigned_to as tm_id, count(*)::int as breaches
    from sla_notification_log s
    join conversations c on c.id = s.conversation_id
   where s.restaurant_id = p_restaurant_id
     and s.notified_at >= p_from
     and s.notified_at <  p_to
     and c.assigned_to is not null
   group by 1
),
labels_applied as (
  select cla.assigned_by as actor_user_id, count(*)::int as n
    from conversation_label_assignments cla
    join conversation_labels cl on cl.id = cla.label_id
   where cl.restaurant_id = p_restaurant_id
     and cla.assigned_at >= p_from
     and cla.assigned_at <  p_to
     and cla.assigned_by is not null
   group by 1
)
select
  tm.id,
  tm.full_name,
  tm.role,
  tm.is_active,
  tm.is_available,
  coalesce((select count(*)            from agent_msgs where tm_id = tm.id), 0)::int,
  coalesce((select count(distinct conversation_id) from agent_msgs where tm_id = tm.id), 0)::int,
  coalesce((select count(*) from conversations
             where restaurant_id = p_restaurant_id
               and assigned_to = tm.id
               and archived_at is null
               and status = 'active'), 0)::int,
  coalesce((select percentile_cont(0.5) within group (order by frt_sec)
              from first_responses where tm_id = tm.id)::int, 0),
  coalesce((select percentile_cont(0.9) within group (order by frt_sec)
              from first_responses where tm_id = tm.id)::int, 0),
  coalesce((select percentile_cont(0.5) within group (order by latency_sec)
              from reply_latencies where tm_id = tm.id)::int, 0),
  coalesce((select count(*)::int from claim_events
             where team_member_id = tm.id
               and event_type = 'claim'
               and mode = 'human'), 0),
  coalesce((select count(*)::int from claim_events
             where team_member_id = tm.id
               and event_type = 'reassign'), 0),
  coalesce((select count(*)::int from claim_events
             where claimed_by_user_id = tm.user_id
               and team_member_id <> tm.id
               and event_type = 'reassign'), 0),
  coalesce((select breaches from sla where tm_id = tm.id), 0),
  coalesce((select n from labels_applied where actor_user_id = tm.user_id), 0),
  coalesce((select round(sum(hours)::numeric, 1) from daily_windows where tm_id = tm.id), 0)::numeric
from tenant_members tm
where public.is_restaurant_admin(p_restaurant_id, auth.uid())
order by tm.is_active desc, tm.full_name nulls last;
$$;

revoke all on function public.team_performance(uuid, timestamptz, timestamptz) from public;
grant execute on function public.team_performance(uuid, timestamptz, timestamptz)
  to authenticated, service_role;


-- ---- 2. agent_performance_detail -------------------------------------------
-- Two result sets via a composite. Postgres doesn't do multiple result sets
-- cleanly in one RPC, so we return a JSON blob with both:
--   daily: [{ day, messages, conversations, p50_reply_sec }]
--   heatmap: 7x24 matrix of message counts (weekday 0=Sunday)
create or replace function public.agent_performance_detail(
  p_restaurant_id   uuid,
  p_team_member_id  uuid,
  p_from            timestamptz,
  p_to              timestamptz
) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_daily   jsonb;
  v_heatmap jsonb;
begin
  if not public.is_restaurant_admin(p_restaurant_id, auth.uid()) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  with agent_msgs as (
    select m.conversation_id, m.created_at
      from messages m
      join conversations c on c.id = m.conversation_id
     where c.restaurant_id = p_restaurant_id
       and m.sender_team_member_id = p_team_member_id
       and m.role = 'agent'
       and m.created_at >= p_from
       and m.created_at <  p_to
  ),
  reply_latencies as (
    select extract(epoch from (m.created_at - prev.created_at))::int as latency_sec,
           date_trunc('day', m.created_at) as day
      from messages m
      join conversations c on c.id = m.conversation_id
      join lateral (
        select p.role, p.created_at
          from messages p
         where p.conversation_id = m.conversation_id
           and p.created_at < m.created_at
         order by p.created_at desc
         limit 1
      ) prev on true
     where c.restaurant_id = p_restaurant_id
       and m.sender_team_member_id = p_team_member_id
       and m.role = 'agent'
       and m.created_at >= p_from
       and m.created_at <  p_to
       and prev.role = 'customer'
  )
  select jsonb_agg(r)
    into v_daily
    from (
      select
        to_char(date_trunc('day', created_at), 'YYYY-MM-DD') as day,
        count(*)::int as messages,
        count(distinct conversation_id)::int as conversations,
        coalesce((
          select percentile_cont(0.5) within group (order by latency_sec)
            from reply_latencies
           where day = date_trunc('day', am.created_at)
        )::int, 0) as p50_reply_sec
      from agent_msgs am
      group by date_trunc('day', am.created_at)
      order by 1
    ) r;

  with agent_msgs as (
    select m.created_at
      from messages m
      join conversations c on c.id = m.conversation_id
     where c.restaurant_id = p_restaurant_id
       and m.sender_team_member_id = p_team_member_id
       and m.role = 'agent'
       and m.created_at >= p_from
       and m.created_at <  p_to
  )
  select jsonb_agg(r)
    into v_heatmap
    from (
      select extract(dow  from created_at)::int as weekday,
             extract(hour from created_at)::int as hour,
             count(*)::int as messages
        from agent_msgs
       group by 1, 2
       order by 1, 2
    ) r;

  return jsonb_build_object(
    'daily',   coalesce(v_daily,   '[]'::jsonb),
    'heatmap', coalesce(v_heatmap, '[]'::jsonb)
  );
end;
$$;

revoke all on function public.agent_performance_detail(uuid, uuid, timestamptz, timestamptz) from public;
grant execute on function public.agent_performance_detail(uuid, uuid, timestamptz, timestamptz)
  to authenticated, service_role;


-- ---- 3. Manager notes ------------------------------------------------------
-- Free-form notes a manager attaches to an agent's record. No moderation —
-- treat them as private HR scratchpad.
create table if not exists public.team_member_notes (
  id             uuid primary key default gen_random_uuid(),
  restaurant_id  uuid not null references public.restaurants(id) on delete cascade,
  team_member_id uuid not null references public.team_members(id) on delete cascade,
  author_user_id uuid references auth.users(id) on delete set null,
  body           text not null check (length(body) between 1 and 4000),
  created_at     timestamptz not null default now()
);

create index if not exists team_member_notes_tm_idx
  on public.team_member_notes (team_member_id, created_at desc);
create index if not exists team_member_notes_restaurant_idx
  on public.team_member_notes (restaurant_id, created_at desc);

alter table public.team_member_notes enable row level security;

drop policy if exists team_member_notes_select_admin on public.team_member_notes;
create policy team_member_notes_select_admin
  on public.team_member_notes
  for select
  using (public.is_restaurant_admin(restaurant_id, auth.uid()));

drop policy if exists team_member_notes_insert_admin on public.team_member_notes;
create policy team_member_notes_insert_admin
  on public.team_member_notes
  for insert
  with check (
    public.is_restaurant_admin(restaurant_id, auth.uid())
    and author_user_id = auth.uid()
  );

-- Authors can delete their own notes; owners can delete any.
drop policy if exists team_member_notes_delete_self on public.team_member_notes;
create policy team_member_notes_delete_self
  on public.team_member_notes
  for delete
  using (
    public.is_restaurant_admin(restaurant_id, auth.uid())
    and (author_user_id = auth.uid()
         or exists (
           select 1 from restaurants r
            where r.id = restaurant_id and r.owner_id = auth.uid()
         ))
  );


-- ---- 4. Per-agent goals ----------------------------------------------------
-- Single-row-per-agent config with target values. Absent row = no goal set.
create table if not exists public.team_member_goals (
  team_member_id      uuid primary key references public.team_members(id) on delete cascade,
  restaurant_id       uuid not null references public.restaurants(id) on delete cascade,
  target_first_response_sec   int  check (target_first_response_sec is null or target_first_response_sec > 0),
  target_messages_per_day     int  check (target_messages_per_day   is null or target_messages_per_day   > 0),
  updated_at          timestamptz not null default now(),
  updated_by_user_id  uuid references auth.users(id) on delete set null
);

create index if not exists team_member_goals_restaurant_idx
  on public.team_member_goals (restaurant_id);

alter table public.team_member_goals enable row level security;

drop policy if exists team_member_goals_select_admin on public.team_member_goals;
create policy team_member_goals_select_admin
  on public.team_member_goals
  for select
  using (public.is_restaurant_admin(restaurant_id, auth.uid()));

drop policy if exists team_member_goals_upsert_admin on public.team_member_goals;
create policy team_member_goals_upsert_admin
  on public.team_member_goals
  for all
  using (public.is_restaurant_admin(restaurant_id, auth.uid()))
  with check (public.is_restaurant_admin(restaurant_id, auth.uid()));
