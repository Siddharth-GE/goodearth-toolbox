-- 0095 — Dexter: client presentations as shareable links
--
-- FOUNDER, 2026-09-25 (plan.md at the repo root): a small Management
-- tool. Someone with the grant creates a PROJECT (a named folder, not a
-- Masters project — a pitch may be for a prospect who has no record
-- yet), uploads a DECK into it (one HTML file, or a zip of index.html
-- plus its assets, 4 MB at most — the drawings upload path, by the
-- founder's choice over a direct-to-storage upload), and gets a
-- standalone link a client opens without signing in.
--
-- Two tables, one bucket, and a deliberate absence:
--
--   * dexter_projects — the folder. Name unique case-insensitively, an
--     optional free-text client name.
--
--   * dexter_decks — one row per upload. `entry_path` is the file the
--     link opens (index.html for a zip, always index.html for a single
--     file); `share_token` is 22 characters of base64url from 16 random
--     bytes, minted in the action, unique, and re-issuable ("New link"
--     kills the old one); `share_enabled` switches the link off without
--     deleting anything. The objects sit at decks/<deck_id>/<path> in the
--     `dexter` bucket, and Storage is the file list — there is no file
--     table to fall out of step with it.
--
--   * NOTHING FOR anon. The public viewer (app/deck/[token]/…) has no
--     session and looks the token up through the service-role client,
--     the /api/keep-alive and Google Chat door shape, sanctioned in
--     SECURITY.md. An anon-callable definer function plus an anon storage
--     policy would open more surface than one read-only route does, so
--     every policy below is `to authenticated` on has_app('/dexter').
--
-- A project with decks refuses deletion (the FK is RESTRICT, and the
-- action says so in a sentence before the database has to).
--
-- Re-runnable throughout.

-- ---------------------------------------------------------------------
-- 1. '/dexter' becomes a grantable app
-- ---------------------------------------------------------------------
-- Both CHECKs, restated in full and identically — granting fails at the
-- database if only one moves. The list is 0084's plus '/dexter'.

alter table user_apps drop constraint if exists user_apps_app_known;
alter table user_apps add constraint user_apps_app_known check (
  app in (
    '/marathon', '/settings', '/masters', '/selections', '/budgets',
    '/indents', '/purchase-orders', '/inventory', '/bills', '/directory',
    '/training', '/management-dashboard', '/project-management',
    '/design-management', '/client-relations', '/financial-management',
    '/business-planning', '/pusher', '/relay', '/reporter', '/estimator',
    '/supervisors', '/dexter'
  )
);

alter table role_apps drop constraint if exists role_apps_app_known;
alter table role_apps add constraint role_apps_app_known check (
  app in (
    '/marathon', '/settings', '/masters', '/selections', '/budgets',
    '/indents', '/purchase-orders', '/inventory', '/bills', '/directory',
    '/training', '/management-dashboard', '/project-management',
    '/design-management', '/client-relations', '/financial-management',
    '/business-planning', '/pusher', '/relay', '/reporter', '/estimator',
    '/supervisors', '/dexter'
  )
);

-- ---------------------------------------------------------------------
-- 2. dexter_projects — the folder
-- ---------------------------------------------------------------------

create table if not exists dexter_projects (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  -- Free text, deliberately not a FK to clients: the deck is usually for
  -- somebody who is not a client yet.
  client_name text,
  created_by uuid references profiles (id),
  updated_by uuid references profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists dexter_projects_name_unique
  on dexter_projects (lower(name));

-- ---------------------------------------------------------------------
-- 3. dexter_decks — one row per upload
-- ---------------------------------------------------------------------

create table if not exists dexter_decks (
  id uuid primary key default gen_random_uuid(),
  -- RESTRICT (the default): deleting a project with decks is refused,
  -- never cascaded — the objects behind a deck would be orphaned.
  project_id uuid not null references dexter_projects (id),
  title text not null check (length(trim(title)) > 0),
  -- The file the link opens, relative to decks/<id>/. Never absolute,
  -- never climbing — the action derives it and the viewer re-checks it.
  entry_path text not null check (
    length(entry_path) > 0
    and entry_path not like '/%'
    and entry_path not like '%..%'
  ),
  -- 16 random bytes, base64url: 22 characters of [A-Za-z0-9_-]. The
  -- viewer refuses anything else before it reads a row.
  share_token text not null unique check (share_token ~ '^[A-Za-z0-9_-]{22}$'),
  share_enabled boolean not null default true,
  file_count int not null check (file_count >= 0),
  total_bytes bigint not null check (total_bytes >= 0),
  uploaded_by uuid references profiles (id),
  created_by uuid references profiles (id),
  updated_by uuid references profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists dexter_decks_project_idx on dexter_decks (project_id);

-- ---------------------------------------------------------------------
-- 4. Audit, updated_at, RLS
-- ---------------------------------------------------------------------

do $$
declare
  t text;
begin
  for t in select unnest(array['dexter_projects', 'dexter_decks'])
  loop
    execute format('drop trigger if exists audit_%I on %I', t, t);
    execute format(
      'create trigger audit_%I after insert or update or delete on %I
         for each row execute function audit_row()', t, t);

    execute format('drop trigger if exists set_updated_at on %I', t);
    execute format(
      'create trigger set_updated_at before update on %I
         for each row execute function set_updated_at()', t);

    execute format('alter table %I enable row level security', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 5. Policies — the grant on every verb, ONE SELECT policy per table
-- ---------------------------------------------------------------------
-- Nothing here is readable by anyone signed in without the grant: a
-- project's name and a deck's title are what a pitch is about, and the
-- share token is the whole gate on the public side.

do $$
declare
  t text;
begin
  for t in select unnest(array['dexter_projects', 'dexter_decks'])
  loop
    execute format('drop policy if exists "%s readable by dexter app" on %I', t, t);
    execute format(
      'create policy "%s readable by dexter app" on %I
         for select to authenticated using (has_app(''/dexter''))', t, t);

    execute format('drop policy if exists "%s writable by dexter app" on %I', t, t);
    execute format(
      'create policy "%s writable by dexter app" on %I
         for insert to authenticated with check (has_app(''/dexter''))', t, t);

    execute format('drop policy if exists "%s updatable by dexter app" on %I', t, t);
    execute format(
      'create policy "%s updatable by dexter app" on %I
         for update to authenticated
         using (has_app(''/dexter'')) with check (has_app(''/dexter''))', t, t);

    execute format('drop policy if exists "%s deletable by dexter app" on %I', t, t);
    execute format(
      'create policy "%s deletable by dexter app" on %I
         for delete to authenticated using (has_app(''/dexter''))', t, t);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 6. The `dexter` bucket
-- ---------------------------------------------------------------------
-- Private: an object path on its own gets nobody anything, and the
-- public viewer downloads through the service-role client after the
-- token has matched. 10 MB per object — the request is capped at 4 MB
-- (next.config.ts) but one uncompressed asset in a zip can be bigger
-- than the zip it came in. No MIME list: a deck carries fonts, video,
-- JSON, whatever the presentation tool wrote; the viewer sets the
-- Content-Type from the file's extension, never from Storage's guess.
--
-- Creating the bucket is infrastructure, like a migration, and not
-- something an upload should attempt at runtime (0010, 0061, 0091).

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('dexter', 'dexter', false, 10485760, null)
on conflict (id) do update
  set public = false,
      file_size_limit = 10485760,
      allowed_mime_types = null;

-- public.has_app is FULLY QUALIFIED — 0010's and 0061's lesson: policies
-- on storage.objects do not run with `public` on the search path, and an
-- unqualified call fails at UPLOAD TIME rather than at apply time.

drop policy if exists "dexter readable by dexter app" on storage.objects;
create policy "dexter readable by dexter app"
  on storage.objects for select to authenticated
  using (bucket_id = 'dexter' and public.has_app('/dexter'));

drop policy if exists "dexter writable by dexter app" on storage.objects;
create policy "dexter writable by dexter app"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'dexter' and public.has_app('/dexter'));

drop policy if exists "dexter deletable by dexter app" on storage.objects;
create policy "dexter deletable by dexter app"
  on storage.objects for delete to authenticated
  using (bucket_id = 'dexter' and public.has_app('/dexter'));

-- No UPDATE policy: replacing a deck's file removes the old objects and
-- writes new ones under the same decks/<id>/ folder.

-- ---------------------------------------------------------------------
-- 7. Prove it all landed
-- ---------------------------------------------------------------------

do $$
declare
  v int;
  c text;
  b record;
begin
  foreach c in array array['user_apps_app_known', 'role_apps_app_known']
  loop
    if not exists (
      select 1 from pg_constraint
      where conname = c and pg_get_constraintdef(oid) like '%''/dexter''%'
    ) then
      raise exception '0095: % does not admit /dexter', c;
    end if;
  end loop;

  foreach c in array array['dexter_projects', 'dexter_decks']
  loop
    if not exists (select 1 from pg_class where relname = c and relrowsecurity) then
      raise exception '0095: % is missing or has RLS off', c;
    end if;

    select count(*) into v from pg_policies
      where schemaname = 'public' and tablename = c;
    if v <> 4 then
      raise exception '0095: % has % policies, expected 4', c, v;
    end if;

    select count(*) into v from pg_policies
      where schemaname = 'public' and tablename = c and cmd = 'SELECT';
    if v <> 1 then
      raise exception '0095: % has % SELECT policies, expected exactly 1', c, v;
    end if;

    -- The one line this whole migration is built around.
    if exists (
      select 1 from pg_policies
      where schemaname = 'public' and tablename = c and 'anon' = any(roles)
    ) then
      raise exception '0095: % has a policy for anon', c;
    end if;

    if not exists (
      select 1 from pg_trigger
      where tgname = 'audit_' || c and tgrelid = c::regclass
    ) then
      raise exception '0095: audit trigger missing on %', c;
    end if;
  end loop;

  select * into b from storage.buckets where id = 'dexter';
  if b is null then
    raise exception '0095: dexter bucket missing';
  end if;
  if b.public then
    raise exception '0095: dexter bucket must be private';
  end if;
  if b.file_size_limit <> 10485760 then
    raise exception '0095: dexter bucket limit is %, expected 10485760', b.file_size_limit;
  end if;

  select count(*) into v from pg_policies
    where schemaname = 'storage' and tablename = 'objects' and policyname like 'dexter %';
  if v <> 3 then
    raise exception '0095: % dexter storage policies, expected 3', v;
  end if;
end $$;
