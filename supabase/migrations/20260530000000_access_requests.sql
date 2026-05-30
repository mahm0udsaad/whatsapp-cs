-- Access Requests (sales leads)
-- Backs the public "request access / contact sales" form that replaced the
-- open self-serve sign-up. Submitting this form does NOT create an account or
-- any credentials: it records a lead that the Nehgz sales team qualifies and
-- provisions manually after signing the commercial agreement.
--
-- Compliance background: App Store Review Guidelines 3.1.1 / 3.1.3(c). The app
-- and website must not let an individual/consumer self-purchase the service.
-- Removing instant self-serve sign-up and routing eligibility through an
-- offline, business-only provisioning step is the resolution.

create table public.access_requests (
  id                       uuid        primary key default gen_random_uuid(),
  business_name            text        not null,
  contact_email            text        not null,
  contact_phone            text,
  country                  text        not null default 'SA',
  commercial_registration  text,
  message                  text,
  status                   text        not null default 'new',  -- new | contacted | provisioned | rejected
  source                   text        not null default 'web_signup',
  created_at               timestamptz not null default now()
);

comment on table public.access_requests is
  'Business access requests from the public contact-sales form. No account is created on submit; leads are provisioned manually by the sales team.';

alter table public.access_requests enable row level security;

-- No anon/public policies: inserts are performed server-side with the service
-- role key (which bypasses RLS) via /api/leads. This prevents the table from
-- being read or written directly from the browser.
