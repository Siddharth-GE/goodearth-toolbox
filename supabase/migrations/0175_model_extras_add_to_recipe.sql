-- 0175 — The model's extras add to a work's recipe; its mixes and steel replace it (plan.md, From the model, piece 3)
--
-- Plot 04 compared with Goodearth QS's own estimate: ridge tiles, window grills and stair teak come from the project
-- settings on top of the work's recipe (PF.03.09 keeps its Mangalore tiles), while a painted mix or the steel says what
-- the work is made of instead of the recipe. 0174 stored no difference, so every model material replaced the recipe.
--
-- 1. estimator_estimate_line_model_materials.adds_to_recipe.
-- 2. import_model_takeoff reads it from p_materials (absent is false: an app before this one replaces, as 0174 did).
-- 3. estimator_copy_estimate_contents carries it.

-- 1 ------------------------------------------------------------------------------------------------------
alter table estimator_estimate_line_model_materials
  add column if not exists adds_to_recipe boolean not null default false;
-- One mix may arrive both ways on a work (stair concrete painted, and from the settings): one row per way.
alter table estimator_estimate_line_model_materials
  drop constraint if exists estimator_estimate_line_model_materials_line_id_mix_id_key;
create unique index if not exists estimator_estimate_line_model_materials_line_mix_way
  on estimator_estimate_line_model_materials (line_id, mix_id, adds_to_recipe);

-- 2 ------------------------------------------------------------------------------------------------------
create or replace function import_model_takeoff(
  p_estimate uuid, p_lines jsonb, p_model jsonb, p_materials jsonb, p_other_costs jsonb
)
returns uuid[]
language plpgsql
set search_path to 'public'
as $$
declare
  v_touched uuid[];
  v_prior uuid[];
  v_unit text;
begin
  if jsonb_typeof(p_materials) is distinct from 'array' or jsonb_typeof(p_other_costs) is distinct from 'array' then
    raise exception 'The takeoff''s materials or other costs are missing';
  end if;
  if exists (
    select 1 from jsonb_to_recordset(p_materials) as m(mix_name text)
    where length(btrim(coalesce(m.mix_name, ''))) not between 1 and 120
  ) or (select count(distinct lower(btrim(m.mix_name))) from jsonb_to_recordset(p_materials) as m(mix_name text)) > 2000
  then
    raise exception 'The takeoff names a mix with no name, one longer than 120 letters, or more mixes than any villa has';
  end if;

  -- Locked before the first read; import_model_rows locks it again, harmlessly.
  perform 1 from estimator_estimates where id = p_estimate for update;

  -- The rows the model measured, or gave materials to, before this send: a work it sends no rows for this time keeps
  -- its materials on the same row (import_model_rows' choice).
  select coalesce(array_agg(distinct l.id), '{}') into v_prior
  from estimator_estimate_lines l
  where l.estimate_id = p_estimate
    and (exists (select 1 from estimator_estimate_line_measurements h where h.line_id = l.id and h.from_model)
         or exists (select 1 from estimator_estimate_line_model_materials mm where mm.line_id = l.id));

  -- Locks the estimate, refuses anything but the villa's working one, and lays the model's rows.
  v_touched := import_model_rows(p_estimate, p_lines, p_model);

  -- A new mix takes the toolbox's own spelling of its unit; a unit the toolbox doesn't know is refused by name.
  select btrim(m.mix_uom) into v_unit
  from jsonb_to_recordset(p_materials) as m(mix_name text, mix_uom text)
  where not exists (select 1 from estimator_mixes x where lower(x.name) = lower(btrim(m.mix_name)))
    and not exists (select 1 from uoms u where lower(u.name) = lower(btrim(m.mix_uom)))
  limit 1;
  if found then
    raise exception 'SketchUp sent a mix in "%", a unit the toolbox doesn''t have — add it in Masters, or fix the unit in SketchUp',
      coalesce(v_unit, 'no unit');
  end if;

  -- A mix the toolbox lacks is made, empty, under From SketchUp; one it has is never changed.
  insert into estimator_mixes (name, uom, group_name, description, created_by, updated_by)
  select distinct on (lower(btrim(m.mix_name)))
         btrim(m.mix_name), u.name, 'From SketchUp',
         'Made by a SketchUp import — add what one unit of it uses.', auth.uid(), auth.uid()
  from jsonb_to_recordset(p_materials) as m(mix_name text, mix_uom text)
  join uoms u on lower(u.name) = lower(btrim(m.mix_uom))
  where not exists (select 1 from estimator_mixes x where lower(x.name) = lower(btrim(m.mix_name)))
  order by lower(btrim(m.mix_name)), u.name
  on conflict ((lower(name))) do nothing;

  if exists (
    select 1
    from jsonb_to_recordset(p_materials) as m(work_item_id uuid, mix_name text, mix_uom text, qty numeric)
    where m.qty is null or m.qty <= 0 or m.qty >= 'Infinity'
       or not exists (
         select 1 from estimator_mixes x
         where lower(x.name) = lower(btrim(m.mix_name)) and lower(btrim(x.uom)) = lower(btrim(m.mix_uom))
       )
       or not exists (
         select 1 from estimator_estimate_lines f
         where f.estimate_id = p_estimate and f.work_item_id = m.work_item_id
       )
  ) then
    raise exception 'The rate book or the estimate changed while the model was importing — press Import again';
  end if;

  -- The model's materials from the last import go. The new ones land on the row the model's rows went to, else the
  -- row that held them before, else the work's first unlabelled row, else its first.
  delete from estimator_estimate_line_model_materials mm
  using estimator_estimate_lines l
  where l.id = mm.line_id and l.estimate_id = p_estimate;

  insert into estimator_estimate_line_model_materials (line_id, mix_id, qty, adds_to_recipe, created_by, updated_by)
  select r.id, x.id, sum(m.qty), coalesce(m.adds_to_recipe, false), auth.uid(), auth.uid()
  from jsonb_to_recordset(p_materials)
         as m(work_item_id uuid, mix_name text, mix_uom text, qty numeric, adds_to_recipe boolean)
  join estimator_mixes x on lower(x.name) = lower(btrim(m.mix_name))
  join lateral (
    select f.id from estimator_estimate_lines f
     where f.estimate_id = p_estimate and f.work_item_id = m.work_item_id
     order by exists (select 1 from estimator_estimate_line_measurements h
                      where h.line_id = f.id and h.from_model) desc,
              (f.id = any(v_prior)) desc,
              (f.label is not null), f.created_at, f.id
     limit 1
  ) r on true
  group by r.id, x.id, coalesce(m.adds_to_recipe, false);

  -- The model's other costs are replaced; typed ones stay.
  delete from estimator_estimate_other_costs where estimate_id = p_estimate and from_model;
  insert into estimator_estimate_other_costs
    (estimate_id, from_model, code, name, unit, qty, rate, note, position, created_by, updated_by)
  select p_estimate, true, nullif(btrim(c.code), ''), btrim(c.name), nullif(btrim(c.unit), ''), c.qty, c.rate,
         nullif(btrim(c.note), ''), e.ord::int, auth.uid(), auth.uid()
  from jsonb_array_elements(p_other_costs) with ordinality as e(row, ord)
  cross join lateral jsonb_to_record(e.row) as c(code text, name text, unit text, qty numeric, rate numeric, note text);

  update estimator_estimates
  set model_settings = case when jsonb_typeof(p_model -> 'settings') = 'object' then p_model -> 'settings' end,
      model_bua_sqft = case when jsonb_typeof(p_model -> 'bua_sqft') = 'number'
                             and (p_model ->> 'bua_sqft')::numeric > 0
                            then (p_model ->> 'bua_sqft')::numeric end,
      updated_by = auth.uid()
  where id = p_estimate;

  return v_touched;
end $$;

revoke execute on function import_model_takeoff(uuid, jsonb, jsonb, jsonb, jsonb) from public, anon;
grant execute on function import_model_takeoff(uuid, jsonb, jsonb, jsonb, jsonb) to authenticated;

-- 3 ------------------------------------------------------------------------------------------------------
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

  insert into estimator_estimate_line_model_materials (line_id, mix_id, qty, adds_to_recipe, created_by, updated_by)
  select t.id, mm.mix_id, mm.qty, mm.adds_to_recipe, auth.uid(), auth.uid()
  from estimator_estimate_line_model_materials mm
  join estimator_estimate_lines s on s.id = mm.line_id and s.estimate_id = p_from
  join estimator_estimate_lines t on t.estimate_id = p_to and t.copied_from = s.id;

  insert into estimator_estimate_other_costs
    (estimate_id, from_model, code, name, unit, qty, rate, note, position, created_by, updated_by)
  select p_to, o.from_model, o.code, o.name, o.unit, o.qty, o.rate, o.note, o.position, auth.uid(), auth.uid()
  from estimator_estimate_other_costs o
  where o.estimate_id = p_from;

  update estimator_estimates t
  set use_model_materials = s.use_model_materials,
      model_settings = s.model_settings,
      model_bua_sqft = s.model_bua_sqft
  from estimator_estimates s
  where s.id = p_from and t.id = p_to;
end $$;

-- Checks ---------------------------------------------------------------------------------------------------
do $$
begin
  if position('adds_to_recipe' in pg_get_functiondef('import_model_takeoff(uuid,jsonb,jsonb,jsonb,jsonb)'::regprocedure)) = 0
     or position('adds_to_recipe' in
                 pg_get_functiondef('estimator_copy_estimate_contents(uuid,uuid,boolean)'::regprocedure)) = 0 then
    raise exception '0175: the import or the copy drops adds_to_recipe';
  end if;
  if (select prosecdef from pg_proc where oid = 'import_model_takeoff(uuid,jsonb,jsonb,jsonb,jsonb)'::regprocedure)
     or (select prosecdef from pg_proc where oid = 'estimator_copy_estimate_contents(uuid,uuid,boolean)'::regprocedure) then
    raise exception '0175: an estimator function became a definer';
  end if;
  if has_function_privilege('anon', 'import_model_takeoff(uuid,jsonb,jsonb,jsonb,jsonb)', 'execute') then
    raise exception '0175: import_model_takeoff is granted to anon';
  end if;
  if exists (select 1 from pg_constraint where conname = 'estimator_estimate_line_model_materials_line_id_mix_id_key') then
    raise exception '0175: one mix per row is still enforced';
  end if;
end $$;
