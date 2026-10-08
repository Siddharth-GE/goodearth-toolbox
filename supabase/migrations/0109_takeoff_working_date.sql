-- 0109 — When the villa's working estimate last changed, beside the official
--
-- plan.md A1, approved by Fable review #1 (2026-10-08): "A date is not
-- money. Redefine the view carrying its column list and WHERE forward."
--
-- WHY. Indents pulls from the villa's OFFICIAL estimate only — the frozen
-- copy made by "Make official" (0098). A QS who measures Footing on the
-- WORKING estimate and never makes it official sees it in the Estimator
-- while Indents shows nothing for Footing ("only cement appears"). The
-- indent screen already says which official copy it reads and when it
-- was made; with this date it can also say "the working estimate has
-- changed since — ask the QS to make it official again".
--
-- WHAT. estimate_takeoff_facts gains one column, working_updated_at: the
-- newest write to the villa's working estimate (is_working, 0098) — its
-- header, its lines, their measurements and their components, each of
-- which carries updated_at (set on insert too). Null when the villa has
-- no working estimate. A line DELETED from the working estimate leaves no
-- date behind, so a deletion alone does not move it; a measured or added
-- line does, which is the case the notice exists for.
--
-- "Make official" only reads the working estimate (0098), and everything
-- it writes shares the transaction's now() with submitted_at — so making
-- an estimate official never makes its own notice appear.
--
-- Everything else is carried forward from 0086 exactly: the columns in
-- order (the new one last — CREATE OR REPLACE VIEW can only append), the
-- security barrier, the four-grant WHERE, and the revokes. No rate, no
-- cost: the money stays behind /estimator.
--
-- Re-runnable.

create or replace view estimate_takeoff_facts with (security_barrier) as
select
  e.id as estimate_id,
  e.project_id,
  e.unit_id,
  e.reference,
  e.submitted_at,
  t.work_item_id,
  t.material_id,
  t.material_name,
  t.uom,
  t.quantity,
  coalesce(t.item_id, m.item_id) as item_id,
  case when t.item_id is not null then null else m.item_uom_factor end as item_uom_factor,
  wk.working_updated_at
from estimator_estimate_takeoff t
join estimator_estimates e on e.id = t.estimate_id
left join estimator_materials m on m.id = t.material_id
left join lateral (
  select greatest(
    w.updated_at,
    (select max(l.updated_at) from estimator_estimate_lines l where l.estimate_id = w.id),
    (select max(lm.updated_at)
       from estimator_estimate_line_measurements lm
       join estimator_estimate_lines l on l.id = lm.line_id
      where l.estimate_id = w.id),
    (select max(lc.updated_at)
       from estimator_estimate_line_components lc
       join estimator_estimate_lines l on l.id = lc.line_id
      where l.estimate_id = w.id)
  ) as working_updated_at
  from estimator_estimates w
  where w.unit_id = e.unit_id and w.is_working
) wk on true
where e.status = 'submitted'
  and (
    has_app('/estimator') or has_app('/indents')
    or has_app('/inventory') or has_app('/supervisors')
  );

-- CREATE OR REPLACE keeps the grants, but they are restated so this file
-- alone says what the view allows (0086's three lines, unchanged).
revoke all on estimate_takeoff_facts from public, anon;
revoke insert, update, delete, truncate on estimate_takeoff_facts from anon, authenticated;
grant select on estimate_takeoff_facts to authenticated;

-- ---------------------------------------------------------------------
-- Prove it
-- ---------------------------------------------------------------------

do $$
declare
  def text := pg_get_viewdef('estimate_takeoff_facts'::regclass);
begin
  if not exists (select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'estimate_takeoff_facts'
      and column_name = 'working_updated_at') then
    raise exception '0109: estimate_takeoff_facts.working_updated_at is missing';
  end if;

  if def not ilike '%has_app(''/estimator''::text)%'
    or def not ilike '%has_app(''/indents''::text)%'
    or def not ilike '%has_app(''/inventory''::text)%'
    or def not ilike '%has_app(''/supervisors''::text)%' then
    raise exception '0109: the four-grant WHERE was not carried forward';
  end if;

  if def not ilike '%coalesce(t.item_id, m.item_id)%' then
    raise exception '0109: the 0086 item bridge was not carried forward';
  end if;

  if exists (select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'estimate_takeoff_facts'
      and (column_name ilike '%rate%' or column_name ilike '%cost%'
        or column_name ilike '%amount%' or column_name ilike '%price%')) then
    raise exception '0109: a money column reached estimate_takeoff_facts';
  end if;

  if not exists (select 1 from pg_class
    where relname = 'estimate_takeoff_facts'
      and 'security_barrier=true' = any(coalesce(reloptions, '{}'))) then
    raise exception '0109: estimate_takeoff_facts lost its security barrier';
  end if;

  if has_table_privilege('authenticated', 'estimate_takeoff_facts', 'insert')
    or has_table_privilege('authenticated', 'estimate_takeoff_facts', 'update')
    or has_table_privilege('authenticated', 'estimate_takeoff_facts', 'delete')
    or has_table_privilege('anon', 'estimate_takeoff_facts', 'select') then
    raise exception '0109: estimate_takeoff_facts grants are wrong';
  end if;
end $$;
