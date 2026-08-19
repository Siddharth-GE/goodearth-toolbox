-- 0073 — Works masters: the labour vocabulary for the coming Estimator
--
-- The site team runs construction estimation and progress tracking from
-- an Excel workbook. An Estimator tool (Operations) will replace it; this
-- migration builds only the masters it will stand on, decided 2026-08-19:
--
--   1. A THREE-LEVEL hierarchy: work_categories (ENC, SM, FD, SS, PF, F,
--      LP, MEP, IN) -> work_groups (the sheet's inline section headers,
--      e.g. FD.3 "Dry rubble footing") -> work_items (the actual work
--      lines, e.g. FD.4 "Excavation for rubble foundation").
--   2. Contractors are VENDORS with a flag — the one-counterparty-list
--      rule (0025: "Contractors are vendors") stands. `is_contractor`
--      lets the Estimator filter the list without splitting it.
--   3. This vocabulary is NOT construction_stages (0053). That list
--      (Foundation, Plinth, … Handover) is what indents and construction
--      budgets pick from and stays untouched. The two coexist on purpose.
--
-- Codes: groups and items share one numbering space per category on the
-- site team's sheet (FD.3 is a group, FD.4 an item) but live in two
-- tables, so the per-table UNIQUEs cannot see a cross-table collision.
-- That uniqueness is enforced by the Masters actions and the import
-- script; a trigger for it would be overkill at this scale.
--
-- Categories are seeded here (founder-approved vocabulary, reference
-- data — passes the "what does a replayed seed become" test). Groups and
-- items (~200 rows) load via scripts/import-works.ts.
--
-- No views and no functions in this file, so no revokes are needed —
-- that rule is about relations that bypass RLS; these tables are
-- governed by their policies.
--
-- Re-runnable throughout.

-- ---------------------------------------------------------------------
-- 1. The three tables
-- ---------------------------------------------------------------------

create table if not exists work_categories (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (length(trim(code)) > 0),
  name text not null check (length(trim(name)) > 0),
  sort_order int not null default 0,
  is_active boolean not null default true,
  created_by uuid references profiles (id),
  updated_by uuid references profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists work_groups (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references work_categories (id),
  code text not null unique check (length(trim(code)) > 0),
  name text not null check (length(trim(name)) > 0),
  sort_order int not null default 0,
  is_active boolean not null default true,
  created_by uuid references profiles (id),
  updated_by uuid references profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- The composite-FK target, so an item's group is provably in the
  -- item's own category — declaratively, with no trigger (0029 §2,
  -- 0039's project_stages).
  unique (category_id, id)
);

create table if not exists work_items (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references work_categories (id),
  -- null = the item hangs off the category directly (ENC, SM, LP, IN
  -- have no groups at all).
  group_id uuid,
  code text not null unique check (length(trim(code)) > 0),
  name text not null check (length(trim(name)) > 0),
  sort_order int not null default 0,
  is_active boolean not null default true,
  created_by uuid references profiles (id),
  updated_by uuid references profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- MATCH SIMPLE (the default): a null group_id passes; a set one must
  -- name a group of this very category.
  constraint work_items_group_in_category_fkey
    foreign key (category_id, group_id) references work_groups (category_id, id)
);

create index if not exists work_groups_category_idx
  on work_groups (category_id, sort_order);
create index if not exists work_items_category_idx
  on work_items (category_id, sort_order);
create index if not exists work_items_group_idx
  on work_items (group_id) where group_id is not null;

-- ---------------------------------------------------------------------
-- 2. Audit, updated_at, RLS — the 0053 masters shape, three times over
-- ---------------------------------------------------------------------

do $$
declare
  t text;
begin
  for t in select unnest(array['work_categories', 'work_groups', 'work_items'])
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

    -- Reference data: readable by any signed-in member of staff, like
    -- the rest of Masters. Writes are Masters' job. DELETE included, as
    -- on construction_stages: a hand-typed mistake should be removable,
    -- and anything the Estimator later references will be FK-protected.
    execute format('drop policy if exists "%s readable by authenticated" on %I', t, t);
    execute format(
      'create policy "%s readable by authenticated" on %I
         for select to authenticated using (true)', t, t);

    execute format('drop policy if exists "%s writable by masters app" on %I', t, t);
    execute format(
      'create policy "%s writable by masters app" on %I
         for insert to authenticated with check (has_app(''/masters''))', t, t);

    execute format('drop policy if exists "%s updatable by masters app" on %I', t, t);
    execute format(
      'create policy "%s updatable by masters app" on %I
         for update to authenticated
         using (has_app(''/masters'')) with check (has_app(''/masters''))', t, t);

    execute format('drop policy if exists "%s deletable by masters app" on %I', t, t);
    execute format(
      'create policy "%s deletable by masters app" on %I
         for delete to authenticated using (has_app(''/masters''))', t, t);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 3. Seed the nine categories
-- ---------------------------------------------------------------------
-- The site team's own prefixes, in build order. sort_order steps by 10
-- so a new category can slot between two. Editable in Masters after.
-- IN has no header row on the sheet — "Interiors" is inferred from its
-- items (cabinet fabrication, shutters, hardware).

insert into work_categories (code, name, sort_order) values
  ('ENC', 'Engineering consultation', 10),
  ('SM',  'Site Mobilisation',        20),
  ('FD',  'Foundation',               30),
  ('SS',  'Super-structure',          40),
  ('PF',  'Pre-Finishes',             50),
  ('F',   'Finishes',                 60),
  ('LP',  'Landscape & Parking',      70),
  ('MEP', 'MEP',                      80),
  ('IN',  'Interiors',                90)
on conflict (code) do nothing;

-- ---------------------------------------------------------------------
-- 4. Contractors are vendors, now sayably so
-- ---------------------------------------------------------------------
-- 0025's rule holds: one counterparty list. The flag only lets a screen
-- filter it. Existing vendors default to false; the import script marks
-- the site team's contractor list true.

alter table vendors add column if not exists is_contractor boolean not null default false;

-- ---------------------------------------------------------------------
-- 5. Prove it all landed
-- ---------------------------------------------------------------------

do $$
declare
  v int;
begin
  select count(*) into v from work_categories;
  if v < 9 then
    raise exception '0073: expected 9 work categories, found %', v;
  end if;

  select count(*) into v
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname in ('work_categories', 'work_groups', 'work_items')
    and c.relrowsecurity;
  if v <> 3 then
    raise exception '0073: RLS enabled on % of 3 works tables', v;
  end if;

  select count(*) into v
  from pg_policies
  where schemaname = 'public'
    and tablename in ('work_categories', 'work_groups', 'work_items');
  if v <> 12 then
    raise exception '0073: expected 12 policies on the works tables, found %', v;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'work_items_group_in_category_fkey'
  ) then
    raise exception '0073: work_items composite FK to work_groups is missing';
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'vendors'
      and column_name = 'is_contractor'
  ) then
    raise exception '0073: vendors.is_contractor is missing';
  end if;
end $$;
