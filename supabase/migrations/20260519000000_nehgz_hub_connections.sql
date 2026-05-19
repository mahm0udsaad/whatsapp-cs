-- Nehgz Hub Connections
-- Stores the per-merchant Nehgz Hub access token and base URL per restaurant.
-- The token is obtained by exchanging the merchant's email + one-time pairing
-- code against the central API. One row per restaurant (upserted on re-pair).

create table public.nehgz_hub_connections (
  id                 uuid        primary key default gen_random_uuid(),
  restaurant_id      uuid        not null references public.restaurants(id) on delete cascade,
  access_token       text        not null,   -- nhg_pat_... personal access token
  base_url           text        not null,   -- per-merchant API host, e.g. https://glamour.nehgz-sa.com
  merchant_id        text,                   -- merchant identifier returned by the central API
  merchant_name      text,
  merchant_phone     text,
  merchant_timezone  text,
  merchant_locale    text,
  webhook_secret     text,                   -- returned when a webhook is registered
  paired_at          timestamptz not null default now(),
  unique (restaurant_id)
);

alter table public.nehgz_hub_connections enable row level security;
