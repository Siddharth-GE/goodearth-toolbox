-- 0128 — Marathon and the construction budgets are gone (founder, 2026-10-18:
-- "remove the marathon, construction things happen in estimate indent po.
-- only interiors happens in selection and budget"). Their code went first.
--
-- Back up before applying: the tables' rows were written to data/backups
-- (…-before-0128-drop-marathon-construction) on staging; do the same on any
-- other database first.
--
-- indent_lines.construction_line_id stays, emptied of meaning: indents_guard
-- and decide_indent_line still name it, and rewriting the indent chain's
-- guards to drop an always-empty column is not worth the risk. A CHECK keeps
-- it empty from now on.

-- The construction budgets ----------------------------------------------

do $$
begin
  if exists (select 1 from indent_lines where construction_line_id is not null) then
    raise exception '0128: indent lines still point at a construction budget line';
  end if;
end $$;

alter table indent_lines drop constraint if exists indent_lines_construction_line_id_fkey;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'indent_lines_construction_retired') then
    alter table indent_lines
      add constraint indent_lines_construction_retired check (construction_line_id is null);
  end if;
end $$;

drop table if exists construction_budget_lines;
drop table if exists construction_budgets;

-- Marathon ----------------------------------------------------------------

drop function if exists marathon_create_entry(uuid, uuid, uuid, text, text, integer, text, text);
drop function if exists marathon_run_counts();

drop table if exists marathon_entries;
drop table if exists marathon_pin_attempts;
drop table if exists marathon_agents;
drop table if exists marathon_groups;
drop table if exists marathon_categories;
drop table if exists marathon_runs;
drop table if exists marathon_config;

-- What it claimed --------------------------------------------------------

do $$
begin
  if exists (
    select 1 from pg_tables
     where schemaname = 'public'
       and (tablename like 'marathon%' or tablename like 'construction_budget%')
  ) then
    raise exception '0128: a Marathon or construction budget table is still there';
  end if;
  if exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname like 'marathon%'
  ) then
    raise exception '0128: a Marathon function is still there';
  end if;
  if not exists (select 1 from pg_constraint where conname = 'indent_lines_construction_retired') then
    raise exception '0128: construction_line_id is not locked to empty';
  end if;
end $$;
