-- 0069 — write down the catalogue bucket, which was never written down
--
-- Why this exists
-- ---------------
-- The `catalogue` bucket has been holding the 897 item thumbnails since
-- roughly the beginning. It is in no migration. 0009 and 0061 both refer
-- to it in passing — "unlike the catalogue-images bucket" — as though it
-- were established somewhere, and it never was. Somebody made it by hand
-- in Studio and it worked, so nobody looked again.
--
-- It surfaced on 17 Aug 2026 when a second database was built by replaying
-- every migration: the fresh one came up with `design-views` and
-- `staff-photos` and no `catalogue`. The first symptom would have been
-- every thumbnail in the item picker failing to upload, on the database
-- carrying the real work.
--
-- PUBLIC, unlike staff-photos, and 0061 already explains the difference:
-- these are vendor product photos, not people. The grid loads a thumbnail
-- per tile and a public CDN URL is what makes that cheap.
--
-- NO POLICIES, on purpose, and this is not an oversight of the kind
-- AUDIT.md SEC-01 was about. Reads do not need one because a public
-- bucket serves through the CDN path; writes are done by
-- scripts/fetch-catalogue-images.ts under the service role, which is not
-- subject to RLS. No signed-in role has any business writing here — the
-- catalogue is loaded from vendor sheets, never from a screen — so
-- granting one the ability would be the bug.
--
-- Recorded exactly as the original database has it, so the two match.
--
-- Safe to run twice.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('catalogue', 'catalogue', true, 2000000, array['image/webp'])
on conflict (id) do update
  set public = true,
      file_size_limit = 2000000,
      allowed_mime_types = array['image/webp'];

-- ---------------------------------------------------------------------
-- Assert what this migration claimed to do
-- ---------------------------------------------------------------------
do $$
declare
  v_policies int;
begin
  if not exists (
    select 1 from storage.buckets
    where id = 'catalogue'
      and public
      and file_size_limit = 2000000
      and allowed_mime_types = array['image/webp']
  ) then
    raise exception '0069: the catalogue bucket is missing or does not match';
  end if;

  -- The claim is that nothing here is reachable by a signed-in role
  -- through a policy. If somebody adds one later it should be a decision,
  -- not a surprise, so the count is pinned to the two buckets that do
  -- have policies: design-views (3) and staff-photos (3).
  select count(*) into v_policies
  from pg_policies
  where schemaname = 'storage'
    and (qual like '%catalogue%' or with_check like '%catalogue%');
  if v_policies <> 0 then
    raise exception '0069: expected no storage policies naming catalogue, found %', v_policies;
  end if;
end $$;
