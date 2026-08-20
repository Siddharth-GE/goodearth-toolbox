-- 0086 — Materials ARE the items master (Phase 2, G3)
--
-- FOUNDER, 2026-08-20, later the same day as 0085: "i think we dont
-- even need a materials tab in estimator, just mixes — all materials
-- are exactly the same as in the items master; mixes are a combination
-- of some items, else a work will just have those items."
--
-- Two decisions taken with it (AskUserQuestion):
--   * The RATE is the item's indicative_price, edited in Masters —
--     as visible as item prices already are. The estimate's computed
--     totals stay /estimator-gated as before.
--   * ONE unit language: recipe quantities are in the item's own
--     default_uom (sand in cft, not cum). No conversion factors for
--     anything authored from today.
--
-- So mix components and work-recipe components now reference ITEMS
-- directly, and the submit snapshot freezes the item id. The
-- estimator_materials table STAYS forever (additive-only) as the
-- legacy layer: components and frozen takeoff rows from before today
-- keep meaning what they meant, resolved through it. Both databases
-- were surveyed before this was written: production has ZERO estimator
-- rows; staging has two practice components whose units differ from
-- their items with no factor entered — those cannot be converted
-- honestly, so the conversion below moves what it can and the code
-- keeps a legacy branch for the rest. Nothing is guessed.
--
-- Re-runnable throughout: the conversion nulls material_id as it
-- moves a row, so a second run matches nothing.

-- ---------------------------------------------------------------------
-- 1. Mix components: a mix is a combination of items
-- ---------------------------------------------------------------------

alter table estimator_mix_components alter column material_id drop not null;
alter table estimator_mix_components
  add column if not exists item_id uuid references items (id);

-- The no-duplicates rule, item side (the 0074 partial-index shape).
create unique index if not exists estimator_mix_components_item_key
  on estimator_mix_components (mix_id, item_id) where item_id is not null;
create index if not exists estimator_mix_components_item_idx
  on estimator_mix_components (item_id) where item_id is not null;

-- Convert what can be converted honestly: equal units carry over as
-- they are; a person-entered factor converts (1 material-uom = factor
-- item-uom, so the quantity multiplies). Different units with no
-- factor stay on material_id — the legacy branch.
update estimator_mix_components c
set
  item_id = m.item_id,
  qty_per_unit = case
    when lower(trim(m.uom)) = lower(trim(i.default_uom)) then c.qty_per_unit
    else c.qty_per_unit * m.item_uom_factor
  end,
  material_id = null
from estimator_materials m
join items i on i.id = m.item_id
where c.material_id = m.id
  and m.item_id is not null
  and (
    lower(trim(m.uom)) = lower(trim(i.default_uom))
    or m.item_uom_factor is not null
  );

alter table estimator_mix_components
  drop constraint if exists estimator_mix_components_one_source;
alter table estimator_mix_components
  add constraint estimator_mix_components_one_source
  check ((material_id is null) <> (item_id is null));

-- ---------------------------------------------------------------------
-- 2. Work components: an item, a mix, or a legacy material
-- ---------------------------------------------------------------------

alter table estimator_work_components
  add column if not exists item_id uuid references items (id);

create unique index if not exists estimator_work_components_item_key
  on estimator_work_components (work_item_id, item_id) where item_id is not null;
create index if not exists estimator_work_components_item_idx
  on estimator_work_components (item_id) where item_id is not null;

update estimator_work_components c
set
  item_id = m.item_id,
  qty_per_unit = case
    when lower(trim(m.uom)) = lower(trim(i.default_uom)) then c.qty_per_unit
    else c.qty_per_unit * m.item_uom_factor
  end,
  material_id = null
from estimator_materials m
join items i on i.id = m.item_id
where c.material_id = m.id
  and m.item_id is not null
  and (
    lower(trim(m.uom)) = lower(trim(i.default_uom))
    or m.item_uom_factor is not null
  );

-- 0074's named two-way check is REPLACED in place (the recreate-the-
-- policy-in-place mechanism): the old shape refuses a row whose only
-- source is an item, so extending around it is impossible.
alter table estimator_work_components
  drop constraint if exists estimator_work_components_exactly_one;
alter table estimator_work_components
  drop constraint if exists estimator_work_components_one_source;
alter table estimator_work_components
  add constraint estimator_work_components_one_source check (
    (material_id is not null)::int
    + (mix_id is not null)::int
    + (item_id is not null)::int = 1
  );

-- ---------------------------------------------------------------------
-- 3. The submit snapshot freezes the item
-- ---------------------------------------------------------------------
-- Frozen rows are NEVER rewritten (0077): old snapshots keep their
-- material_id and their material-unit quantities; the view below
-- bridges them. New submissions write item_id, the item's name and
-- unit, and the indicative price of the day.

alter table estimator_estimate_takeoff alter column material_id drop not null;
alter table estimator_estimate_takeoff
  add column if not exists item_id uuid references items (id);

create unique index if not exists estimator_estimate_takeoff_item_key
  on estimator_estimate_takeoff (estimate_id, work_item_id, item_id)
  where item_id is not null;

alter table estimator_estimate_takeoff
  drop constraint if exists estimator_estimate_takeoff_one_source;
alter table estimator_estimate_takeoff
  add constraint estimator_estimate_takeoff_one_source
  check ((material_id is null) <> (item_id is null));

-- ---------------------------------------------------------------------
-- 4. estimate_takeoff_facts bridges both generations
-- ---------------------------------------------------------------------
-- Same column list as 0078/0084 — consumers and the manifest row are
-- untouched. An item-keyed row IS its item (factor null: the quantity
-- is already in the item's unit); a legacy row still resolves through
-- the material's live link and factor.

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
  case when t.item_id is not null then null else m.item_uom_factor end as item_uom_factor
from estimator_estimate_takeoff t
join estimator_estimates e on e.id = t.estimate_id
left join estimator_materials m on m.id = t.material_id
where e.status = 'submitted'
  and (
    has_app('/estimator') or has_app('/indents')
    or has_app('/inventory') or has_app('/supervisors')
  );

-- drop view restores default write grants every time (0059's lesson),
-- so the revokes ride in the same migration as the definition.
revoke all on estimate_takeoff_facts from public, anon;
revoke insert, update, delete, truncate on estimate_takeoff_facts from anon, authenticated;
grant select on estimate_takeoff_facts to authenticated;

-- ---------------------------------------------------------------------
-- 5. Prove it all landed
-- ---------------------------------------------------------------------

do $$
declare
  t text;
begin
  foreach t in array array[
    'estimator_mix_components', 'estimator_work_components',
    'estimator_estimate_takeoff'
  ]
  loop
    if not exists (
      select 1 from information_schema.columns
      where table_name = t and column_name = 'item_id'
    ) then
      raise exception '0086: % has no item_id column', t;
    end if;
  end loop;

  foreach t in array array[
    'estimator_mix_components_one_source',
    'estimator_work_components_one_source',
    'estimator_estimate_takeoff_one_source'
  ]
  loop
    if not exists (select 1 from pg_constraint where conname = t) then
      raise exception '0086: constraint % missing', t;
    end if;
  end loop;

  if exists (select 1 from pg_constraint where conname = 'estimator_work_components_exactly_one') then
    raise exception '0086: the old two-way work-component check is still in place';
  end if;

  -- No component may reference a material and an item at once, and the
  -- conversion must not have manufactured quantities: every item-keyed
  -- component's item must exist.
  if exists (
    select 1 from estimator_mix_components c
    where c.item_id is not null and not exists (select 1 from items i where i.id = c.item_id)
  ) then
    raise exception '0086: a mix component points at a missing item';
  end if;

  if pg_get_viewdef('estimate_takeoff_facts'::regclass) not ilike '%coalesce(t.item_id, m.item_id)%' then
    raise exception '0086: estimate_takeoff_facts does not bridge item-keyed rows';
  end if;

  if has_table_privilege('authenticated', 'estimate_takeoff_facts', 'insert')
    or has_table_privilege('anon', 'estimate_takeoff_facts', 'select') then
    raise exception '0086: estimate_takeoff_facts grants are wrong';
  end if;
end $$;
