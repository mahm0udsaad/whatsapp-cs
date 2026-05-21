-- Nehgz Hub Webhook Events
-- Append-only log of webhook deliveries from the Nehgz Hub. Used for:
--   1) Idempotency: a duplicate POST with the same event_id is a no-op.
--   2) Replay/debug: we can inspect the raw payload after the fact.
-- The Nehgz Hub itself can re-send via GET /api/v1/webhooks/events.

create table public.nehgz_webhook_events (
  event_id      text         primary key,           -- UUID from the Hub payload
  restaurant_id uuid         not null references public.restaurants(id) on delete cascade,
  merchant_id   text,                               -- echoed from payload, helps debugging
  event         text         not null,              -- e.g. booking.created
  occurred_at   timestamptz,                        -- parsed from payload.occurred_at
  payload       jsonb        not null,
  received_at   timestamptz  not null default now(),
  processed_at  timestamptz,                        -- set when push fanout has run
  process_error text                                -- last failure reason, if any
);

create index nehgz_webhook_events_restaurant_idx
  on public.nehgz_webhook_events (restaurant_id, received_at desc);

create index nehgz_webhook_events_event_idx
  on public.nehgz_webhook_events (event, received_at desc);

alter table public.nehgz_webhook_events enable row level security;
