-- =============================================================================
-- Schedule the campaign send worker via pg_cron.
-- =============================================================================
-- Reuses the infrastructure from 20260422000000_internal_pg_cron_jobs.sql:
-- * internal_cron.get_secret      — reads vault secrets
-- * internal_cron.call_endpoint   — fire-and-forget pg_net POST with CRON_SECRET
--
-- The /api/internal/campaign-worker endpoint drains up to 100 queued jobs per
-- call. A minute cadence (pg_cron's finest granularity) is fine — the worker
-- is idempotent and each call costs one Twilio round-trip per locked job.
-- =============================================================================

do $$
begin
  begin
    perform cron.unschedule('internal_campaign_worker');
  exception when others then
    null;
  end;
end
$$;

select cron.schedule(
  'internal_campaign_worker',
  '* * * * *',
  $$ select internal_cron.call_endpoint('/api/internal/campaign-worker', 'POST'); $$
);
