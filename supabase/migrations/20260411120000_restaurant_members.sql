create extension if not exists citext;

create table if not exists public.restaurant_members (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  username citext not null unique,
  password_hash text not null,
  full_name text,
  created_by uuid references public.profiles(id) on delete set null,
  last_login_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists restaurant_members_restaurant_id_idx
  on public.restaurant_members (restaurant_id);

drop trigger if exists restaurant_members_set_updated_at on public.restaurant_members;
create trigger restaurant_members_set_updated_at
  before update on public.restaurant_members
  for each row execute function public.set_updated_at_timestamp();
