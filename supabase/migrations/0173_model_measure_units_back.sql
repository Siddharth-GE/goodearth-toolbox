-- 0173 — Four works back in their own units, measured the rate book's way
--
-- 0172 moved FD.03.04, FD.03.05, FD.04.13 and SS.03.02 to sqft, but the rate
-- book prices them per cum (footing ₹6,000, column to plinth ₹16,000) and per
-- house (anti-termite ₹450): their rates would read per sqft. The founder
-- settled on 2026-10-29: back to their units; the model measures the footing
-- and the column by the concrete's volume; the plinth beam's casting and the
-- anti-termite stay by hand. F.03.02A stays in sqft (₹3.50 a sqft of paint).
-- As in 0172, a work already on an estimate keeps its unit and is named.

do $$
declare
  fix record;
  used int;
begin
  for fix in
    select * from (values
      ('FD.03.04', 'cum', 'volume'),
      ('FD.03.05', 'cum', 'volume'),
      ('FD.04.13', 'each', 'manual'),
      ('SS.03.02', 'each', 'manual')
    ) as f(code, uom, measure)
  loop
    select count(*) into used
    from estimator_estimate_lines l
    join work_items w on w.id = l.work_item_id
    where w.code = fix.code;

    if used > 0 then
      raise notice '0173: % stays as it is, % estimate line(s) use it', fix.code, used;
    else
      update estimator_work_info i
      set uom = fix.uom, model_measure = fix.measure
      from work_items w
      where w.id = i.work_item_id and w.code = fix.code
        and (i.uom is distinct from fix.uom or i.model_measure is distinct from fix.measure);
    end if;
  end loop;
end $$;

do $$
begin
  if exists (
    select 1 from estimator_work_info i
    join work_items w on w.id = i.work_item_id
    where w.code in ('FD.03.04', 'FD.03.05')
      and i.uom = 'sqft'
      and not exists (select 1 from estimator_estimate_lines l where l.work_item_id = w.id)
  ) then
    raise exception '0173: a footing or column work is still in sqft';
  end if;
end $$;
