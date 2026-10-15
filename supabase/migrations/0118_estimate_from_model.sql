-- 0118 — From the model: a SketchUp takeoff becomes a villa's estimate
--
-- FOUNDER, 2026-10-14: "i need to prepare a hand off system for this
-- thing in one click to go the tool box as an estimate" — the Goodearth
-- QS extension for SketchUp measures a villa's model work by work and
-- hands the takeoff to the Estimator's "From the model" page, which
-- writes it into the villa's working estimate (0098) as measurement rows
-- (0096). Root plan.md, sixth piece; estimator/PLAN.md decision 12 once
-- vetted.
--
--   1. estimator_estimate_line_measurements.from_model / model_refs — a
--      row the model wrote, and the SketchUp elements it was measured
--      from. Re-import replaces the model's rows and never touches a row
--      typed by hand, so the flag is what tells them apart.
--   2. estimator_estimates.model_* — which model the working estimate
--      was last measured from, when, and by whom (the preview warns
--      before a different model lands on the same villa).
--   3. estimator_work_info.model_measure — how the model measures each
--      work; null = from its unit. The rate book is the one place this
--      is decided (founder, 2026-10-15: the plan's question 5), so the
--      works list SketchUp loads is downloaded from here. Backfilled with
--      the rules the extension's bundled list carries today, so the first
--      download changes nothing the model measures.
--   4. estimator_copy_estimate_contents() — re-created to carry the two
--      new columns. Without them Make official, or a villa started from
--      another villa's estimate, would turn model rows into hand rows and
--      the next import would add the model's rows on top: counted twice.
--      The body is 0098's exactly, plus the two columns.
--   5. import_model_rows() — the import's writes in one transaction:
--      the lines not yet on the estimate, the model's old rows out, the
--      new rows in, an emptied model line back to "to measure", the
--      header stamped. It never sums: the action re-sums every touched
--      line through calc.ts (syncLineQty) afterwards, the Estimator's
--      standing rule.
--
-- Both functions are SECURITY INVOKER, the 0098 shape: RLS and the
-- /estimator policies apply to every statement inside them, and the
-- 0077/0096 draft-only triggers still fire. Execute is revoked from
-- public and anon and granted to authenticated, in this file
-- (SECURITY.md). No new table, view or policy; no money column; no
-- cross-tool write.
--
-- Re-runnable throughout.

-- ---------------------------------------------------------------------
-- 1. A row the model wrote
-- ---------------------------------------------------------------------

alter table estimator_estimate_line_measurements
  add column if not exists from_model boolean not null default false,
  add column if not exists model_refs text[];

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'estimator_estimate_line_measurements_refs_from_model'
  ) then
    alter table estimator_estimate_line_measurements
      add constraint estimator_estimate_line_measurements_refs_from_model
      check (from_model or model_refs is null);
  end if;
end $$;

comment on column estimator_estimate_line_measurements.from_model is
  'Written by an import from a SketchUp model (0118). Re-import replaces these rows; rows typed by hand are never touched. Changed in the model, not on the sheet.';
comment on column estimator_estimate_line_measurements.model_refs is
  'The SketchUp elements the row was measured from (persistent ids) — for tracing a row back, never for matching.';

-- ---------------------------------------------------------------------
-- 2. Which model the estimate came from
-- ---------------------------------------------------------------------

alter table estimator_estimates
  add column if not exists model_file text,
  add column if not exists model_guid text,
  add column if not exists model_imported_at timestamptz,
  add column if not exists model_imported_by uuid references profiles (id);

comment on column estimator_estimates.model_guid is
  'SketchUp''s id for the model last imported into this working estimate (0118); the preview warns before a different one lands here.';

-- ---------------------------------------------------------------------
-- 3. How the model measures a work
-- ---------------------------------------------------------------------

alter table estimator_work_info
  add column if not exists model_measure text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'estimator_work_info_model_measure'
  ) then
    alter table estimator_work_info
      add constraint estimator_work_info_model_measure
      check (model_measure in ('volume', 'area', 'base_and_sides', 'length', 'count', 'manual'));
  end if;
end $$;

comment on column estimator_work_info.model_measure is
  'How the SketchUp model measures this work (0118): volume, area, base_and_sides (a footing''s shuttering), length, count, or manual (measured by hand on the estimate). Null = from the unit.';

-- What the extension's bundled works list says today, so the first list
-- downloaded from here measures exactly what SketchUp measures now:
-- FD.15 is base + 4 sides (its name says so); FD.16, FD.22 and FD.29–32
-- wait for the founder to say what area they mean; Superstructure and
-- MEP works in sqft are shares of a package rate per sqft of built-up
-- area, not a surface the model can measure. Only where nobody has set
-- it — a re-run never overrides the rate book. The same rule runs in
-- scripts/import-masters-workbook.ts, for a rate book loaded after this.
update estimator_work_info i
set model_measure = 'base_and_sides'
from work_items w
where w.id = i.work_item_id and w.code = 'FD.15' and i.model_measure is null;

update estimator_work_info i
set model_measure = 'manual'
from work_items w
join work_categories c on c.id = w.category_id
where w.id = i.work_item_id
  and i.model_measure is null
  and (w.code in ('FD.16', 'FD.22', 'FD.29', 'FD.30', 'FD.31', 'FD.32')
       or (c.code in ('SS', 'MEP') and i.uom = 'sqft'));

-- ---------------------------------------------------------------------
-- 4. The copy carries the model's flags
-- ---------------------------------------------------------------------
-- 0098's body, unchanged but for from_model and model_refs on the
-- measurement rows. A later edit that drops them brings the doubling
-- back (estimator/PLAN.md, "Things that will bite").

create or replace function estimator_copy_estimate_contents(
  p_from uuid,
  p_to uuid,
  p_everything boolean
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  insert into estimator_estimate_lines
    (estimate_id, work_item_id, qty, note, labour_rate, created_by, updated_by)
  select p_to, l.work_item_id,
         case when p_everything then l.qty end,
         l.note,
         case when p_everything then l.labour_rate end,
         auth.uid(), auth.uid()
  from estimator_estimate_lines l
  where l.estimate_id = p_from;

  if not p_everything then
    return;
  end if;

  insert into estimator_estimate_line_components
    (line_id, item_id, mix_id, material_id, qty_per_unit, created_by, updated_by)
  select t.id, c.item_id, c.mix_id, c.material_id, c.qty_per_unit, auth.uid(), auth.uid()
  from estimator_estimate_line_components c
  join estimator_estimate_lines s on s.id = c.line_id and s.estimate_id = p_from
  join estimator_estimate_lines t on t.estimate_id = p_to and t.work_item_id = s.work_item_id;

  insert into estimator_estimate_line_measurements
    (line_id, description, nos, length, breadth, depth, sort_order, from_model, model_refs,
     created_by, updated_by)
  select t.id, m.description, m.nos, m.length, m.breadth, m.depth, m.sort_order,
         m.from_model, m.model_refs, auth.uid(), auth.uid()
  from estimator_estimate_line_measurements m
  join estimator_estimate_lines s on s.id = m.line_id and s.estimate_id = p_from
  join estimator_estimate_lines t on t.estimate_id = p_to and t.work_item_id = s.work_item_id;

  insert into estimator_estimate_item_rates
    (estimate_id, item_id, material_id, rate, note, created_by, updated_by)
  select p_to, r.item_id, r.material_id, r.rate, r.note, auth.uid(), auth.uid()
  from estimator_estimate_item_rates r
  where r.estimate_id = p_from;
end $$;

-- ---------------------------------------------------------------------
-- 5. Import the model's rows
-- ---------------------------------------------------------------------
-- p_lines: [{work_item_id, rows: [{description, nos, length, breadth,
--            depth, model_refs: [text]}]}] — every work the model names,
--            already matched and checked by the app (lib/estimator/
--            model-takeoff.ts). A work with no rows is one the model
--            leaves to measure by hand: it is put on as "to measure" if
--            it is not there yet, and nothing else.
-- p_model:  {file, guid} — the model, for the header.
-- Returns the lines whose sheets changed, for the app to re-sum.

create or replace function import_model_rows(
  p_estimate uuid,
  p_lines jsonb,
  p_model jsonb
)
returns uuid[]
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_working boolean;
  v_had uuid[];
  v_touched uuid[];
begin
  -- Serialises two imports into the same estimate, and with Make
  -- official (which locks the same row).
  select is_working into v_working
  from estimator_estimates
  where id = p_estimate
  for update;

  if not found then
    raise exception 'That estimate no longer exists';
  end if;
  if not v_working then
    raise exception 'A model goes into a villa''s working estimate only — an official estimate is never changed';
  end if;
  if jsonb_typeof(p_lines) is distinct from 'array' then
    raise exception 'The takeoff''s works are missing';
  end if;

  -- The works not on the estimate yet arrive "to measure" (0097).
  insert into estimator_estimate_lines (estimate_id, work_item_id, qty, created_by, updated_by)
  select distinct p_estimate, x.work_item_id, null::numeric, auth.uid(), auth.uid()
  from jsonb_to_recordset(p_lines) as x(work_item_id uuid)
  where x.work_item_id is not null
  on conflict (estimate_id, work_item_id) do nothing;

  -- The model's rows from the last import go; hand rows stay.
  select coalesce(array_agg(distinct m.line_id), '{}') into v_had
  from estimator_estimate_line_measurements m
  join estimator_estimate_lines l on l.id = m.line_id
  where l.estimate_id = p_estimate and m.from_model;

  delete from estimator_estimate_line_measurements m
  using estimator_estimate_lines l
  where l.id = m.line_id and l.estimate_id = p_estimate and m.from_model;

  -- The new rows, in the model's order, after the line's hand rows.
  insert into estimator_estimate_line_measurements
    (line_id, description, nos, length, breadth, depth, sort_order, from_model, model_refs,
     created_by, updated_by)
  select l.id,
         nullif(btrim(e.row ->> 'description'), ''),
         (e.row ->> 'nos')::numeric,
         (e.row ->> 'length')::numeric,
         (e.row ->> 'breadth')::numeric,
         (e.row ->> 'depth')::numeric,
         coalesce((select max(h.sort_order) from estimator_estimate_line_measurements h
                   where h.line_id = l.id), 0) + e.ord::int,
         true,
         case when jsonb_typeof(e.row -> 'model_refs') = 'array'
              then array(select jsonb_array_elements_text(e.row -> 'model_refs')) end,
         auth.uid(), auth.uid()
  from jsonb_to_recordset(p_lines) as x(work_item_id uuid, rows jsonb)
  join estimator_estimate_lines l on l.estimate_id = p_estimate and l.work_item_id = x.work_item_id
  cross join lateral jsonb_array_elements(
    case when jsonb_typeof(x.rows) = 'array' then x.rows else '[]'::jsonb end
  ) with ordinality as e(row, ord);

  -- A line measured only by the model, which the model no longer
  -- measures, goes back to "to measure" — never a stale number.
  update estimator_estimate_lines l
  set qty = null, updated_by = auth.uid()
  where l.id = any(v_had)
    and l.qty is not null
    and not exists (select 1 from estimator_estimate_line_measurements m where m.line_id = l.id);

  update estimator_estimates
  set model_file = nullif(btrim(p_model ->> 'file'), ''),
      model_guid = nullif(btrim(p_model ->> 'guid'), ''),
      model_imported_at = now(),
      model_imported_by = auth.uid(),
      updated_by = auth.uid()
  where id = p_estimate;

  -- Every line whose sheet changed: the app re-sums these through
  -- calc.ts. A line left with no rows is skipped there (its quantity is
  -- the null set above).
  select coalesce(array_agg(distinct m.line_id), '{}') into v_touched
  from estimator_estimate_line_measurements m
  join estimator_estimate_lines l on l.id = m.line_id
  where l.estimate_id = p_estimate and (m.from_model or m.line_id = any(v_had));

  return v_touched;
end $$;

-- ---------------------------------------------------------------------
-- Grants — named roles, never public alone (SECURITY.md)
-- ---------------------------------------------------------------------

revoke execute on function estimator_copy_estimate_contents(uuid, uuid, boolean) from public, anon;
revoke execute on function import_model_rows(uuid, jsonb, jsonb) from public, anon;
grant execute on function estimator_copy_estimate_contents(uuid, uuid, boolean) to authenticated;
grant execute on function import_model_rows(uuid, jsonb, jsonb) to authenticated;

-- ---------------------------------------------------------------------
-- Prove it landed
-- ---------------------------------------------------------------------

do $$
declare
  fn text;
  c text;
begin
  foreach c in array array['from_model', 'model_refs'] loop
    if not exists (
      select 1 from information_schema.columns
      where table_schema = 'public'
        and table_name = 'estimator_estimate_line_measurements' and column_name = c
    ) then
      raise exception '0118: estimator_estimate_line_measurements.% is missing', c;
    end if;
  end loop;

  foreach c in array array['model_file', 'model_guid', 'model_imported_at', 'model_imported_by'] loop
    if not exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'estimator_estimates' and column_name = c
    ) then
      raise exception '0118: estimator_estimates.% is missing', c;
    end if;
  end loop;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'estimator_work_info'
      and column_name = 'model_measure'
  ) then
    raise exception '0118: estimator_work_info.model_measure is missing';
  end if;

  foreach c in array array[
    'estimator_estimate_line_measurements_refs_from_model',
    'estimator_work_info_model_measure'
  ] loop
    if not exists (select 1 from pg_constraint where conname = c) then
      raise exception '0118: constraint % is missing', c;
    end if;
  end loop;

  -- The copy must carry the flag, or the doubling comes back.
  if position('m.from_model' in pg_get_functiondef(
       'estimator_copy_estimate_contents(uuid,uuid,boolean)'::regprocedure)) = 0 then
    raise exception '0118: estimator_copy_estimate_contents does not carry from_model';
  end if;

  foreach fn in array array[
    'estimator_copy_estimate_contents(uuid,uuid,boolean)',
    'import_model_rows(uuid,jsonb,jsonb)'
  ] loop
    if (select prosecdef from pg_proc where oid = fn::regprocedure) then
      raise exception '0118: % must be security invoker', fn;
    end if;
    if has_function_privilege('anon', fn, 'execute') then
      raise exception '0118: anon can still execute %', fn;
    end if;
    if not has_function_privilege('authenticated', fn, 'execute') then
      raise exception '0118: authenticated cannot execute %', fn;
    end if;
  end loop;

  -- RLS is still on and the measurement table still has its four
  -- policies (0096) — nothing here adds or loosens one.
  if (select count(*) from pg_policies
      where schemaname = 'public' and tablename = 'estimator_estimate_line_measurements') <> 4 then
    raise exception '0118: estimator_estimate_line_measurements should still have 4 policies';
  end if;
end $$;
