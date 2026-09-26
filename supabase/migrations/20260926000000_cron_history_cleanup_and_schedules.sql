-- pg_cron writes one row to cron.job_run_details per run and never prunes it.
-- With several every-minute jobs this reached ~885k rows / 202 MB (83% of the
-- database) on the Free-tier instance, starved it and took the DB offline on
-- 2026-09-25. This migration:
--   1. schedules a nightly prune of cron.job_run_details (keep 3 days);
--   2. relaxes the internal worker schedules. The Twilio webhook already
--      processes AI replies inline, so the cron worker is only a backstop.
-- Existing jobs keep their current `active` flag — re-enable deliberately.

do $$
begin
  perform cron.unschedule('internal_cron_history_cleanup');
exception when others then
  null;
end;
$$;

select cron.schedule(
  'internal_cron_history_cleanup',
  '17 3 * * *',
  $$ delete from cron.job_run_details where end_time < now() - interval '3 days'; $$
);

do $$
declare
  j record;
begin
  for j in
    select jobid, jobname from cron.job
    where jobname in (
      'internal_process_ai_replies',
      'internal_campaign_worker',
      'internal_escalation_timeout_sweep',
      'internal_sla_sweep',
      'internal_poll_template_approvals'
    )
  loop
    perform cron.alter_job(
      j.jobid,
      schedule := case j.jobname
        when 'internal_process_ai_replies'       then '*/2 * * * *'
        when 'internal_campaign_worker'          then '*/2 * * * *'
        when 'internal_escalation_timeout_sweep' then '*/5 * * * *'
        when 'internal_sla_sweep'                then '*/5 * * * *'
        when 'internal_poll_template_approvals'  then '*/30 * * * *'
      end
    );
  end loop;
end;
$$;
