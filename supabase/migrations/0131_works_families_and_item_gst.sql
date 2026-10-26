-- 0131 — Works families and a GST % on items (plan.md, OS process updates, Wave 1).
--
-- The new masters workbook lists works for the whole estate, not only villas:
-- site mobilisation, infrastructure (civil and MEP), the buildings and
-- maintenance. A category says which of the five it belongs to, so pickers
-- and Masters can group by it. Existing categories are the villas' works.
--
-- items.gst_pct is entered by hand in Masters (founder, 2026-10-22); a PO line
-- offers it first. Null means nobody has entered it. No FK to gst_rates: a PO
-- line copies the number the same way (0021 §2).

alter table work_categories add column if not exists family text;

update work_categories set family = 'Buildings' where family is null;

alter table work_categories alter column family set default 'Buildings';
alter table work_categories alter column family set not null;

alter table work_categories drop constraint if exists work_categories_family_known;
alter table work_categories add constraint work_categories_family_known
  check (family in ('Site Mobilisation', 'Infrastructure - Civil', 'Infrastructure - MEP',
                    'Buildings', 'Maintenance'));

alter table items add column if not exists gst_pct numeric;

alter table items drop constraint if exists items_gst_pct_range;
alter table items add constraint items_gst_pct_range
  check (gst_pct is null or (gst_pct >= 0 and gst_pct <= 100));

do $$
begin
  if exists (select 1 from work_categories where family is null) then
    raise exception '0131: every work category needs a family';
  end if;
  if not exists (select 1 from information_schema.columns
                 where table_name = 'items' and column_name = 'gst_pct') then
    raise exception '0131: items.gst_pct is missing';
  end if;
end $$;
