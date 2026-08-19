-- 0074 — The Estimator: costing a villa from its works
--
-- FOUNDER, 2026-08-19, on what the tool is for: "this whole build is
-- only estimation" — the workbook's schedule sheet is explicitly NOT in
-- scope. What is: each work consumes materials, directly and through
-- named mixes (M20 concrete = cement + sand + jelly + steel per cum);
-- an estimate belongs to a villa and lists works with quantities; the
-- tool totals the material takeoff and the money.
--
-- FOUR DECISIONS, all founder's, all load-bearing on this schema:
--
--   1. Estimation materials are their OWN master, not the items
--      catalogue. The catalogue is design-led — 1,400 light fittings and
--      exactly one raw material — and mixing cement into it would make
--      the designer's picker useless.
--   2. Mixes are named and reusable, and a work's recipe may hold BOTH
--      named mixes and direct materials. Change M20 once; every concrete
--      work follows.
--   3. Money is in from day one: material rates, labour rates, totals.
--   4. An estimate belongs to a plot/villa and starts life as a copy of
--      a template. Saarang has 43 near-identical villas.
--
-- WHY EVERY TABLE HERE IS ESTIMATOR-OWNED AND SELECT-GATED. Masters
-- reads are ungated by design (any tool may call them), so a table
-- carrying a RATE cannot live there — putting labour rates on
-- work_items would publish them to every signed-in person. Works stay
-- in Masters, money-free; a work's unit of measure and labour rate live
-- in estimator_work_info instead. Every table below gates SELECT as
-- well as writes on has_app('/estimator'), the funding_facilities shape
-- from 0058 — an empty list would read as "nothing set up yet", which
-- is not what "not for you" should look like.
--
-- RATES ARE NULLABLE ON PURPOSE. A missing rate means unpriced, and the
-- app must show it as unpriced. A `not null default 0` here would turn
-- every gap into a confident ₹0 total — the lying-number failure this
-- codebase keeps naming. Null is the type-level defence.
--
-- No views and no functions, so no revokes are needed — that rule is
-- about relations that bypass RLS; these tables are governed by their
-- policies.
--
-- Re-runnable throughout.

-- ---------------------------------------------------------------------
-- 1. '/estimator' becomes a grantable app
-- ---------------------------------------------------------------------
-- Both CHECKs, restated in full and identically — granting fails at the
-- database if only one moves. The list is the live one on both projects
-- (read from pg_constraint 2026-08-19), plus '/estimator'. Retired slugs
-- stay: the CHECKs are additive-only and an inert slug costs nothing.

alter table user_apps drop constraint if exists user_apps_app_known;
alter table user_apps add constraint user_apps_app_known check (
  app in (
    '/marathon', '/settings', '/masters', '/selections', '/budgets',
    '/indents', '/purchase-orders', '/inventory', '/bills', '/directory',
    '/training', '/management-dashboard', '/project-management',
    '/design-management', '/client-relations', '/financial-management',
    '/business-planning', '/pusher', '/relay', '/reporter', '/estimator'
  )
);

alter table role_apps drop constraint if exists role_apps_app_known;
alter table role_apps add constraint role_apps_app_known check (
  app in (
    '/marathon', '/settings', '/masters', '/selections', '/budgets',
    '/indents', '/purchase-orders', '/inventory', '/bills', '/directory',
    '/training', '/management-dashboard', '/project-management',
    '/design-management', '/client-relations', '/financial-management',
    '/business-planning', '/pusher', '/relay', '/reporter', '/estimator'
  )
);

-- ---------------------------------------------------------------------
-- 2. The price book: materials and mixes
-- ---------------------------------------------------------------------
-- `uom` is free text here, not procurement's eight-value CHECK. Site
-- estimation needs cum, sqm, rmt, tonne, brass, nos and more, and a
-- migration per new unit is the wrong price for a label. The arithmetic
-- never converts between units: a component's quantity is in the
-- material's own uom, per one uom of its parent, and the screens print
-- "bags per cum" so the meaning is visible. Forms offer a datalist of
-- the common ones to keep spelling from drifting.

create table if not exists estimator_materials (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  uom text not null check (length(trim(uom)) > 0),
  -- null = not priced yet. The app shows "unpriced", never zero.
  rate numeric check (rate >= 0),
  is_active boolean not null default true,
  created_by uuid references profiles (id),
  updated_by uuid references profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists estimator_materials_name_key
  on estimator_materials (lower(name));

create table if not exists estimator_mixes (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  -- What one unit of the mix IS, e.g. 'cum' for M20 concrete.
  uom text not null check (length(trim(uom)) > 0),
  description text,
  is_active boolean not null default true,
  created_by uuid references profiles (id),
  updated_by uuid references profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists estimator_mixes_name_key
  on estimator_mixes (lower(name));

-- What one unit of a mix is made of. `id` is not decoration: audit_row()
-- reads new.id and raises at runtime on a table without one — 0039
-- shipped a table keyed on its FK and every write failed until 0040.
create table if not exists estimator_mix_components (
  id uuid primary key default gen_random_uuid(),
  mix_id uuid not null references estimator_mixes (id),
  -- RESTRICT (the default): a material used in a mix cannot be deleted.
  -- Deactivate it instead, the house rule for reference data in use.
  material_id uuid not null references estimator_materials (id),
  qty_per_unit numeric not null check (qty_per_unit > 0),
  created_by uuid references profiles (id),
  updated_by uuid references profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (mix_id, material_id)
);

create index if not exists estimator_mix_components_mix_idx
  on estimator_mix_components (mix_id);
create index if not exists estimator_mix_components_material_idx
  on estimator_mix_components (material_id);

-- ---------------------------------------------------------------------
-- 3. The recipe book: what a work needs, per unit of itself
-- ---------------------------------------------------------------------

-- The estimator's half of a work (0073's work_items keeps the other,
-- money-free half in Masters). A work with no row here is "not set up"
-- and the works screen says so.
create table if not exists estimator_work_info (
  id uuid primary key default gen_random_uuid(),
  work_item_id uuid not null unique references work_items (id),
  uom text not null check (length(trim(uom)) > 0),
  -- null = not priced yet, same rule as materials.
  labour_rate numeric check (labour_rate >= 0),
  created_by uuid references profiles (id),
  updated_by uuid references profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- One line of a work's recipe: either a material or a mix, never both
-- and never neither. Quantity is per one uom of the work.
create table if not exists estimator_work_components (
  id uuid primary key default gen_random_uuid(),
  work_item_id uuid not null references work_items (id),
  material_id uuid references estimator_materials (id),
  mix_id uuid references estimator_mixes (id),
  qty_per_unit numeric not null check (qty_per_unit > 0),
  created_by uuid references profiles (id),
  updated_by uuid references profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint estimator_work_components_exactly_one
    check ((material_id is null) <> (mix_id is null))
);

-- A table-level UNIQUE over a nullable pair would let the same material
-- be added twice (null is never equal to null), so the no-duplicates
-- rule needs one partial index per side.
create unique index if not exists estimator_work_components_material_key
  on estimator_work_components (work_item_id, material_id)
  where material_id is not null;
create unique index if not exists estimator_work_components_mix_key
  on estimator_work_components (work_item_id, mix_id)
  where mix_id is not null;

create index if not exists estimator_work_components_work_idx
  on estimator_work_components (work_item_id);
create index if not exists estimator_work_components_mix_idx
  on estimator_work_components (mix_id) where mix_id is not null;

-- ---------------------------------------------------------------------
-- 4. Estimates
-- ---------------------------------------------------------------------
-- A TEMPLATE IS AN ESTIMATE WITHOUT A VILLA. The flag is kept as its own
-- column because policies and screens read better for it, and the
-- equality CHECK means it can never disagree with unit_id — do not
-- "simplify" it away in either direction.
--
-- Lines carry quantities and nothing else: costs are computed live from
-- today's rates. That is the founder's "calculator", and its accepted
-- cost is that a total moves when a rate does — there is no record of
-- what a total read last Tuesday. Freezing an estimate is a later,
-- purely additive phase.

create table if not exists estimator_estimates (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects (id),
  unit_id uuid,
  is_template boolean not null default false,
  name text not null check (length(trim(name)) > 0),
  note text,
  -- Where a copy came from. Provenance only, so losing the template is
  -- survivable.
  source_estimate_id uuid references estimator_estimates (id) on delete set null,
  created_by uuid references profiles (id),
  updated_by uuid references profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint estimator_estimates_template_shape
    check (is_template = (unit_id is null)),
  -- MATCH SIMPLE: a null unit passes (that is a template); a set one
  -- must be a villa of THIS project, declaratively (0029 §2, 0036).
  constraint estimator_estimates_unit_fkey
    foreign key (project_id, unit_id) references units (project_id, id)
);

create index if not exists estimator_estimates_project_idx
  on estimator_estimates (project_id);
create index if not exists estimator_estimates_unit_idx
  on estimator_estimates (unit_id) where unit_id is not null;

create table if not exists estimator_estimate_lines (
  id uuid primary key default gen_random_uuid(),
  estimate_id uuid not null references estimator_estimates (id),
  work_item_id uuid not null references work_items (id),
  qty numeric not null check (qty > 0),
  note text,
  created_by uuid references profiles (id),
  updated_by uuid references profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- One line per work: two lines for the same work would be two answers
  -- to one question. Quantities are edited, not accumulated.
  unique (estimate_id, work_item_id)
);

create index if not exists estimator_estimate_lines_estimate_idx
  on estimator_estimate_lines (estimate_id);
create index if not exists estimator_estimate_lines_work_idx
  on estimator_estimate_lines (work_item_id);

-- ---------------------------------------------------------------------
-- 5. Audit, updated_at, RLS — seven times over
-- ---------------------------------------------------------------------
-- SELECT is gated too, unlike the masters shape: everything here either
-- is a rate or is priced by one.

do $$
declare
  t text;
begin
  for t in select unnest(array[
    'estimator_materials', 'estimator_mixes', 'estimator_mix_components',
    'estimator_work_info', 'estimator_work_components',
    'estimator_estimates', 'estimator_estimate_lines'
  ])
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

    execute format('drop policy if exists "%s readable by estimator app" on %I', t, t);
    execute format(
      'create policy "%s readable by estimator app" on %I
         for select to authenticated using (has_app(''/estimator''))', t, t);

    execute format('drop policy if exists "%s writable by estimator app" on %I', t, t);
    execute format(
      'create policy "%s writable by estimator app" on %I
         for insert to authenticated with check (has_app(''/estimator''))', t, t);

    execute format('drop policy if exists "%s updatable by estimator app" on %I', t, t);
    execute format(
      'create policy "%s updatable by estimator app" on %I
         for update to authenticated
         using (has_app(''/estimator'')) with check (has_app(''/estimator''))', t, t);

    execute format('drop policy if exists "%s deletable by estimator app" on %I', t, t);
    execute format(
      'create policy "%s deletable by estimator app" on %I
         for delete to authenticated using (has_app(''/estimator''))', t, t);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 6. Prove it all landed
-- ---------------------------------------------------------------------

do $$
declare
  v int;
  c text;
begin
  foreach c in array array['user_apps_app_known', 'role_apps_app_known']
  loop
    if not exists (
      select 1 from pg_constraint
      where conname = c and pg_get_constraintdef(oid) like '%''/estimator''%'
    ) then
      raise exception '0074: % does not admit /estimator', c;
    end if;
  end loop;

  select count(*) into v
  from pg_class cl
  join pg_namespace n on n.oid = cl.relnamespace
  where n.nspname = 'public'
    and cl.relname like 'estimator\_%'
    and cl.relkind = 'r'
    and cl.relrowsecurity;
  if v <> 7 then
    raise exception '0074: RLS enabled on % of 7 estimator tables', v;
  end if;

  select count(*) into v
  from pg_policies
  where schemaname = 'public' and tablename like 'estimator\_%';
  if v <> 28 then
    raise exception '0074: expected 28 policies on the estimator tables, found %', v;
  end if;

  foreach c in array array[
    'estimator_work_components_exactly_one',
    'estimator_estimates_template_shape',
    'estimator_estimates_unit_fkey'
  ]
  loop
    if not exists (select 1 from pg_constraint where conname = c) then
      raise exception '0074: constraint % is missing', c;
    end if;
  end loop;

  foreach c in array array[
    'estimator_work_components_material_key',
    'estimator_work_components_mix_key',
    'estimator_materials_name_key',
    'estimator_mixes_name_key'
  ]
  loop
    if not exists (
      select 1 from pg_indexes where schemaname = 'public' and indexname = c
    ) then
      raise exception '0074: index % is missing', c;
    end if;
  end loop;
end $$;
