-- Signatures printed on an approved bill: Prepared by, Checked by and Final approval are the people named in
-- bill_signers; Approved by is whoever approved that bill. The images sit in a private bucket, never in the repo
-- (it is public). Read by the /bills grant, which can already download the signed PDFs; written by admins only.

create table if not exists bill_signers (
  id boolean primary key default true check (id),
  prepared_by uuid references profiles (id),
  checked_by uuid references profiles (id),
  final_by uuid references profiles (id),
  updated_by uuid references profiles (id),
  updated_at timestamptz not null default now()
);
insert into bill_signers (id) values (true) on conflict (id) do nothing;

-- One image per person; a replacement is a new object at a new path.
create table if not exists bill_signatures (
  user_id uuid primary key references profiles (id),
  path text not null check (path like 'people/' || user_id::text || '/%'),
  updated_by uuid references profiles (id),
  updated_at timestamptz not null default now()
);

do $$
declare
  t text;
begin
  for t in select unnest(array['bill_signers', 'bill_signatures'])
  loop
    execute format('drop trigger if exists set_updated_at on %I', t);
    execute format('create trigger set_updated_at before update on %I for each row execute function set_updated_at()', t);
    execute format('alter table %I enable row level security', t);
    execute format('revoke truncate on %I from anon, authenticated', t);
    execute format('revoke all on %I from anon', t);
  end loop;
end $$;

-- audit_row() reads new.id; bill_signers' id is a boolean and bill_signatures' key is user_id, so their changes
-- are kept by updated_by/updated_at (admin-only rows).
revoke delete on bill_signers from authenticated;

drop policy if exists "bill_signers read by grant" on bill_signers;
create policy "bill_signers read by grant" on bill_signers
  for select to authenticated using ((select has_app('/bills')) or (select is_admin()));
drop policy if exists "bill_signers update by admins" on bill_signers;
create policy "bill_signers update by admins" on bill_signers
  for update to authenticated using ((select is_admin())) with check ((select is_admin()));

drop policy if exists "bill_signatures read by grant" on bill_signatures;
create policy "bill_signatures read by grant" on bill_signatures
  for select to authenticated using ((select has_app('/bills')) or (select is_admin()));
drop policy if exists "bill_signatures insert by admins" on bill_signatures;
create policy "bill_signatures insert by admins" on bill_signatures
  for insert to authenticated with check ((select is_admin()));
drop policy if exists "bill_signatures update by admins" on bill_signatures;
create policy "bill_signatures update by admins" on bill_signatures
  for update to authenticated using ((select is_admin())) with check ((select is_admin()));
drop policy if exists "bill_signatures delete by admins" on bill_signatures;
create policy "bill_signatures delete by admins" on bill_signatures
  for delete to authenticated using ((select is_admin()));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('signatures', 'signatures', false, 1048576, array['image/png', 'image/jpeg'])
on conflict (id) do update
  set public = false,
      file_size_limit = 1048576,
      allowed_mime_types = array['image/png', 'image/jpeg'];

drop policy if exists "signatures readable by bills app" on storage.objects;
create policy "signatures readable by bills app" on storage.objects
  for select to authenticated using (
    bucket_id = 'signatures' and ((select public.has_app('/bills')) or (select public.is_admin())));
drop policy if exists "signatures writable by admins" on storage.objects;
create policy "signatures writable by admins" on storage.objects
  for insert to authenticated with check (bucket_id = 'signatures' and (select public.is_admin()));
drop policy if exists "signatures deletable by admins" on storage.objects;
create policy "signatures deletable by admins" on storage.objects
  for delete to authenticated using (bucket_id = 'signatures' and (select public.is_admin()));

-- Checks ----------------------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_class where relname in ('bill_signers', 'bill_signatures') and not relrowsecurity) then
    raise exception '0168: both signature tables must have RLS on';
  end if;
  if (select public from storage.buckets where id = 'signatures') then
    raise exception '0168: the signatures bucket must be private';
  end if;
  if (select count(*) from bill_signers) <> 1 then
    raise exception '0168: bill_signers holds exactly one row';
  end if;
end $$;
