-- =============================================================================
-- campaign_send_jobs + twilio_status_events + extended campaign statuses
-- =============================================================================
-- Moves per-recipient send out of the inline Vercel request into a queue that
-- the /api/internal/campaign-worker endpoint drains via pg_cron (every 15s).
-- Adds an idempotency table for Twilio status callbacks so the webhook is
-- safe against Twilio's at-least-once delivery.
-- =============================================================================

-- 1. Queue of per-recipient send attempts. One row is inserted per pending
--    campaign_recipient when the send endpoint is hit. The worker locks a
--    batch with SELECT ... FOR UPDATE SKIP LOCKED, calls Twilio, and records
--    the outcome. Failures are either retried with backoff (429/5xx) or
--    moved to a terminal state immediately (4xx).
create table if not exists public.campaign_send_jobs (
  id             uuid primary key default gen_random_uuid(),
  campaign_id    uuid not null references public.marketing_campaigns(id) on delete cascade,
  recipient_id   uuid not null references public.campaign_recipients(id) on delete cascade,
  attempt        integer not null default 0,
  status         text not null default 'pending',
  next_run_at    timestamptz not null default now(),
  locked_at      timestamptz,
  locked_by      text,
  last_error     text,
  error_code     text,
  twilio_message_sid text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint campaign_send_jobs_status_check check (status in (
    'pending','sending','sent','failed_retryable','failed_terminal'
  )),
  constraint campaign_send_jobs_attempt_check check (attempt >= 0)
);

create index if not exists campaign_send_jobs_poll_idx
  on public.campaign_send_jobs (status, next_run_at)
  where status in ('pending','failed_retryable');
create index if not exists campaign_send_jobs_campaign_idx
  on public.campaign_send_jobs (campaign_id);
create unique index if not exists campaign_send_jobs_recipient_idx
  on public.campaign_send_jobs (recipient_id);

alter table public.campaign_send_jobs enable row level security;

-- Service-role writes; admins of the tenant can read their jobs for observability.
drop policy if exists campaign_send_jobs_select_admin on public.campaign_send_jobs;
create policy campaign_send_jobs_select_admin
  on public.campaign_send_jobs
  for select
  using (
    exists (
      select 1
      from public.marketing_campaigns c
      where c.id = campaign_send_jobs.campaign_id
        and public.is_restaurant_admin(c.restaurant_id, auth.uid())
    )
  );

-- 2. Idempotency table for Twilio status callbacks. Primary key on
--    (message_sid, status) means a replay of the same (sid, transition) is a
--    no-op via `insert ... on conflict do nothing`.
create table if not exists public.twilio_status_events (
  message_sid text not null,
  status      text not null,
  created_at  timestamptz not null default now(),
  primary key (message_sid, status)
);

-- No RLS — only service-role writes from the webhook; nobody else reads.

-- 3. Extend the campaign status enum (it's stored as text, not a real enum,
--    so the only enforcement is a CHECK constraint if one exists). Try to
--    drop an existing one and re-create with the extended set. If no
--    constraint exists, do nothing.
do $$
declare
  conname text;
begin
  select c.conname into conname
  from pg_constraint c
  join pg_class t on c.conrelid = t.oid
  where t.relname = 'marketing_campaigns'
    and c.contype = 'c'
    and pg_get_constraintdef(c.oid) ilike '%status%';

  if conname is not null then
    execute format('alter table public.marketing_campaigns drop constraint %I', conname);
  end if;
end
$$;

alter table public.marketing_campaigns
  add constraint marketing_campaigns_status_check
  check (status in (
    'draft',
    'queued',
    'scheduled',
    'processing',
    'sending',
    'paused',
    'pending_template_approval',
    'completed',
    'partially_completed',
    'failed',
    'cancelled'
  ));

-- 4. Helper: recompute campaign aggregate counts from jobs. Called by the
--    worker at the end of each batch.
create or replace function public.recompute_campaign_counts(p_campaign_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sent    int;
  v_failed  int;
  v_pending int;
begin
  select
    count(*) filter (where status = 'sent'),
    count(*) filter (where status = 'failed_terminal'),
    count(*) filter (where status in ('pending','sending','failed_retryable'))
  into v_sent, v_failed, v_pending
  from public.campaign_send_jobs
  where campaign_id = p_campaign_id;

  update public.marketing_campaigns
     set sent_count   = v_sent,
         failed_count = v_failed,
         status = case
           when v_pending > 0 then status
           when v_failed = 0 then 'completed'
           when v_sent  = 0 then 'failed'
           else 'partially_completed'
         end,
         sending_completed_at = case
           when v_pending = 0 and sending_completed_at is null
             then now()
           else sending_completed_at
         end,
         updated_at = now()
   where id = p_campaign_id;
end;
$$;

grant execute on function public.recompute_campaign_counts(uuid) to service_role;

-- 5. Atomic batch claim. Marks up to p_limit jobs in (pending,failed_retryable)
--    whose `next_run_at <= now()` as `sending` and returns the rows so the
--    Node worker can dispatch them. `for update skip locked` makes this safe
--    to run from multiple worker invocations concurrently — each call grabs
--    a disjoint set of rows.
create or replace function public.claim_campaign_send_jobs(p_limit int)
returns table (
  id           uuid,
  campaign_id  uuid,
  recipient_id uuid,
  attempt      integer
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with picked as (
    select j.id
    from public.campaign_send_jobs j
    where j.status in ('pending','failed_retryable')
      and j.next_run_at <= now()
    order by j.next_run_at, j.created_at
    for update skip locked
    limit p_limit
  )
  update public.campaign_send_jobs cs
     set status     = 'sending',
         locked_at  = now(),
         locked_by  = 'worker',
         updated_at = now()
    from picked
   where cs.id = picked.id
   returning cs.id, cs.campaign_id, cs.recipient_id, cs.attempt;
end;
$$;

grant execute on function public.claim_campaign_send_jobs(int) to service_role;
