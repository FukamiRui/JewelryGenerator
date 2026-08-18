-- =========================================================
-- Storage RLS: authenticated shops can upload their own raw
-- photos/videos to the design-images bucket.
--
-- "Public" bucket only ever affected read access. INSERT was never
-- granted to authenticated users, so every raw-upload path — portfolio
-- photo, portfolio video, reference photo, shop logo/cover
-- (lib/image-cache.ts: uploadPortfolioImage, uploadPortfolioVideo,
-- uploadReferenceImage, uploadShopProfileImage) — has been failing with
-- "new row violates row-level security policy" since those routes upload
-- via the user-scoped client. AI-generated images/video are unaffected
-- since those go through the service-role client instead.
--
-- Every one of those upload paths writes to
-- '{folder}/{tenantId}/{filename}' (see lib/image-cache.ts), so this
-- policy checks that the *second* path segment is a tenant the
-- authenticated user actually belongs to.
-- =========================================================

create policy "tenant members can upload to their own folder"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'design-images'
  and exists (
    select 1
    from public.tenant_members tm
    where tm.user_id = auth.uid()
      and tm.tenant_id::text = (storage.foldername(name))[2]
  )
);
