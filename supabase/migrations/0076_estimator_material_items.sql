-- 0076 — An estimator material can name its catalogue item
--
-- FOUNDER, 2026-08-19, redirecting the operations chain: the Estimator
-- becomes construction's source of truth — indents pull from a villa's
-- official estimate, and store issues are compared against it. Both of
-- those speak the procurement catalogue (`items`): indent lines, PO
-- lines, receipts and stock all anchor on items(id). The estimator's
-- materials are deliberately their OWN master (0074 decision 1 — cement
-- does not belong in the designers' picker), so the two worlds need a
-- bridge, and this is it: an OPTIONAL link from a material to the item
-- it is bought and issued as. Construction raw materials enter the
-- catalogue under the kind='material' band that has existed since 0004;
-- the designers' picker is design-led by convention, not by filter, and
-- narrowing it is a later, separate decision.
--
-- THE FACTOR IS THE UNIT TRANSLATION, AND ITS DIRECTION IS FIXED:
--
--   one <material.uom> of this material = item_uom_factor
--     × <items.default_uom> of the linked item
--
-- e.g. sand estimated in cum, bought in cft: factor 35.31. Procurement
-- lines always move in items.default_uom — the stock views sum raw
-- quantities, so an item must only ever move in ONE unit, and the
-- eight-value procurement CHECK stays untouched. When the two uoms are
-- the same label the factor is implicitly 1 and stays null; when they
-- differ and no factor is set, screens show the estimate figure as
-- reference and a person types the procurement quantity. Conversion
-- never happens silently without a factor someone entered.
--
-- ONE ITEM, ONE MATERIAL. Two materials linked to the same item would
-- double-count every issued-vs-estimated comparison, so the link is
-- unique per item (partial index — many materials stay unlinked, and
-- unlinked is a visible to-do on the materials screen, not an error).
--
-- Columns on an already-gated table: the 0074 four-policy /estimator
-- gate covers them. No new views and no functions, so no revokes.
--
-- Re-runnable throughout.

alter table estimator_materials
  add column if not exists item_id uuid references items (id);

alter table estimator_materials
  add column if not exists item_uom_factor numeric;

comment on column estimator_materials.item_id is
  'The catalogue item this material is bought and issued as. Null = not '
  'linked yet; linking is what lets estimates feed indents and lets '
  'issues be compared against estimates.';

comment on column estimator_materials.item_uom_factor is
  'One <uom> of this material = item_uom_factor × <default_uom> of the '
  'linked item. Null with matching uoms means 1; null with differing '
  'uoms means "no conversion known — a person types the procurement '
  'quantity".';

-- Named CHECKs, added drop-then-add so a re-run converges.
alter table estimator_materials
  drop constraint if exists estimator_materials_factor_positive;
alter table estimator_materials
  add constraint estimator_materials_factor_positive
  check (item_uom_factor is null or item_uom_factor > 0);

alter table estimator_materials
  drop constraint if exists estimator_materials_factor_needs_item;
alter table estimator_materials
  add constraint estimator_materials_factor_needs_item
  check (item_uom_factor is null or item_id is not null);

create unique index if not exists estimator_materials_item_key
  on estimator_materials (item_id)
  where item_id is not null;

-- Prove it landed.
do $$
declare
  c text;
begin
  for c in select unnest(array['item_id', 'item_uom_factor'])
  loop
    if not exists (
      select 1 from information_schema.columns
      where table_schema = 'public'
        and table_name = 'estimator_materials'
        and column_name = c
    ) then
      raise exception '0076: estimator_materials.% is missing', c;
    end if;
  end loop;

  foreach c in array array[
    'estimator_materials_factor_positive',
    'estimator_materials_factor_needs_item'
  ]
  loop
    if not exists (select 1 from pg_constraint where conname = c) then
      raise exception '0076: constraint % is missing', c;
    end if;
  end loop;

  if not exists (
    select 1 from pg_indexes
    where schemaname = 'public' and indexname = 'estimator_materials_item_key'
  ) then
    raise exception '0076: the one-item-one-material index is missing';
  end if;
end $$;
