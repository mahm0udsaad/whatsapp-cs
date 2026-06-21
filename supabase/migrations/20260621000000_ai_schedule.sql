-- AI bot scheduling: let managers restrict the auto-reply bot to daily working
-- hours, with an optional "run all day on the weekend (Fri/Sat)" override.
--
-- When ai_schedule_enabled is false the bot behaves exactly as before (it runs
-- whenever ai_enabled is true). When enabled, the bot only auto-replies between
-- ai_schedule_start and ai_schedule_end in ai_schedule_timezone; outside those
-- hours new conversations fall back to human agents.
alter table public.restaurants
  add column if not exists ai_schedule_enabled boolean not null default false,
  add column if not exists ai_schedule_start time not null default '00:00',
  add column if not exists ai_schedule_end time not null default '23:59',
  add column if not exists ai_schedule_weekend_24h boolean not null default false,
  add column if not exists ai_schedule_timezone text not null default 'Asia/Riyadh';

comment on column public.restaurants.ai_schedule_enabled is
  'When true, the AI bot only auto-replies within the configured daily window.';
comment on column public.restaurants.ai_schedule_weekend_24h is
  'When true, the AI bot runs 24h on Friday and Saturday regardless of the daily window.';
comment on column public.restaurants.ai_schedule_timezone is
  'IANA timezone used to evaluate the daily AI schedule (default Asia/Riyadh).';
