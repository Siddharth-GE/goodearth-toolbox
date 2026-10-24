-- 0151 — Turing, the admins' assistant (plan.md, T1)
--
-- A Claude inside the toolbox, for admins only. It reads with the admin's own session, so
-- every row it sees is one the admin could open by hand; these tables hold only Turing's own
-- record of the talk and the pages it builds.
--
--   * turing_conversations — one per chat, private to the admin who started it (founder,
--     2026-10-24). `container_id` keeps Claude's code sandbox between turns.
--   * turing_messages — the API's messages as they were sent and received, append-only: a
--     conversation is replayed to Claude exactly as it happened, so no row is ever edited.
--   * turing_files — what an admin dropped in: our copy in the `turing-files` bucket, and the
--     id Anthropic's Files API gave it, so a long conversation never re-sends the bytes.
--   * turing_pages — interactive pages: the HTML in the `turing-pages` bucket and the reads
--     behind it (the recipe), run afresh as whoever opens it. Shared among admins.
--
-- Never grantable: no '/turing' in either _app_known CHECK. Every policy is is_admin(), which
-- carries the emailed-code check (0063). No audit trigger: these tables are their own record,
-- and copying every message into the audit log would double the largest rows in the database.
--
-- Re-runnable throughout.

-- ---------------------------------------------------------------------
-- 1. Tables
-- ---------------------------------------------------------------------

create table if not exists turing_conversations (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references profiles (id),
  title text not null default 'New conversation' check (length(trim(title)) > 0),
  container_id text,
  container_expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists turing_conversations_owner_idx
  on turing_conversations (owner_id, updated_at desc);

create table if not exists turing_messages (
  id bigint generated always as identity primary key,
  conversation_id uuid not null references turing_conversations (id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  -- The API's content blocks, verbatim (thinking, tool calls and results included).
  content jsonb not null check (jsonb_typeof(content) = 'array'),
  input_tokens int,
  output_tokens int,
  cache_read_tokens int,
  cache_write_tokens int,
  created_at timestamptz not null default now()
);

create index if not exists turing_messages_conversation_idx
  on turing_messages (conversation_id, id);

create table if not exists turing_files (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references profiles (id),
  -- Set when the message carrying it is sent; a file dropped and never sent stays unattached.
  conversation_id uuid references turing_conversations (id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  media_type text not null,
  size_bytes int not null check (size_bytes > 0),
  storage_path text not null unique,
  anthropic_file_id text not null,
  created_at timestamptz not null default now()
);

create index if not exists turing_files_conversation_idx on turing_files (conversation_id);

create table if not exists turing_pages (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references profiles (id),
  conversation_id uuid references turing_conversations (id) on delete set null,
  title text not null check (length(trim(title)) > 0),
  -- The reads behind the page, checked by lib/turing/read-rules.ts before they are saved and run.
  recipe jsonb not null check (jsonb_typeof(recipe) = 'array'),
  storage_path text not null unique,
  created_at timestamptz not null default now()
);

do $$
declare
  t text;
begin
  foreach t in array array['turing_conversations', 'turing_messages', 'turing_files', 'turing_pages']
  loop
    execute format('alter table %I enable row level security', t);
    execute format('revoke truncate on %I from anon, authenticated', t);
    execute format('revoke all on %I from anon', t);
  end loop;
  drop trigger if exists set_updated_at on turing_conversations;
  create trigger set_updated_at before update on turing_conversations
    for each row execute function set_updated_at();
end $$;

-- ---------------------------------------------------------------------
-- 2. Policies — admins only; conversations and files their owner's alone
-- ---------------------------------------------------------------------

-- A row naming a conversation must name one of the caller's own: the foreign key alone
-- would let one admin hang a row on another's conversation, which its delete then sweeps.
do $$
declare
  t text;
  mine constant text := '(select is_admin()) and owner_id = (select auth.uid())';
  attached text;
begin
  foreach t in array array['turing_conversations', 'turing_files']
  loop
    attached := case when t = 'turing_files' then mine || format(
      ' and (%1$I.conversation_id is null or exists (select 1 from turing_conversations c'
      ' where c.id = %1$I.conversation_id and c.owner_id = (select auth.uid())))', t) else mine end;
    execute format('drop policy if exists "%s readable by its owner" on %I', t, t);
    execute format('create policy "%s readable by its owner" on %I for select to authenticated using (%s)', t, t, mine);
    execute format('drop policy if exists "%s insertable by its owner" on %I', t, t);
    execute format('create policy "%s insertable by its owner" on %I for insert to authenticated with check (%s)', t, t, attached);
    execute format('drop policy if exists "%s updatable by its owner" on %I', t, t);
    execute format('create policy "%s updatable by its owner" on %I for update to authenticated using (%s) with check (%s)', t, t, mine, attached);
    execute format('drop policy if exists "%s deletable by its owner" on %I', t, t);
    execute format('create policy "%s deletable by its owner" on %I for delete to authenticated using (%s)', t, t, mine);
  end loop;
end $$;

-- A message belongs to its conversation's owner. Read and added, never changed or deleted
-- (deleting the conversation takes its messages with it).
drop policy if exists "turing_messages readable by its owner" on turing_messages;
create policy "turing_messages readable by its owner" on turing_messages
  for select to authenticated using (
    (select is_admin()) and exists (
      select 1 from turing_conversations c
       where c.id = turing_messages.conversation_id and c.owner_id = (select auth.uid())));

drop policy if exists "turing_messages insertable by its owner" on turing_messages;
create policy "turing_messages insertable by its owner" on turing_messages
  for insert to authenticated with check (
    (select is_admin()) and exists (
      select 1 from turing_conversations c
       where c.id = turing_messages.conversation_id and c.owner_id = (select auth.uid())));

revoke update, delete on turing_messages from authenticated;

-- Pages are shared among admins: any admin opens, makes or deletes one. A page is never
-- changed in place — a rebuilt page is a new one — so there is no update at all.
drop policy if exists "turing_pages readable by admins" on turing_pages;
create policy "turing_pages readable by admins" on turing_pages
  for select to authenticated using ((select is_admin()));

drop policy if exists "turing_pages insertable by admins" on turing_pages;
create policy "turing_pages insertable by admins" on turing_pages
  for insert to authenticated with check (
    (select is_admin()) and owner_id = (select auth.uid())
    and (turing_pages.conversation_id is null or exists (
      select 1 from turing_conversations c
       where c.id = turing_pages.conversation_id and c.owner_id = (select auth.uid()))));

revoke update on turing_pages from authenticated;

drop policy if exists "turing_pages deletable by admins" on turing_pages;
create policy "turing_pages deletable by admins" on turing_pages
  for delete to authenticated using ((select is_admin()));

-- ---------------------------------------------------------------------
-- 3. Buckets
-- ---------------------------------------------------------------------
-- Private. Files sit at <owner id>/<file id>.<ext>, so the first folder says whose they are;
-- pages at <page id>.html. public.* is fully qualified: storage policies do not run with
-- `public` on the search path (0010, 0061).

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('turing-files', 'turing-files', false, 10485760, null)
on conflict (id) do update set public = false, file_size_limit = 10485760, allowed_mime_types = null;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('turing-pages', 'turing-pages', false, 5242880, array['text/html', 'text/html; charset=utf-8'])
on conflict (id) do update
  set public = false, file_size_limit = 5242880, allowed_mime_types = array['text/html', 'text/html; charset=utf-8'];

drop policy if exists "turing-files readable by its owner" on storage.objects;
create policy "turing-files readable by its owner" on storage.objects
  for select to authenticated using (
    bucket_id = 'turing-files' and (select public.is_admin())
    and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "turing-files writable by its owner" on storage.objects;
create policy "turing-files writable by its owner" on storage.objects
  for insert to authenticated with check (
    bucket_id = 'turing-files' and (select public.is_admin())
    and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "turing-files deletable by its owner" on storage.objects;
create policy "turing-files deletable by its owner" on storage.objects
  for delete to authenticated using (
    bucket_id = 'turing-files' and (select public.is_admin())
    and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "turing-pages readable by admins" on storage.objects;
create policy "turing-pages readable by admins" on storage.objects
  for select to authenticated using (bucket_id = 'turing-pages' and (select public.is_admin()));

drop policy if exists "turing-pages writable by admins" on storage.objects;
create policy "turing-pages writable by admins" on storage.objects
  for insert to authenticated with check (bucket_id = 'turing-pages' and (select public.is_admin()));

drop policy if exists "turing-pages deletable by admins" on storage.objects;
create policy "turing-pages deletable by admins" on storage.objects
  for delete to authenticated using (bucket_id = 'turing-pages' and (select public.is_admin()));

-- ---------------------------------------------------------------------
-- 4. Prove it all landed
-- ---------------------------------------------------------------------

do $$
declare
  t text;
  v int;
  b record;
begin
  foreach t in array array['turing_conversations', 'turing_messages', 'turing_files', 'turing_pages']
  loop
    if not exists (select 1 from pg_class where relname = t and relrowsecurity) then
      raise exception '0151: % is missing or has RLS off', t;
    end if;
    select count(*) into v from pg_policies where schemaname = 'public' and tablename = t and cmd = 'SELECT';
    if v <> 1 then
      raise exception '0151: % has % SELECT policies, expected exactly 1', t, v;
    end if;
    if exists (select 1 from pg_policies
                where schemaname = 'public' and tablename = t
                  and coalesce(qual, '') || coalesce(with_check, '') not like '%is_admin()%') then
      raise exception '0151: a policy on % does not ask is_admin()', t;
    end if;
    if exists (select 1 from pg_policies where schemaname = 'public' and tablename = t and 'anon' = any(roles)) then
      raise exception '0151: % has a policy for anon', t;
    end if;
  end loop;

  if has_table_privilege('authenticated', 'turing_messages', 'update')
     or has_table_privilege('authenticated', 'turing_messages', 'delete') then
    raise exception '0151: turing_messages must be append-only';
  end if;
  if has_table_privilege('authenticated', 'turing_pages', 'update') then
    raise exception '0151: turing_pages must never be changed in place';
  end if;

  if exists (select 1 from pg_constraint
              where conname in ('user_apps_app_known', 'role_apps_app_known')
                and pg_get_constraintdef(oid) like '%/turing%') then
    raise exception '0151: /turing must never be grantable';
  end if;

  foreach t in array array['turing-files', 'turing-pages']
  loop
    select * into b from storage.buckets where id = t;
    if b is null or b.public then
      raise exception '0151: bucket % missing or public', t;
    end if;
  end loop;

  select count(*) into v from pg_policies
   where schemaname = 'storage' and tablename = 'objects' and policyname like 'turing-%';
  if v <> 6 then
    raise exception '0151: % turing storage policies, expected 6', v;
  end if;
end $$;
