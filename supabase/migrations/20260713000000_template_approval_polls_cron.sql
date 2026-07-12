-- =============================================================================
-- Template approval polling: table (if missing) + pg_cron schedule.
-- =============================================================================
-- Fixes templates stuck "under review": the poller previously only ran as a
-- fire-and-forget side effect of loading a template list, and the Twilio
-- response parsing bug meant every poll errored until abandonment. This
-- migration makes /api/internal/poll-template-approvals run every minute via
-- the internal_cron infrastructure from 20260422000000_internal_pg_cron_jobs.sql.
--
-- The table may already exist in prod (it was created out-of-band); the
-- create is idempotent so local + prod converge.
-- =============================================================================

create table if not exists public.template_approval_polls (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.marketing_templates(id) on delete cascade,
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  twilio_content_sid text not null,
  status text not null default 'polling', -- polling | completed | abandoned
  poll_count integer not null default 0,
  next_poll_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Poller lookup: due rows.
create index if not exists idx_template_approval_polls_due
  on public.template_approval_polls (status, next_poll_at);

create index if not exists idx_template_approval_polls_template
  on public.template_approval_polls (template_id);

-- Internal table: service role only (no policies = no anon/authenticated access).
alter table public.template_approval_polls enable row level security;

-- ---------------------------------------------------------------------------
-- Schedule the poller. The endpoint self-limits (only due polls, max 50) so a
-- minute cadence is cheap: zero Twilio calls when nothing is pending.
-- ---------------------------------------------------------------------------
do $$
begin
  begin
    perform cron.unschedule('internal_poll_template_approvals');
  exception when others then
    null;
  end;
end
$$;

select cron.schedule(
  'internal_poll_template_approvals',
  '* * * * *',
  $$ select internal_cron.call_endpoint('/api/internal/poll-template-approvals', 'POST'); $$
);
