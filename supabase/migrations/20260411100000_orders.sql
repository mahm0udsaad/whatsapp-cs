create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  customer_phone text not null,
  customer_name text,
  type text not null check (type in ('reservation', 'escalation')),
  details text not null,
  status text not null default 'pending'
    check (status in ('pending', 'confirmed', 'rejected', 'replied')),
  admin_note text,
  admin_reply text,
  replied_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists orders_restaurant_id_idx on public.orders (restaurant_id);
create index if not exists orders_conversation_id_idx on public.orders (conversation_id);
create index if not exists orders_status_idx on public.orders (status);
create index if not exists orders_type_idx on public.orders (type);

create or replace function public.set_orders_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create trigger orders_updated_at
  before update on public.orders
  for each row execute function public.set_orders_updated_at();
