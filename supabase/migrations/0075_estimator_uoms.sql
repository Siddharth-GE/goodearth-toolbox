-- 0075 — Units of measure become a master, not a typing exercise
--
-- FOUNDER, 2026-08-19, after first use of the Estimator on staging:
-- "get a units master, we cant have people type all this". The first
-- real session produced 'cft', 'Sqft' and 'cum' typed by hand — three
-- spellings deep into a tool whose arithmetic hangs off those strings
-- matching. The fix is a picker fed from one list, and this table is
-- that list.
--
-- DELIBERATELY NOT A CHECK CONSTRAINT, AND THE UOM COLUMNS STAY TEXT.
-- The existing uom columns (estimator_materials.uom, estimator_mixes.uom,
-- estimator_work_info.uom) keep their free-text shape: rows already
-- exist on staging, and a retro-FK would mean remapping live data for
-- no arithmetic gain — the strings are labels, not join keys. The
-- ENFORCEMENT IS THE UI: every uom field becomes a select fed from this
-- table. Procurement's 8-value CHECK is the other end of the trade-off
-- and stays where it is; the estimation team names its own units
-- (a 'brass', a 'bundle') without a migration.
--
-- Estimator-owned, not a shared Masters entity: nothing outside
-- /estimator reads it, and it carries no money, but the gate follows
-- the tool that owns it — the same has_app('/estimator') four-policy
-- shape as the seven 0074 tables (one loop, all eight, so a re-run of
-- either migration leaves the same result).
--
-- No views and no functions, so no revokes are needed.
--
-- Re-runnable throughout.

create table if not exists estimator_uoms (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  -- Lower sorts first in the picker; ties break alphabetically. The
  -- everyday units sit on top, the rare ones below.
  sort_order int not null default 100,
  is_active boolean not null default true,
  created_by uuid references profiles (id),
  updated_by uuid references profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists estimator_uoms_name_key
  on estimator_uoms (lower(name));

-- The working vocabulary of a Kerala site, everyday units first. A seed
-- of unit NAMES is a fixture on any database — nothing here becomes a
-- credential or a practice row on production (the 0002 lesson does not
-- bite: no secrets, no people).
insert into estimator_uoms (name, sort_order) values
  ('nos',    10),
  ('sqft',   20),
  ('sqm',    30),
  ('cft',    40),
  ('cum',    50),
  ('rft',    60),
  ('rmt',    70),
  ('kg',     80),
  ('tonne',  90),
  ('bag',    100),
  ('litre',  110),
  ('set',    120),
  ('lumpsum', 130)
on conflict ((lower(name))) do nothing;

-- Triggers and the four-policy gate, same loop shape as 0074.
do $$
declare
  t text;
begin
  for t in select unnest(array['estimator_uoms'])
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

-- Prove it landed.
do $$
declare
  v int;
begin
  if not exists (
    select 1 from pg_class cl
    join pg_namespace n on n.oid = cl.relnamespace
    where n.nspname = 'public' and cl.relname = 'estimator_uoms'
      and cl.relkind = 'r' and cl.relrowsecurity
  ) then
    raise exception '0075: estimator_uoms is missing or has RLS off';
  end if;

  select count(*) into v
  from pg_policies
  where schemaname = 'public' and tablename = 'estimator_uoms';
  if v <> 4 then
    raise exception '0075: expected 4 policies on estimator_uoms, found %', v;
  end if;

  if not exists (
    select 1 from pg_indexes
    where schemaname = 'public' and indexname = 'estimator_uoms_name_key'
  ) then
    raise exception '0075: the unique name index is missing';
  end if;

  select count(*) into v from estimator_uoms;
  if v < 13 then
    raise exception '0075: expected at least 13 seeded units, found %', v;
  end if;
end $$;
