-- ===========================================================================
-- Move background schedulers off Vercel Cron and onto Supabase's built-in
-- pg_cron + pg_net. Vercel Hobby caps crons at 2 jobs / daily granularity;
-- this project needs three /api/internal/* endpoints at per-minute cadence:
--
--   * /api/internal/process-ai-replies        (POST, Bearer CRON_SECRET)
--   * /api/internal/escalation-timeout-sweep  (POST, Bearer CRON_SECRET)
--   * /api/internal/sla-sweep                 (GET,  x-cron-secret header)
--
-- All three endpoints already exist and are guarded by CRON_SECRET. We just
-- call them from Postgres via pg_net (async HTTP) on a cron schedule.
--
-- ---------------------------------------------------------------------------
-- ONE-TIME MANUAL STEP (required after applying this migration):
--
-- In the Supabase Studio SQL editor, create two Vault secrets so the cron
-- functions below know where to POST and which Bearer token to send:
--
--   select vault.create_secret(
--     'https://whatsapp-cs.vercel.app',        -- replace with your prod URL
--     'cron_base_url',
--     'Base URL for internal cron HTTP calls'
--   );
--   select vault.create_secret(
--     '<paste your CRON_SECRET here>',         -- same value as Vercel env
--     'cron_secret',
--     'Shared Bearer secret for /api/internal/* endpoints'
--   );
--
-- If either secret is missing the cron function logs a warning and skips
-- that tick — jobs start firing automatically once both are present.
-- ---------------------------------------------------------------------------

-- 1. Required extensions. pg_net is already installed in `public` on Supabase;
-- pg_cron needs to be enabled. `create extension if not exists` is a no-op
-- when the extension is already installed (even in a different schema).
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- 2. Private schema for the helper functions so they're not exposed to
--    PostgREST. Only super_admin / service_role should call these.
create schema if not exists internal_cron;
revoke all on schema internal_cron from public;
grant usage on schema internal_cron to postgres, service_role;

-- ---------------------------------------------------------------------------
-- Helper: read a Vault secret by name. SECURITY DEFINER so pg_cron (which
-- runs as postgres) can access decrypted_secrets regardless of invoker.
-- ---------------------------------------------------------------------------
create or replace function internal_cron.get_secret(name text)
returns text
language sql
stable
security definer
set search_path = vault, public
as $$
  select decrypted_secret
  from vault.decrypted_secrets
  where vault.decrypted_secrets.name = $1
  limit 1;
$$;

revoke all on function internal_cron.get_secret(text) from public;
grant execute on function internal_cron.get_secret(text) to postgres, service_role;

-- ---------------------------------------------------------------------------
-- Helper: call one of the /api/internal/* endpoints. Fire-and-forget via
-- pg_net — the response is discarded. A longer 30s timeout absorbs Vercel
-- cold starts without blocking the scheduler.
-- ---------------------------------------------------------------------------
create or replace function internal_cron.call_endpoint(
  path   text,
  method text default 'POST'
)
returns bigint
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  base_url text := internal_cron.get_secret('cron_base_url');
  secret   text := internal_cron.get_secret('cron_secret');
  req_id   bigint;
  full_url text;
  hdrs     jsonb;
begin
  if base_url is null or secret is null then
    raise warning '[internal_cron] cron_base_url or cron_secret not set in vault — skipping %', path;
    return null;
  end if;

  full_url := base_url || path;

  -- Both header spellings are sent so the endpoint-specific auth check
  -- (Authorization: Bearer vs x-cron-secret) is satisfied uniformly.
  hdrs := jsonb_build_object(
    'Authorization', 'Bearer ' || secret,
    'x-cron-secret', secret,
    'Content-Type',  'application/json'
  );

  if upper(method) = 'GET' then
    select net.http_get(
      url            := full_url,
      headers        := hdrs,
      timeout_milliseconds := 30000
    ) into req_id;
  else
    select net.http_post(
      url            := full_url,
      body           := '{}'::jsonb,
      headers        := hdrs,
      timeout_milliseconds := 30000
    ) into req_id;
  end if;

  return req_id;
end;
$$;

revoke all on function internal_cron.call_endpoint(text, text) from public;
grant execute on function internal_cron.call_endpoint(text, text) to postgres, service_role;

-- ---------------------------------------------------------------------------
-- Schedule the three jobs. Each schedule call is wrapped in a DO block so
-- the migration is idempotent — cron.unschedule throws when no job exists,
-- so we use the try-catch pattern. `cron.schedule` returns the jobid.
-- ---------------------------------------------------------------------------
do $$
declare
  job_names text[] := array[
    'internal_process_ai_replies',
    'internal_escalation_timeout_sweep',
    'internal_sla_sweep'
  ];
  jname text;
begin
  foreach jname in array job_names loop
    begin
      perform cron.unschedule(jname);
    exception when others then
      -- Job didn't exist — ignore.
      null;
    end;
  end loop;
end;
$$;

select cron.schedule(
  'internal_process_ai_replies',
  '* * * * *',
  $$ select internal_cron.call_endpoint('/api/internal/process-ai-replies', 'POST'); $$
);

select cron.schedule(
  'internal_escalation_timeout_sweep',
  '* * * * *',
  $$ select internal_cron.call_endpoint('/api/internal/escalation-timeout-sweep', 'POST'); $$
);

select cron.schedule(
  'internal_sla_sweep',
  '* * * * *',
  $$ select internal_cron.call_endpoint('/api/internal/sla-sweep', 'GET'); $$
);

-- ---------------------------------------------------------------------------
-- Observability: a view over cron.job_run_details so you can monitor success
-- from Studio without poking at the system catalog directly.
-- ---------------------------------------------------------------------------
create or replace view internal_cron.recent_runs as
  select
    jobid,
    jobname,
    status,
    return_message,
    start_time,
    end_time,
    end_time - start_time as duration
  from cron.job_run_details jrd
  join cron.job j using (jobid)
  where jobname like 'internal\_%' escape '\'
  order by start_time desc
  limit 200;

grant select on internal_cron.recent_runs to postgres, service_role;
