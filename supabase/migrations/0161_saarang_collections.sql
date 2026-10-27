-- 0161 — Saarang Collections (plan.md, top section)
--
-- The monthly Saarang collection meeting, worked out from eight Zoho exports. Zoho is the
-- source: these tables hold only what was uploaded, the figures typed by hand, and the rules
-- the calculation follows. Nothing here reads or writes another tool.
--
--   * saarang_collection_uploads — every export as it was read, kept; the latest per slot counts.
--     Read and insert only: an upload is a record of what Zoho said that day.
--   * saarang_collection_settings — one row: the rules and the collection period.
--   * saarang_collection_figures — the hand-typed cells of the summary and the Phase 3 row.
--   * saarang_collection_excluded_receipts, _corrections, _extra_units — the rule lists.
--
-- Grant-gated and not scoped: whoever holds /saarang-collections sees and edits the whole
-- report. No views, no functions. No money is seeded — the settings row carries rules only.
--
-- Re-runnable throughout.

-- ---------------------------------------------------------------------
-- 1. The grant
-- ---------------------------------------------------------------------
-- Both CHECKs, restated in full and identically: 0115's list plus the one slug.

alter table user_apps drop constraint if exists user_apps_app_known;
alter table user_apps add constraint user_apps_app_known check (
  app in (
    '/marathon', '/settings', '/masters', '/selections', '/budgets',
    '/indents', '/purchase-orders', '/inventory', '/bills', '/directory',
    '/training', '/management-dashboard', '/project-management',
    '/design-management', '/client-relations', '/financial-management',
    '/business-planning', '/pusher', '/relay', '/reporter', '/estimator',
    '/supervisors', '/dexter', '/birdwing', '/birdwing-books', '/saarang-collections'
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
    '/supervisors', '/dexter', '/birdwing', '/birdwing-books', '/saarang-collections'
  )
);

-- ---------------------------------------------------------------------
-- 2. Tables
-- ---------------------------------------------------------------------

create table if not exists saarang_collection_uploads (
  id uuid primary key default gen_random_uuid(),
  slot text not null check (slot in (
    'plot_payments', 'plot_outstanding', 'plot_sold', 'plot_milestones',
    'villa_payments', 'villa_outstanding', 'villa_sold', 'villa_milestones'
  )),
  file_name text not null check (length(trim(file_name)) between 1 and 255),
  -- The date Zoho printed on the export, when it printed one.
  as_of date,
  period_from date,
  period_to date check (period_to >= period_from),
  -- The rows as lib/saarang-collections/core.ts read them, one array per row.
  rows jsonb not null check (jsonb_typeof(rows) = 'array'),
  row_count int not null,
  uploaded_by uuid not null default auth.uid() references profiles (id),
  -- clock_timestamp, not now(): files dropped together still have an order, and the latest counts.
  uploaded_at timestamptz not null default clock_timestamp(),
  constraint saarang_collection_uploads_row_count check (row_count = jsonb_array_length(rows))
);

create index if not exists saarang_collection_uploads_slot_idx
  on saarang_collection_uploads (slot, uploaded_at desc);

-- A uuid id because audit_log keys every row by one; `one_row` keeps it to one row.
create table if not exists saarang_collection_settings (
  id uuid primary key default gen_random_uuid(),
  one_row boolean not null default true unique check (one_row),
  -- A unit ending in this is a test unit and counts nowhere; blank means none are.
  test_suffix text not null default '-100' check (length(test_suffix) <= 20),
  dedupe boolean not null default true,
  gst_plot numeric(5, 2) not null default 0 check (gst_plot between 0 and 100),
  gst_villa numeric(5, 2) not null default 18 check (gst_villa between 0 and 100),
  sold_field_plot text not null default 'price' check (sold_field_plot in ('price', 'incl')),
  sold_field_villa text not null default 'incl' check (sold_field_villa in ('price', 'incl')),
  period_from date,
  period_to date check (period_to >= period_from),
  report_date date,
  updated_by uuid references profiles (id),
  updated_at timestamptz not null default now()
);

insert into saarang_collection_settings (one_row) values (true) on conflict (one_row) do nothing;

create table if not exists saarang_collection_figures (
  id uuid primary key default gen_random_uuid(),
  project text not null check (project in ('plot', 'villa', 'phase3')),
  key text not null,
  value numeric(16, 2),
  updated_by uuid not null default auth.uid() references profiles (id),
  updated_at timestamptz not null default now(),
  unique (project, key),
  constraint saarang_collection_figures_key_known check (
    case when project = 'phase3'
      then key in ('C', 'E', 'N', 'O', 'P', 'F', 'M', 'H', 'MTD', 'T')
      else key in ('C', 'D', 'G', 'I', 'J', 'K', 'N', 'Q', 'R', 'T')
    end
  )
);

create table if not exists saarang_collection_excluded_receipts (
  id uuid primary key default gen_random_uuid(),
  receipt_no text not null unique
    check (length(receipt_no) between 1 and 60 and receipt_no = upper(trim(receipt_no))),
  reason text check (length(reason) <= 500),
  added_by uuid not null default auth.uid() references profiles (id),
  added_at timestamptz not null default now()
);

create table if not exists saarang_collection_corrections (
  id uuid primary key default gen_random_uuid(),
  unit text not null check (unit ~ '^SAARANG-(PLOT|VILLA)-' and unit = upper(trim(unit))),
  -- Blank means the unit's first milestone.
  stage text check (length(trim(stage)) between 1 and 200),
  delta numeric(14, 2) not null check (delta <> 0),
  note text check (length(note) <= 500),
  added_by uuid not null default auth.uid() references profiles (id),
  added_at timestamptz not null default now()
);

create table if not exists saarang_collection_extra_units (
  id uuid primary key default gen_random_uuid(),
  unit text not null unique check (unit ~ '^SAARANG-(PLOT|VILLA)-' and unit = upper(trim(unit))),
  applicant text check (length(applicant) <= 200),
  sold_value numeric(14, 2) not null check (sold_value >= 0),
  completed numeric(14, 2) not null default 0 check (completed >= 0),
  pending numeric(14, 2) not null default 0 check (pending >= 0),
  note text check (length(note) <= 500),
  added_by uuid not null default auth.uid() references profiles (id),
  added_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 3. RLS, audit, updated_at
-- ---------------------------------------------------------------------
-- Uploads are their own record, so they carry no audit trigger (their rows would double in it).

do $$
declare
  t text;
begin
  foreach t in array array[
    'saarang_collection_uploads', 'saarang_collection_settings', 'saarang_collection_figures',
    'saarang_collection_excluded_receipts', 'saarang_collection_corrections',
    'saarang_collection_extra_units'
  ]
  loop
    execute format('alter table %I enable row level security', t);
    execute format('revoke all on %I from public, anon', t);
    execute format('revoke truncate on %I from authenticated', t);
  end loop;
  revoke update, delete on saarang_collection_uploads from authenticated;

  foreach t in array array[
    'saarang_collection_settings', 'saarang_collection_figures',
    'saarang_collection_excluded_receipts', 'saarang_collection_corrections',
    'saarang_collection_extra_units'
  ]
  loop
    execute format('drop trigger if exists audit_%s on %I', t, t);
    execute format('create trigger audit_%s after insert or update or delete on %I for each row execute function audit_row()', t, t);
  end loop;

  foreach t in array array['saarang_collection_settings', 'saarang_collection_figures']
  loop
    execute format('drop trigger if exists set_updated_at on %I', t);
    execute format('create trigger set_updated_at before update on %I for each row execute function set_updated_at()', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 4. Policies — the grant, one per verb; who did it is the caller
-- ---------------------------------------------------------------------

do $$
declare
  t text;
  app constant text := '(select has_app(''/saarang-collections''))';
  me constant text := '(select auth.uid())';
begin
  foreach t in array array[
    'saarang_collection_uploads', 'saarang_collection_settings', 'saarang_collection_figures',
    'saarang_collection_excluded_receipts', 'saarang_collection_corrections',
    'saarang_collection_extra_units'
  ]
  loop
    execute format('drop policy if exists "%s read by grant" on %I', t, t);
    execute format('create policy "%s read by grant" on %I for select to authenticated using (%s)', t, t, app);
  end loop;

  drop policy if exists "saarang_collection_uploads insert by grant" on saarang_collection_uploads;
  execute format('create policy "saarang_collection_uploads insert by grant" on saarang_collection_uploads for insert to authenticated with check (%s and uploaded_by = %s)', app, me);

  drop policy if exists "saarang_collection_settings update by grant" on saarang_collection_settings;
  execute format('create policy "saarang_collection_settings update by grant" on saarang_collection_settings for update to authenticated using (%s) with check (%s and updated_by = %s)', app, app, me);

  drop policy if exists "saarang_collection_figures insert by grant" on saarang_collection_figures;
  execute format('create policy "saarang_collection_figures insert by grant" on saarang_collection_figures for insert to authenticated with check (%s and updated_by = %s)', app, me);
  drop policy if exists "saarang_collection_figures update by grant" on saarang_collection_figures;
  execute format('create policy "saarang_collection_figures update by grant" on saarang_collection_figures for update to authenticated using (%s) with check (%s and updated_by = %s)', app, app, me);

  foreach t in array array[
    'saarang_collection_excluded_receipts', 'saarang_collection_corrections',
    'saarang_collection_extra_units'
  ]
  loop
    execute format('drop policy if exists "%s insert by grant" on %I', t, t);
    execute format('create policy "%s insert by grant" on %I for insert to authenticated with check (%s and added_by = %s)', t, t, app, me);
    execute format('drop policy if exists "%s delete by grant" on %I', t, t);
    execute format('create policy "%s delete by grant" on %I for delete to authenticated using (%s)', t, t, app);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 5. Asserts
-- ---------------------------------------------------------------------

do $$
declare
  c text;
  s text;
  def text;
  r record;
  v int;
begin
  foreach c in array array['user_apps_app_known', 'role_apps_app_known']
  loop
    select pg_get_constraintdef(oid) into def from pg_constraint where conname = c;
    foreach s in array array[
      '/marathon', '/settings', '/masters', '/selections', '/budgets',
      '/indents', '/purchase-orders', '/inventory', '/bills', '/directory',
      '/training', '/management-dashboard', '/project-management',
      '/design-management', '/client-relations', '/financial-management',
      '/business-planning', '/pusher', '/relay', '/reporter', '/estimator',
      '/supervisors', '/dexter', '/birdwing', '/birdwing-books', '/saarang-collections'
    ]
    loop
      if def is null or def not like '%''' || s || '''%' then
        raise exception '0161: % does not admit %', c, s;
      end if;
    end loop;
    if def like '%''/turing''%' then
      raise exception '0161: % admits /turing, which is never grantable', c;
    end if;
  end loop;

  for r in
    select * from (values
      ('saarang_collection_uploads', 'r,a'),
      ('saarang_collection_settings', 'r,w'),
      ('saarang_collection_figures', 'a,r,w'),
      ('saarang_collection_excluded_receipts', 'a,d,r'),
      ('saarang_collection_corrections', 'a,d,r'),
      ('saarang_collection_extra_units', 'a,d,r')
    ) as x (name, verbs)
  loop
    if not exists (
      select 1 from pg_class cl join pg_namespace n on n.oid = cl.relnamespace
      where n.nspname = 'public' and cl.relname = r.name and cl.relrowsecurity
    ) then
      raise exception '0161: % is missing or has RLS off', r.name;
    end if;
    if (select string_agg(p.polcmd::text, ',' order by p.polcmd::text)
          from pg_policy p join pg_class cl on cl.oid = p.polrelid
         where cl.relname = r.name)
       is distinct from (select string_agg(x, ',' order by x) from unnest(string_to_array(r.verbs, ',')) x) then
      raise exception '0161: % has the wrong policies (expected %)', r.name, r.verbs;
    end if;
    if exists (
      select 1 from pg_policies
      where schemaname = 'public' and tablename = r.name
        and ('anon' = any(roles) or qual ilike '%role%' or with_check ilike '%role%')
    ) then
      raise exception '0161: % has a policy for anon or one reading a role', r.name;
    end if;
    if has_table_privilege('anon', 'public.' || r.name, 'select, insert, update, delete')
       or has_table_privilege('authenticated', 'public.' || r.name, 'truncate') then
      raise exception '0161: % is open to anon or truncatable', r.name;
    end if;
  end loop;

  if has_table_privilege('authenticated', 'public.saarang_collection_uploads', 'update, delete') then
    raise exception '0161: an upload can be changed or deleted';
  end if;

  select count(*) into v from saarang_collection_settings;
  if v <> 1 then
    raise exception '0161: % settings rows, expected 1', v;
  end if;
end $$;
