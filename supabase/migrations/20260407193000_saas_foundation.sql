create extension if not exists pgcrypto;

create or replace function public.set_updated_at_timestamp()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create table if not exists public.whatsapp_numbers (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid references public.restaurants(id) on delete set null,
  phone_number text not null,
  provider text not null default 'twilio' check (provider = 'twilio'),
  source_type text not null default 'pool' check (source_type in ('pool', 'customer_owned')),
  is_primary boolean not null default false,
  assignment_status text not null default 'available' check (
    assignment_status in ('available', 'reserved', 'assigned', 'active', 'suspended', 'released')
  ),
  onboarding_status text not null default 'unclaimed' check (
    onboarding_status in ('unclaimed', 'pending_embedded_signup', 'pending_sender_registration', 'pending_test', 'active', 'failed')
  ),
  twilio_subaccount_sid text,
  twilio_messaging_service_sid text,
  twilio_whatsapp_sender_sid text,
  meta_business_account_id text,
  meta_waba_id text,
  config jsonb not null default '{}'::jsonb,
  last_error text,
  assigned_at timestamptz,
  released_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint whatsapp_numbers_phone_number_key unique (phone_number)
);

create index if not exists whatsapp_numbers_restaurant_id_idx
  on public.whatsapp_numbers (restaurant_id);

create index if not exists whatsapp_numbers_assignment_status_idx
  on public.whatsapp_numbers (assignment_status);

create index if not exists whatsapp_numbers_onboarding_status_idx
  on public.whatsapp_numbers (onboarding_status);

create index if not exists whatsapp_numbers_twilio_subaccount_sid_idx
  on public.whatsapp_numbers (twilio_subaccount_sid);

create unique index if not exists whatsapp_numbers_primary_per_restaurant_idx
  on public.whatsapp_numbers (restaurant_id)
  where is_primary;

create table if not exists public.provisioning_runs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  restaurant_id uuid references public.restaurants(id) on delete set null,
  whatsapp_number_id uuid references public.whatsapp_numbers(id) on delete set null,
  status text not null default 'draft' check (
    status in ('draft', 'pending_number_assignment', 'pending_embedded_signup', 'pending_sender_registration', 'pending_knowledge_sync', 'active', 'failed')
  ),
  current_step text not null default 'account_created',
  last_error text,
  metadata jsonb not null default '{}'::jsonb,
  started_at timestamptz not null default timezone('utc', now()),
  completed_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists provisioning_runs_owner_id_idx
  on public.provisioning_runs (owner_id);

create index if not exists provisioning_runs_restaurant_id_idx
  on public.provisioning_runs (restaurant_id);

create index if not exists provisioning_runs_whatsapp_number_id_idx
  on public.provisioning_runs (whatsapp_number_id);

create index if not exists provisioning_runs_status_idx
  on public.provisioning_runs (status);

alter table public.restaurants
  add column if not exists primary_whatsapp_number_id uuid references public.whatsapp_numbers(id) on delete set null,
  add column if not exists provisioning_status text not null default 'draft' check (
    provisioning_status in ('draft', 'pending_number_assignment', 'pending_embedded_signup', 'pending_sender_registration', 'pending_knowledge_sync', 'active', 'failed')
  ),
  add column if not exists onboarding_completed_at timestamptz,
  add column if not exists activation_started_at timestamptz,
  add column if not exists activated_at timestamptz,
  add column if not exists metadata jsonb not null default '{}'::jsonb;

create unique index if not exists restaurants_primary_whatsapp_number_id_key
  on public.restaurants (primary_whatsapp_number_id)
  where primary_whatsapp_number_id is not null;

alter table public.ai_agents
  add column if not exists max_context_messages integer not null default 10,
  add column if not exists temperature numeric(3,2) not null default 0.40;

create unique index if not exists ai_agents_one_active_per_restaurant_idx
  on public.ai_agents (restaurant_id)
  where is_active;

alter table public.messages
  add column if not exists twilio_message_sid text,
  add column if not exists twilio_status text check (
    twilio_status in ('queued', 'sent', 'delivered', 'read', 'failed', 'undelivered')
  ),
  add column if not exists external_error_code text,
  add column if not exists channel text not null default 'whatsapp' check (channel = 'whatsapp');

create unique index if not exists messages_twilio_message_sid_key
  on public.messages (twilio_message_sid)
  where twilio_message_sid is not null;

insert into public.whatsapp_numbers (
  restaurant_id,
  phone_number,
  provider,
  source_type,
  is_primary,
  assignment_status,
  onboarding_status,
  assigned_at,
  created_at,
  updated_at
)
select
  restaurants.id,
  restaurants.twilio_phone_number,
  'twilio',
  'pool',
  true,
  case
    when restaurants.is_active then 'active'
    else 'assigned'
  end,
  case
    when restaurants.is_active then 'active'
    else 'pending_sender_registration'
  end,
  coalesce(restaurants.created_at, timezone('utc', now())),
  coalesce(restaurants.created_at, timezone('utc', now())),
  timezone('utc', now())
from public.restaurants
where restaurants.twilio_phone_number is not null
on conflict (phone_number) do update
set
  restaurant_id = excluded.restaurant_id,
  is_primary = true,
  assignment_status = excluded.assignment_status,
  onboarding_status = excluded.onboarding_status,
  updated_at = timezone('utc', now());

update public.restaurants
set
  primary_whatsapp_number_id = whatsapp_numbers.id,
  provisioning_status = case
    when restaurants.is_active then 'active'
    else restaurants.provisioning_status
  end,
  activated_at = case
    when restaurants.is_active and restaurants.activated_at is null then timezone('utc', now())
    else restaurants.activated_at
  end
from public.whatsapp_numbers
where whatsapp_numbers.restaurant_id = restaurants.id
  and whatsapp_numbers.is_primary
  and (
    restaurants.primary_whatsapp_number_id is distinct from whatsapp_numbers.id
    or restaurants.provisioning_status = 'draft'
  );

insert into public.provisioning_runs (
  owner_id,
  restaurant_id,
  whatsapp_number_id,
  status,
  current_step,
  completed_at,
  metadata
)
select
  restaurants.owner_id,
  restaurants.id,
  restaurants.primary_whatsapp_number_id,
  restaurants.provisioning_status,
  case
    when restaurants.provisioning_status = 'active' then 'active'
    else 'seeded_from_existing_restaurant'
  end,
  case
    when restaurants.provisioning_status = 'active' then timezone('utc', now())
    else null
  end,
  jsonb_build_object('seeded_from_existing_restaurant', true)
from public.restaurants
where not exists (
  select 1
  from public.provisioning_runs
  where provisioning_runs.restaurant_id = restaurants.id
);

alter table public.whatsapp_numbers enable row level security;
alter table public.provisioning_runs enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'whatsapp_numbers'
      and policyname = 'owners_can_view_their_restaurant_numbers'
  ) then
    create policy owners_can_view_their_restaurant_numbers
      on public.whatsapp_numbers
      for select
      using (
        restaurant_id is not null
        and exists (
          select 1
          from public.restaurants
          where restaurants.id = whatsapp_numbers.restaurant_id
            and restaurants.owner_id = auth.uid()
        )
      );
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'provisioning_runs'
      and policyname = 'owners_can_manage_their_provisioning_runs'
  ) then
    create policy owners_can_manage_their_provisioning_runs
      on public.provisioning_runs
      for all
      using (owner_id = auth.uid())
      with check (owner_id = auth.uid());
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_trigger
    where tgname = 'set_whatsapp_numbers_updated_at'
  ) then
    create trigger set_whatsapp_numbers_updated_at
      before update on public.whatsapp_numbers
      for each row
      execute function public.set_updated_at_timestamp();
  end if;

  if not exists (
    select 1
    from pg_trigger
    where tgname = 'set_provisioning_runs_updated_at'
  ) then
    create trigger set_provisioning_runs_updated_at
      before update on public.provisioning_runs
      for each row
      execute function public.set_updated_at_timestamp();
  end if;
end
$$;
