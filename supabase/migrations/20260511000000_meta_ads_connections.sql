-- Meta Ads Connections
-- Stores the OAuth access token and selected ad account per restaurant.
-- One row per restaurant (upserted on reconnect).

create table public.meta_ads_connections (
  id                uuid        primary key default gen_random_uuid(),
  restaurant_id     uuid        not null references public.restaurants(id) on delete cascade,
  meta_user_id      text,
  user_access_token text        not null,
  ad_account_id     text,        -- e.g. act_123456789 (null until user picks one)
  ad_account_name   text,
  connected_at      timestamptz not null default now(),
  expires_at        timestamptz,
  unique (restaurant_id)
);

alter table public.meta_ads_connections enable row level security;
