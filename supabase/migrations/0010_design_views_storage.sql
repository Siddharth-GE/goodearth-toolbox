-- Storage rules for the private `design-views` bucket.
--
-- Supabase Storage keeps its objects in storage.objects, which has its own
-- row-level security entirely separate from the space_views table. A
-- private bucket starts with NO policies, so without this nobody except
-- the service role can read or write a design view — the table rows would
-- exist and every image would 404.
--
-- Creating the bucket is infrastructure, like a migration, not something
-- an upload should attempt at runtime: listing and creating buckets need
-- privileges an ordinary signed-in user does not have, so the attempt
-- fails confusingly rather than doing anything useful.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('design-views', 'design-views', false, 10485760, array['image/jpeg'])
on conflict (id) do update
  set public = false,
      file_size_limit = 10485760,
      allowed_mime_types = array['image/jpeg'];

-- has_app is fully qualified: policies on storage.objects don't run with
-- public on the search path.

-- Designers manage these; Budgets renders them into the client quote, so
-- it needs to read them under its own grant.
create policy "design views readable by staff"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'design-views'
    and (public.has_app('/selections') or public.has_app('/budgets'))
  );

create policy "design views writable by selections app"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'design-views' and public.has_app('/selections'));

create policy "design views deletable by selections app"
  on storage.objects for delete to authenticated
  using (bucket_id = 'design-views' and public.has_app('/selections'));
