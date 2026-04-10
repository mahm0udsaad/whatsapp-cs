-- Add setup_status and website_url columns that the onboarding flow expects.
-- setup_status tracks the business-facing state of the provisioning workflow.
-- website_url stores the public website URL entered during onboarding.

alter table public.restaurants
  add column if not exists setup_status text default 'draft',
  add column if not exists website_url text;

-- Backfill setup_status for existing records based on provisioning_status
update public.restaurants
set setup_status = case
  when provisioning_status = 'active' then 'active'
  when provisioning_status = 'failed' then 'failed'
  when provisioning_status is not null and provisioning_status != 'draft' then 'pending_whatsapp'
  when twilio_phone_number is not null then 'pending_whatsapp'
  else 'draft'
end
where setup_status is null or setup_status = 'draft';
