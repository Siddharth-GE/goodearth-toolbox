-- 0087 — A work can vary per villa (Phase 2, G4)
--
-- FOUNDER, 2026-08-20: "work can be set up but needs to be editable
-- within an estimate, since every house is different — there may be
-- some variations in them."
--
-- The Works tab stays the STANDARD: unit, labour rate, recipe. Inside
-- a DRAFT estimate, a line may now carry its own version of the
-- recipe: customising copies the standard's components onto the line,
-- and from then on THAT list — whole, not a delta — is what the line
-- means. No override rows = the standard applies, and keeps following
-- the standard as it changes; override rows = this villa's variation,
-- which no longer moves when the standard does (that is the point).
-- Reset = delete the overrides, back to standard.
--
-- What deliberately does NOT vary per estimate: the work's unit (it
-- defines what every line quantity MEANS) and its labour rate. If
-- villa-level labour variation is ever wanted, it is its own decision.
--
-- Submit needs no new machinery: the 0077 snapshot freezes the
-- computed takeoff and costs, so indent pulls, the supervisors' page,
-- comparisons and over-issue warnings all keep reading exactly what
-- they read today.
--
-- Components mirror estimator_work_components' three sources: an item
-- (the 0086 normal case), a mix, or a legacy estimator_materials row —
-- legacy included so customising a pre-0086 recipe can copy it
-- faithfully instead of refusing or guessing.
--
-- Re-runnable throughout.

create table if not exists estimator_estimate_line_components (
  id uuid primary key default gen_random_uuid(),
  -- RESTRICT (the default): the app deletes a line's variation before
  -- the line, and an estimate's before the estimate.
  line_id uuid not null references estimator_estimate_lines (id),
  item_id uuid references items (id),
  mix_id uuid references estimator_mixes (id),
  material_id uuid references estimator_materials (id),
  qty_per_unit numeric not null check (qty_per_unit > 0),
  created_by uuid references profiles (id),
  updated_by uuid references profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint estimator_estimate_line_components_one_source check (
    (item_id is not null)::int
    + (mix_id is not null)::int
    + (material_id is not null)::int = 1
  )
);

-- One row per source per line (the 0074 partial-index shape — a
-- table-level UNIQUE over nullable columns would allow duplicates).
create unique index if not exists estimator_estimate_line_components_item_key
  on estimator_estimate_line_components (line_id, item_id) where item_id is not null;
create unique index if not exists estimator_estimate_line_components_mix_key
  on estimator_estimate_line_components (line_id, mix_id) where mix_id is not null;
create unique index if not exists estimator_estimate_line_components_material_key
  on estimator_estimate_line_components (line_id, material_id) where material_id is not null;
create index if not exists estimator_estimate_line_components_line_idx
  on estimator_estimate_line_components (line_id);

-- A variation changes only while its estimate is a draft — the
-- estimator_estimate_lines_draft_only shape, one join further out.
-- FOR SHARE on the parent so a component write and the submit UPDATE
-- serialise instead of interleaving.
create or replace function estimator_line_components_draft_only()
returns trigger
language plpgsql
as $$
declare
  target_line uuid;
  parent_status text;
begin
  if tg_op = 'DELETE' then
    target_line := old.line_id;
  else
    target_line := new.line_id;
  end if;

  select e.status into parent_status
  from estimator_estimate_lines l
  join estimator_estimates e on e.id = l.estimate_id
  where l.id = target_line
  for share of e;

  if parent_status is distinct from 'draft' then
    raise exception
      'This estimate is % — a work''s variation can only change while it is a draft. Revise it instead.',
      coalesce(parent_status, 'missing');
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end $$;

drop trigger if exists estimator_line_components_draft_only
  on estimator_estimate_line_components;
create trigger estimator_line_components_draft_only
  before insert or update or delete on estimator_estimate_line_components
  for each row execute function estimator_line_components_draft_only();

-- Audit, updated_at, RLS — the 0074 loop, for one table.
do $$
declare
  t text;
begin
  for t in select unnest(array['estimator_estimate_line_components'])
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
-- Prove it landed
-- ---------------------------------------------------------------------

do $$
declare
  v int;
begin
  if not exists (
    select 1 from pg_class
    where relname = 'estimator_estimate_line_components' and relrowsecurity
  ) then
    raise exception '0087: estimator_estimate_line_components missing or RLS off';
  end if;

  select count(*) into v from pg_policies
    where schemaname = 'public' and tablename = 'estimator_estimate_line_components';
  if v <> 4 then
    raise exception '0087: expected 4 policies, found %', v;
  end if;

  if not exists (
    select 1 from pg_trigger
    where tgname = 'estimator_line_components_draft_only'
      and tgrelid = 'estimator_estimate_line_components'::regclass
  ) then
    raise exception '0087: draft-only trigger missing';
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'estimator_estimate_line_components_one_source'
  ) then
    raise exception '0087: one-source check missing';
  end if;
end $$;
