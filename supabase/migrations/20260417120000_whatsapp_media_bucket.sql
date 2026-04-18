-- =============================================================================
-- whatsapp-media storage bucket
--
-- Private bucket used by the Twilio Media Agent to store inbound customer
-- media (images, audio, voice notes, video, documents) downloaded from
-- Twilio, and outbound agent attachments uploaded from the inbox composer.
--
-- Object path convention:
--   <restaurantId>/<conversationId>/<YYYY>/<MM>/<ulid>.<ext>
--
-- RLS rules on storage.objects for this bucket:
--   SELECT  — caller must be a member of the tenant
--             (first folder segment = restaurant_id).
--   INSERT  — caller must be a member of the tenant (same rule).
--   UPDATE  — caller must be a member of the tenant (same rule).
--   DELETE  — owner role / super-admin only (we gate this via
--             public.is_restaurant_owner since super-admins pass that
--             check). Regular team members cannot delete.
--
-- service_role (used by our admin client and webhook handler) bypasses RLS
-- entirely, so all server-side ingest/download paths keep working.
--
-- Idempotent: safe to re-run.
-- =============================================================================

-- 1. Create the bucket.
insert into storage.buckets (id, name, public)
values ('whatsapp-media', 'whatsapp-media', false)
on conflict (id) do nothing;

-- 2. Drop any previous policies we may have created so this migration is
--    idempotent.
drop policy if exists "whatsapp_media_select" on storage.objects;
drop policy if exists "whatsapp_media_insert" on storage.objects;
drop policy if exists "whatsapp_media_update" on storage.objects;
drop policy if exists "whatsapp_media_delete" on storage.objects;

-- 3. SELECT: tenant members can read any object whose first folder segment
--    matches a restaurant they belong to.
create policy "whatsapp_media_select"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'whatsapp-media'
    and public.is_restaurant_member(
      ((storage.foldername(name))[1])::uuid,
      auth.uid()
    )
  );

-- 4. INSERT: tenant members can write objects only under their own
--    restaurant prefix.
create policy "whatsapp_media_insert"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'whatsapp-media'
    and public.is_restaurant_member(
      ((storage.foldername(name))[1])::uuid,
      auth.uid()
    )
  );

-- 5. UPDATE: tenant members can update (e.g. overwrite) their own objects.
create policy "whatsapp_media_update"
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'whatsapp-media'
    and public.is_restaurant_member(
      ((storage.foldername(name))[1])::uuid,
      auth.uid()
    )
  )
  with check (
    bucket_id = 'whatsapp-media'
    and public.is_restaurant_member(
      ((storage.foldername(name))[1])::uuid,
      auth.uid()
    )
  );

-- 6. DELETE: restricted to restaurant owners / super-admins.
create policy "whatsapp_media_delete"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'whatsapp-media'
    and public.is_restaurant_owner(
      ((storage.foldername(name))[1])::uuid,
      auth.uid()
    )
  );
