-- =============================================================================
-- customers — tenant-scoped directory of contactable customers
-- =============================================================================
-- Separate from `conversations.customer_phone` because customers in this
-- directory may not have messaged us yet (imported from Rekaz, a CSV, or
-- added manually). Used as the audience source for marketing campaigns.
-- =============================================================================

create table if not exists public.customers (
  id             uuid primary key default gen_random_uuid(),
  restaurant_id  uuid not null references public.restaurants(id) on delete cascade,
  phone_number   text not null,
  full_name      text,
  -- Where this row came from. 'rekaz_import' | 'manual' | 'csv_import' | 'conversation'
  source         text not null default 'manual',
  -- Original Rekaz customer id (or CSV row ref) so re-imports can upsert.
  source_ref     text,
  metadata       jsonb not null default '{}'::jsonb,
  opted_out      boolean not null default false,
  last_seen_at   timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint customers_phone_e164 check (phone_number ~ '^\+[1-9]\d{1,14}$'),
  constraint customers_source_check check (source in (
    'rekaz_import','manual','csv_import','conversation'
  ))
);

-- One phone per tenant. Upserts by (restaurant_id, phone_number).
create unique index if not exists customers_restaurant_phone_idx
  on public.customers (restaurant_id, phone_number);
create index if not exists customers_restaurant_last_seen_idx
  on public.customers (restaurant_id, last_seen_at desc nulls last);

alter table public.customers enable row level security;

-- Admins (owner + admin team members + super_admin) can read/write their
-- tenant's rows. Writes also happen via service-role during imports.
drop policy if exists customers_select_admin on public.customers;
create policy customers_select_admin
  on public.customers
  for select
  using (public.is_restaurant_admin(restaurant_id, auth.uid()));

drop policy if exists customers_upsert_admin on public.customers;
create policy customers_upsert_admin
  on public.customers
  for all
  using (public.is_restaurant_admin(restaurant_id, auth.uid()))
  with check (public.is_restaurant_admin(restaurant_id, auth.uid()));

-- Keep opted_out in sync with opt_outs table. Inserts into opt_outs flip the
-- corresponding customers row (if any) to opted_out=true.
create or replace function public.sync_opt_out_to_customers()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    update public.customers
       set opted_out = true, updated_at = now()
     where restaurant_id = new.restaurant_id
       and phone_number = new.phone_number;
  elsif tg_op = 'DELETE' then
    update public.customers
       set opted_out = false, updated_at = now()
     where restaurant_id = old.restaurant_id
       and phone_number = old.phone_number;
  end if;
  return null;
end;
$$;

drop trigger if exists opt_outs_sync_customers on public.opt_outs;
create trigger opt_outs_sync_customers
  after insert or delete on public.opt_outs
  for each row execute function public.sync_opt_out_to_customers();
