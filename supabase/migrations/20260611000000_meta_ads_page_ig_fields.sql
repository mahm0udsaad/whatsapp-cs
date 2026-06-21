-- Meta Ads Connections: Page + Instagram fields
-- The pages/posts/status routes read & write these columns, but the original
-- 20260511000000_meta_ads_connections.sql migration never created them, so
-- connecting a Page/Instagram account and all content publishing fails on a
-- fresh database. This migration adds them idempotently (safe to run whether or
-- not the columns were already added manually in an environment).

alter table public.meta_ads_connections
  add column if not exists page_id              text,
  add column if not exists page_name            text,
  add column if not exists page_access_token    text,
  add column if not exists instagram_account_id text,
  add column if not exists instagram_username   text;
