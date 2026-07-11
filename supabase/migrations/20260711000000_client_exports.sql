-- Tracks WhatsApp chat-history exports run via the isolated wa-export service.
-- One row per export session (QR scan → pull → approve → disconnect).
-- The `id` mirrors the export id returned by the wa-export service (crypto.randomUUID).

create table if not exists public.client_exports (
  id uuid primary key,
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  client_name text,
  client_number text,
  status text not null default 'pending_qr',
  counts jsonb,
  archive_path text,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists client_exports_restaurant_id_idx
  on public.client_exports (restaurant_id);

create index if not exists client_exports_created_at_idx
  on public.client_exports (created_at desc);

-- Service-role only (dashboard API routes use the service key). RLS on with no
-- policies = deny to anon/authenticated, matching the other server-managed tables.
alter table public.client_exports enable row level security;

comment on table public.client_exports is
  'WhatsApp chat-history export sessions run via the isolated wa-export service (port 2786 on the VPS). Never uses the shared openwa-api container.';
