-- 0061 — storage rules for the private `staff-photos` bucket.
--
-- The photo column ships in 0060; this is the bucket behind it.
--
-- PRIVATE, unlike the catalogue-images bucket, and the difference is the
-- subject. A vendor's product photo is not personal data; a photograph of
-- a member of staff is. A public bucket also means the object survives at
-- a guessable URL after the person leaves, and nothing revokes that.
--
-- Creating the bucket is infrastructure, like a migration, and not
-- something an upload should attempt at runtime: listing and creating
-- buckets need privileges an ordinary signed-in user does not have, so
-- the attempt fails confusingly rather than doing anything useful. Same
-- reasoning as 0010, which this file follows closely.
--
-- Safe to run twice.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('staff-photos', 'staff-photos', false, 5242880, array['image/jpeg'])
on conflict (id) do update
  set public = false,
      file_size_limit = 5242880,
      allowed_mime_types = array['image/jpeg'];

-- public.has_app and public.is_admin are FULLY QUALIFIED — 0010's lesson:
-- policies on storage.objects do not run with `public` on the search path,
-- and an unqualified call fails at upload time rather than at apply time.

-- ---------------------------------------------------------------------
-- Reading
-- ---------------------------------------------------------------------
-- The one place has_app('/directory') is a real gate rather than a
-- formality: it keeps out an account that has NOT been granted the tool.
-- Everybody in the company holds the grant, so this is not a boundary
-- between colleagues — it is the boundary against a kiosk account, the
-- probe, or a future contractor login.

drop policy if exists "staff photos readable by directory app" on storage.objects;
create policy "staff photos readable by directory app"
  on storage.objects for select to authenticated
  using (bucket_id = 'staff-photos' and public.has_app('/directory'));

-- ---------------------------------------------------------------------
-- Writing — founder decision 3, applied to the photo as well
-- ---------------------------------------------------------------------
-- The path is `people/<profile_id>/<uuid>.jpg`, and the SECOND SEGMENT IS
-- THE POINT: it lets storage RLS enforce "you upload your own photo" in
-- the database, exactly as staff_details_guard() does for the card.
--
-- storage.foldername('people/abc/x.jpg') returns {people,abc} and Postgres
-- arrays are 1-indexed, so [2] is the id. Change the path shape and these
-- two policies silently stop matching — they would refuse every upload,
-- which is at least the safe direction, but change them together.
--
-- The <uuid> filename means a replacement is a NEW object, so a stale
-- browser cache can never show the old face, and the route handler gets a
-- cache-busting version string for free.

drop policy if exists "staff photos writable by the person or an admin" on storage.objects;
create policy "staff photos writable by the person or an admin"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'staff-photos'
    and (
      public.is_admin()
      or (storage.foldername(name))[2] = auth.uid()::text
    )
  );

drop policy if exists "staff photos deletable by the person or an admin" on storage.objects;
create policy "staff photos deletable by the person or an admin"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'staff-photos'
    and (
      public.is_admin()
      or (storage.foldername(name))[2] = auth.uid()::text
    )
  );

-- No UPDATE policy: a replacement is a new object at a new path, and the
-- old one is removed. There is nothing to update in place.

-- ---------------------------------------------------------------------
-- Assert what this file claimed
-- ---------------------------------------------------------------------

do $$
declare
  v int;
begin
  if not exists (
    select 1 from storage.buckets where id = 'staff-photos' and not public
  ) then
    raise exception '0061: the staff-photos bucket is missing or is public';
  end if;

  select count(*) into v from pg_policies
  where schemaname = 'storage' and tablename = 'objects'
    and policyname like 'staff photos%';
  if v <> 3 then
    raise exception '0061: expected 3 staff-photos storage policies, found %', v;
  end if;
end $$;
