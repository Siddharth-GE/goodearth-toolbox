-- 0157 — A work may sit on an estimate more than once (plan.md, the team's additions, C): "Shutter – W1 1.2×1.5"
-- and "Shutter – W2 0.9×1.2" each with its own label, mix or materials, labour rate and quantity.
--
-- 1. estimator_estimate_lines loses unique (estimate_id, work_item_id) and gains label and copied_from. copied_from is
--    the row a copy was made from, so a copy's materials, measurements and frozen cost find their own row rather than
--    "the row of that work". A plain uuid, no foreign key: a working row is deleted while the official copy stays,
--    and an ON DELETE SET NULL would try to change a frozen row, which the draft-only guard refuses.
-- 2. estimator_copy_estimate_contents and make_estimate_official pair rows by copied_from; p_costs carries each
--    working row's line_id. The takeoff stays one row per work and material, so every reader downstream is unchanged.
-- 3. import_model_rows adds a work the estimate lacks, and measures the row it measured before, else a work's first
--    unlabelled row, else its first.
-- 4. estimate_work_facts sums a work's rows: one row per work, as Supervisors reads it.

-- 1 ------------------------------------------------------------------------------------------------------
alter table estimator_estimate_lines add column if not exists label text;
alter table estimator_estimate_lines add column if not exists copied_from uuid;
alter table estimator_estimate_lines drop constraint if exists estimator_estimate_lines_label_check;
alter table estimator_estimate_lines add constraint estimator_estimate_lines_label_check
  check (label is null or length(trim(label)) between 1 and 120);
alter table estimator_estimate_lines drop constraint if exists estimator_estimate_lines_estimate_id_work_item_id_key;
create index if not exists estimator_estimate_lines_estimate_work on estimator_estimate_lines (estimate_id, work_item_id);
create index if not exists estimator_estimate_lines_copied_from on estimator_estimate_lines (copied_from)
  where copied_from is not null;

-- 2 ------------------------------------------------------------------------------------------------------
create or replace function estimator_copy_estimate_contents(p_from uuid, p_to uuid, p_everything boolean)
returns void
language plpgsql
set search_path to 'public'
as $$
begin
  -- created_at is carried over so a work's rows keep their order in the copy.
  insert into estimator_estimate_lines
    (estimate_id, work_item_id, label, qty, note, labour_rate, copied_from, created_at, created_by, updated_by)
  select p_to, l.work_item_id, l.label,
         case when p_everything then l.qty end,
         l.note,
         case when p_everything then l.labour_rate end,
         l.id,
         l.created_at,
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
  join estimator_estimate_lines t on t.estimate_id = p_to and t.copied_from = s.id;

  insert into estimator_estimate_line_measurements
    (line_id, description, nos, length, breadth, depth, sort_order, from_model, model_refs,
     is_deduction, created_by, updated_by)
  select t.id, m.description, m.nos, m.length, m.breadth, m.depth, m.sort_order,
         m.from_model, m.model_refs, m.is_deduction, auth.uid(), auth.uid()
  from estimator_estimate_line_measurements m
  join estimator_estimate_lines s on s.id = m.line_id and s.estimate_id = p_from
  join estimator_estimate_lines t on t.estimate_id = p_to and t.copied_from = s.id;

  insert into estimator_estimate_item_rates
    (estimate_id, item_id, material_id, rate, note, created_by, updated_by)
  select p_to, r.item_id, r.material_id, r.rate, r.note, auth.uid(), auth.uid()
  from estimator_estimate_item_rates r
  where r.estimate_id = p_from;
end $$;

create or replace function make_estimate_official(p_working uuid, p_costs jsonb, p_takeoff jsonb)
returns text
language plpgsql
set search_path to 'public'
as $$
declare
  v_working estimator_estimates%rowtype;
  v_new uuid;
  v_missing text;
  v_lines int;
begin
  select * into v_working
  from estimator_estimates
  where id = p_working
  for update;

  if not found then
    raise exception 'That estimate no longer exists';
  end if;
  if not v_working.is_working then
    raise exception 'Only a villa''s working estimate can be made official';
  end if;

  select count(*) into v_lines from estimator_estimate_lines where estimate_id = p_working;
  if v_lines = 0 then
    raise exception 'Add at least one work before making this estimate official';
  end if;

  select string_agg(w.code || ' ' || coalesce(l.label, w.name), ', ' order by w.code, l.label) into v_missing
  from estimator_estimate_lines l
  join work_items w on w.id = l.work_item_id
  where l.estimate_id = p_working and l.qty is null;
  if v_missing is not null then
    raise exception 'Still to measure: % — measure them, or take them off, first', v_missing;
  end if;

  insert into estimator_estimates
    (project_id, unit_id, is_template, is_working, name, note, created_by, updated_by)
  values
    (v_working.project_id, v_working.unit_id, false, false,
     v_working.name, v_working.note, auth.uid(), auth.uid())
  returning id into v_new;

  perform estimator_copy_estimate_contents(p_working, v_new, true);

  -- Each cost row names the working row it priced; the copy of that row takes it. A cost row naming only its work
  -- (the app before 0157, between this migration and its deploy) still lands, while a work has one row.
  insert into estimator_estimate_line_costs
    (estimate_id, line_id, work_item_id, qty, uom, labour_rate,
     labour_cost, material_cost, total_cost, created_by, updated_by)
  select v_new, l.id, l.work_item_id, c.qty, c.uom, c.labour_rate,
         c.labour_cost, c.material_cost, c.total_cost, auth.uid(), auth.uid()
  from jsonb_to_recordset(p_costs) as c(
    line_id uuid, work_item_id uuid, qty numeric, uom text, labour_rate numeric,
    labour_cost numeric, material_cost numeric, total_cost numeric
  )
  join estimator_estimate_lines l
    on l.estimate_id = v_new
   and (l.copied_from = c.line_id or (c.line_id is null and l.work_item_id = c.work_item_id));

  -- The snapshot must describe exactly what was copied: one cost row per
  -- line, at the line's own quantity. Anything else means the estimate
  -- changed while the app was computing — refuse rather than freeze it.
  if jsonb_array_length(p_costs) <> v_lines
     or exists (
       select 1
       from estimator_estimate_lines l
       left join estimator_estimate_line_costs c on c.line_id = l.id
       where l.estimate_id = v_new and (c.id is null or c.qty <> l.qty)
     ) then
    raise exception 'The estimate changed while it was being made official — try again';
  end if;

  insert into estimator_estimate_takeoff
    (estimate_id, work_item_id, item_id, material_name, uom, quantity, rate,
     created_by, updated_by)
  select v_new, t.work_item_id, t.item_id, t.material_name, t.uom, t.quantity, t.rate,
         auth.uid(), auth.uid()
  from jsonb_to_recordset(p_takeoff) as t(
    work_item_id uuid, item_id uuid, material_name text, uom text,
    quantity numeric, rate numeric
  );

  if exists (
    select 1 from estimator_estimate_takeoff t
    where t.estimate_id = v_new
      and not exists (
        select 1 from estimator_estimate_lines l
        where l.estimate_id = v_new and l.work_item_id = t.work_item_id
      )
  ) then
    raise exception 'The estimate changed while it was being made official — try again';
  end if;

  -- Mints EST/<code>/NNN, supersedes the villa's previous official and
  -- freezes this one (0077).
  return submit_estimate(v_new);
end $$;

-- 3 ------------------------------------------------------------------------------------------------------
create or replace function import_model_rows(p_estimate uuid, p_lines jsonb, p_model jsonb)
returns uuid[]
language plpgsql
set search_path to 'public'
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
    and not exists (
      select 1 from estimator_estimate_lines l
      where l.estimate_id = p_estimate and l.work_item_id = x.work_item_id
    );

  -- The model's rows from the last import go; hand rows stay.
  select coalesce(array_agg(distinct m.line_id), '{}') into v_had
  from estimator_estimate_line_measurements m
  join estimator_estimate_lines l on l.id = m.line_id
  where l.estimate_id = p_estimate and m.from_model;

  delete from estimator_estimate_line_measurements m
  using estimator_estimate_lines l
  where l.id = m.line_id and l.estimate_id = p_estimate and m.from_model;

  -- The new rows, in the model's order, after the line's hand rows: on the row the model measured last time, else the
  -- work's first unlabelled row, else its first.
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
  join lateral (
    select f.id from estimator_estimate_lines f
     where f.estimate_id = p_estimate and f.work_item_id = x.work_item_id
     order by (f.id = any(v_had)) desc, (f.label is not null), f.created_at, f.id
     limit 1
  ) l on true
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

-- 4 ------------------------------------------------------------------------------------------------------
create or replace view estimate_work_facts with (security_barrier = true) as
select e.id as estimate_id,
       e.unit_id,
       l.work_item_id,
       sum(l.qty) as quantity,
       wi.uom
  from estimator_estimate_lines l
  join estimator_estimates e on e.id = l.estimate_id
  left join estimator_work_info wi on wi.work_item_id = l.work_item_id
 where e.status = 'submitted'
   and (has_app('/estimator') or has_app('/indents') or has_app('/inventory') or has_app('/supervisors'))
 group by e.id, e.unit_id, l.work_item_id, wi.uom;

revoke all on estimate_work_facts from public, anon;
revoke insert, update, delete, truncate on estimate_work_facts from anon, authenticated;
grant select on estimate_work_facts to authenticated;

-- Checks ---------------------------------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_constraint where conname = 'estimator_estimate_lines_estimate_id_work_item_id_key') then
    raise exception '0157: one row per work is still enforced';
  end if;
  if position('copied_from' in pg_get_functiondef('estimator_copy_estimate_contents(uuid,uuid,boolean)'::regprocedure)) = 0
     or position('copied_from' in pg_get_functiondef('make_estimate_official(uuid,jsonb,jsonb)'::regprocedure)) = 0 then
    raise exception '0157: a copy still pairs rows by work';
  end if;
  if (select prosecdef from pg_proc where oid = 'estimator_copy_estimate_contents(uuid,uuid,boolean)'::regprocedure)
     or (select prosecdef from pg_proc where oid = 'make_estimate_official(uuid,jsonb,jsonb)'::regprocedure)
     or (select prosecdef from pg_proc where oid = 'import_model_rows(uuid,jsonb,jsonb)'::regprocedure) then
    raise exception '0157: an estimator function became a definer';
  end if;
  if has_table_privilege('anon', 'estimate_work_facts', 'select')
     or has_table_privilege('authenticated', 'estimate_work_facts', 'insert') then
    raise exception '0157: estimate_work_facts grants too much';
  end if;
  if not exists (select 1 from pg_class where relname = 'estimator_estimate_lines' and relrowsecurity) then
    raise exception '0157: estimator_estimate_lines has RLS off';
  end if;
end $$;
