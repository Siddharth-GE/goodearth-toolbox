-- 0096 — The measurement sheet under an estimate line (the QS layer)
--
-- FOUNDER, 2026-09-25: "the estimator app needs a qs layer where you
-- can enter the number of lengths and volumes for each work".
--
-- Until now a line's quantity was typed: "Brickwork — 40 cum". A
-- quantity surveyor arrives at 40 through a measurement sheet — one row
-- per wall, slab or footing, each with a number-of, a length, a breadth
-- and a depth. This table holds those rows.
--
-- The founder's shape (same day): every row has the same four boxes and
-- a blank box is simply not used, so "12 nos" = 12, "12 × 3.0" = 36,
-- "1 × 4 × 3 × 0.15" = 1.8. Additions only — no deduction rows.
--
-- The quantity STAYS on estimator_estimate_lines.qty. The app sums a
-- line's rows in lib/estimator/calc.ts and writes the total there after
-- every change, so submit, the 0077 snapshot, indent pulls and every
-- comparison keep reading exactly the column they read today. SQL never
-- re-implements the arithmetic (the Estimator's standing rule). A line
-- with no rows keeps its typed quantity, unchanged.
--
-- Rows change only while the estimate is a draft (the 0087 trigger
-- shape), so after submit they stand as the record of where the frozen
-- quantity came from.
--
-- Re-runnable throughout.

create table if not exists estimator_estimate_line_measurements (
  id uuid primary key default gen_random_uuid(),
  -- RESTRICT (the default): the app deletes a line's measurements before
  -- the line, and an estimate's before the estimate.
  line_id uuid not null references estimator_estimate_lines (id),
  description text,
  nos numeric check (nos is null or nos > 0),
  length numeric check (length is null or length > 0),
  breadth numeric check (breadth is null or breadth > 0),
  depth numeric check (depth is null or depth > 0),
  sort_order int not null default 0,
  created_by uuid references profiles (id),
  updated_by uuid references profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- A row with every box blank measures nothing; refuse it rather than
  -- let it count as zero.
  constraint estimator_estimate_line_measurements_something_measured
    check (num_nonnulls(nos, length, breadth, depth) >= 1)
);

create index if not exists estimator_estimate_line_measurements_line_idx
  on estimator_estimate_line_measurements (line_id);

-- A measurement changes only while its estimate is a draft — the
-- estimator_line_components_draft_only shape (0087). FOR SHARE on the
-- parent so a measurement write and the submit UPDATE serialise.
create or replace function estimator_line_measurements_draft_only()
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
      'This estimate is % — a work''s measurements can only change while it is a draft. Revise it instead.',
      coalesce(parent_status, 'missing');
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end $$;

drop trigger if exists estimator_line_measurements_draft_only
  on estimator_estimate_line_measurements;
create trigger estimator_line_measurements_draft_only
  before insert or update or delete on estimator_estimate_line_measurements
  for each row execute function estimator_line_measurements_draft_only();

-- The trigger function is a plain (invoker) trigger, not something to
-- call directly: named roles, not public.
revoke execute on function estimator_line_measurements_draft_only() from public, anon, authenticated;

-- Audit, updated_at, RLS — the 0074 loop, for one table.
do $$
declare
  t text;
begin
  for t in select unnest(array['estimator_estimate_line_measurements'])
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
    where relname = 'estimator_estimate_line_measurements' and relrowsecurity
  ) then
    raise exception '0096: estimator_estimate_line_measurements missing or RLS off';
  end if;

  select count(*) into v from pg_policies
    where schemaname = 'public' and tablename = 'estimator_estimate_line_measurements';
  if v <> 4 then
    raise exception '0096: expected 4 policies, found %', v;
  end if;

  if not exists (
    select 1 from pg_trigger
    where tgname = 'estimator_line_measurements_draft_only'
      and tgrelid = 'estimator_estimate_line_measurements'::regclass
  ) then
    raise exception '0096: draft-only trigger missing';
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'estimator_estimate_line_measurements_something_measured'
  ) then
    raise exception '0096: the something-measured check is missing';
  end if;
end $$;
