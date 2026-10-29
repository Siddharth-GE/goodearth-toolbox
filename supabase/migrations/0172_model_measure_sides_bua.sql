-- 0172 — How the SketchUp model measures a work: two more ways, and the rate book's units that fit them
--
-- Goodearth QS 0.7–0.9 measures two things 0118 did not know:
--   sides — every face but top and bottom: a plinth beam's or a column's shuttering;
--   bua   — the built-up area, from the sheet painted over each floor: the
--           Superstructure and MEP package works, priced per sqft of it.
-- The founder settled on 2026-10-29 (plan.md, From the model, everything):
-- FD.03.05 (column up to plinth) and FD.04.13 (plinth beam and DPC casting)
-- are their shuttering, and five works whose unit can't hold what the model
-- measures move to sqft. A unit never changes under an estimate line
-- (estimator/PLAN.md decision 7), so a work already on one keeps its unit
-- and this says so rather than failing.

-- ---------------------------------------------------------------------
-- 1. The two new measures
-- ---------------------------------------------------------------------

alter table estimator_work_info drop constraint if exists estimator_work_info_model_measure;
alter table estimator_work_info
  add constraint estimator_work_info_model_measure
  check (model_measure in ('volume', 'area', 'base_and_sides', 'sides', 'bua', 'length', 'count', 'manual'));

comment on column estimator_work_info.model_measure is
  'How the SketchUp model measures this work (0118, 0172): volume, area, base_and_sides (a footing''s shuttering), sides (every face but top and bottom), bua (the built-up area, for package works), length, count, or manual (measured by hand on the estimate). Null = from the unit.';

-- ---------------------------------------------------------------------
-- 2. Units that fit the measure, where no estimate uses the work yet
-- ---------------------------------------------------------------------

do $$
declare
  fix record;
  used int;
begin
  for fix in
    select * from (values
      ('FD.03.04', 'sqft'),  -- footing: base and four sides
      ('FD.03.05', 'sqft'),  -- column up to plinth: its sides
      ('FD.04.13', 'sqft'),  -- plinth beam and DPC casting: its sides
      ('SS.03.02', 'sqft'),  -- anti-termite: the ground floor's built-up area
      ('F.03.02A', 'sqft')   -- final coat of interior paint: the painted faces
    ) as f(code, uom)
  loop
    select count(*) into used
    from estimator_estimate_lines l
    join work_items w on w.id = l.work_item_id
    where w.code = fix.code;

    if used > 0 then
      raise notice '0172: % stays in its unit, % estimate line(s) use it', fix.code, used;
    else
      update estimator_work_info i
      set uom = fix.uom
      from work_items w
      where w.id = i.work_item_id and w.code = fix.code and i.uom is distinct from fix.uom;
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 3. The measures, where the rate book left them blank or by hand
-- ---------------------------------------------------------------------

update estimator_work_info i
set model_measure = 'sides'
from work_items w
where w.id = i.work_item_id
  and w.code in ('FD.03.05', 'FD.04.13')
  and i.uom = 'sqft'
  and (i.model_measure is null or i.model_measure = 'manual');

-- The package works: a share of the package rate per sqft of built-up area.
update estimator_work_info i
set model_measure = 'bua'
from work_items w
join work_categories c on c.id = w.category_id
where w.id = i.work_item_id
  and c.code in ('SS', 'MEP')
  and i.uom = 'sqft'
  and w.name ilike '%package per sqft%'
  and (i.model_measure is null or i.model_measure = 'manual');

-- ---------------------------------------------------------------------
-- 4. Assert what this claimed
-- ---------------------------------------------------------------------

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'estimator_work_info_model_measure'
      and pg_get_constraintdef(oid) like '%''sides''%'
      and pg_get_constraintdef(oid) like '%''bua''%'
  ) then
    raise exception '0172: the model_measure check does not allow sides and bua';
  end if;

  if exists (
    select 1 from estimator_work_info i
    join work_items w on w.id = i.work_item_id
    join work_categories c on c.id = w.category_id
    where c.code in ('SS', 'MEP') and i.uom = 'sqft'
      and w.name ilike '%package per sqft%'
      and (i.model_measure is null or i.model_measure = 'manual')
  ) then
    raise exception '0172: a package work is still measured by hand';
  end if;
end $$;
