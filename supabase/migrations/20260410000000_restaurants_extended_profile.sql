-- Extend restaurants table with crawled profile fields
alter table public.restaurants
  add column if not exists logo_url text,
  add column if not exists telephone text,
  add column if not exists opening_hours text,
  add column if not exists cuisine text;
