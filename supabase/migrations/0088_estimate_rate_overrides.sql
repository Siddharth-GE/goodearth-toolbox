-- 0088 — Labour rates and material prices can vary per villa (G5)
--
-- FOUNDER, 2026-08-20: "sometimes labour variations can happen in a
-- plot as well [as] prices, so that needs to be included."
--
-- 0087 let a work's RECIPE vary per villa and deliberately left the
-- labour rate and the material prices on the master. Both now vary
-- too, and each sits where its variation actually belongs:
--
--   * LABOUR is per work per villa — a column on the estimate line
--     (one line per work per estimate since 0074, so the line IS the
--     work-in-this-villa). Null = follow the work's standard rate,
--     which stays the default for every line nobody has touched.
--
--   * A MATERIAL PRICE is per villa, NOT per work: cement costing more
--     at a far plot costs more for every work that uses it. One row
--     per (estimate, material) makes that impossible to contradict —
--     the same material cannot carry two prices in one estimate, which
--     a per-line price column would have allowed.
--
-- Both are overrides, never copies: the standard shows through
-- wherever no override exists, and clearing one returns the line or
-- the material to the master. Neither needs new plumbing downstream —
-- the 0077 snapshot already freezes the computed labour_rate and the
-- takeoff's rate at submit, so an official estimate keeps this
-- villa's numbers forever, and every reader carries on unchanged.
--
-- Legacy estimator_materials are admitted alongside items for the same
-- reason as 0087: a draft still holding a pre-0086 component must be
-- priceable without guessing.
--
-- Re-runnable throughout.

-- ---------------------------------------------------------------------
-- 1. Labour, per work per villa
-- ---------------------------------------------------------------------
-- No new trigger: estimator_estimate_lines_draft_only (0077) already
-- guards every write to this table, so the override is draft-only for
-- free — and the 0077 line guard is the one place that rule lives.

alter table estimator_estimate_lines
  add column if not exists labour_rate numeric;

alter table estimator_estimate_lines
  drop constraint if exists estimator_estimate_lines_labour_rate_sane;
alter table estimator_estimate_lines
  add constraint estimator_estimate_lines_labour_rate_sane
  check (labour_rate is null or labour_rate >= 0);

comment on column estimator_estimate_lines.labour_rate is
  'This villa''s labour rate for this work (0088). Null = the work''s standard rate from estimator_work_info. Zero is a real answer, never "unpriced".';

-- ---------------------------------------------------------------------
-- 2. Material prices, per villa
-- ---------------------------------------------------------------------

create table if not exists estimator_estimate_item_rates (
  id uuid primary key default gen_random_uuid(),
  estimate_id uuid not null references estimator_estimates (id),
  item_id uuid references items (id),
  -- Pre-0086 components can still be priced (0087's reasoning).
  material_id uuid references estimator_materials (id),
  rate numeric not null check (rate >= 0),
  note text,
  created_by uuid references profiles (id),
  updated_by uuid references profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint estimator_estimate_item_rates_one_source
    check ((item_id is null) <> (material_id is null))
);

-- One price per material per estimate — the whole point of putting
-- this on the estimate rather than the line (partial indexes, because
-- a table-level UNIQUE over nullable columns allows duplicates).
create unique index if not exists estimator_estimate_item_rates_item_key
  on estimator_estimate_item_rates (estimate_id, item_id) where item_id is not null;
create unique index if not exists estimator_estimate_item_rates_material_key
  on estimator_estimate_item_rates (estimate_id, material_id) where material_id is not null;
create index if not exists estimator_estimate_item_rates_estimate_idx
  on estimator_estimate_item_rates (estimate_id);

-- Draft-only, the 0077 shape. FOR SHARE on the parent so a price write
-- and the submit UPDATE serialise instead of interleaving.
create or replace function estimator_item_rates_draft_only()
returns trigger
language plpgsql
as $$
declare
  target_estimate uuid;
  parent_status text;
begin
  if tg_op = 'DELETE' then
    target_estimate := old.estimate_id;
  else
    target_estimate := new.estimate_id;
  end if;

  select status into parent_status
  from estimator_estimates where id = target_estimate
  for share;

  if parent_status is distinct from 'draft' then
    raise exception
      'This estimate is % — its prices can only change while it is a draft. Revise it instead.',
      coalesce(parent_status, 'missing');
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end $$;

drop trigger if exists estimator_item_rates_draft_only on estimator_estimate_item_rates;
create trigger estimator_item_rates_draft_only
  before insert or update or delete on estimator_estimate_item_rates
  for each row execute function estimator_item_rates_draft_only();

-- Audit, updated_at, RLS — the 0074 loop.
do $$
declare
  t text;
begin
  for t in select unnest(array['estimator_estimate_item_rates'])
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
-- 3. Prove it landed
-- ---------------------------------------------------------------------

do $$
declare
  v int;
begin
  if not exists (
    select 1 from information_schema.columns
    where table_name = 'estimator_estimate_lines' and column_name = 'labour_rate'
  ) then
    raise exception '0088: estimator_estimate_lines has no labour_rate';
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'estimator_estimate_lines_labour_rate_sane'
  ) then
    raise exception '0088: the labour_rate check is missing';
  end if;

  if not exists (
    select 1 from pg_class
    where relname = 'estimator_estimate_item_rates' and relrowsecurity
  ) then
    raise exception '0088: estimator_estimate_item_rates missing or RLS off';
  end if;

  select count(*) into v from pg_policies
    where schemaname = 'public' and tablename = 'estimator_estimate_item_rates';
  if v <> 4 then
    raise exception '0088: expected 4 policies, found %', v;
  end if;

  if not exists (
    select 1 from pg_trigger
    where tgname = 'estimator_item_rates_draft_only'
      and tgrelid = 'estimator_estimate_item_rates'::regclass
  ) then
    raise exception '0088: draft-only trigger missing';
  end if;
end $$;
