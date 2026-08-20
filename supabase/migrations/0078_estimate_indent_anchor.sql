-- 0078 — Indents pull from the villa's official estimate
--
-- FOUNDER, 2026-08-19: the Estimator is the construction line now.
-- Construction material requests stop coming from the QS's stage-wise
-- plan (construction_budget_lines, anchor B) and start coming from the
-- villa's OFFICIAL estimate — the 0077 submit snapshot. This migration
-- builds the two halves of that: a money-free window Indents can read,
-- and a third provenance anchor on indent_lines.
--
-- THE VIEW IS THE BOUNDARY. Every estimator table gates SELECT on
-- has_app('/estimator') because everything in the tool is a rate or is
-- priced by one. A site engineer raising an indent holds /indents, not
-- /estimator — so the read goes through estimate_takeoff_facts, the
-- po_facts arrangement: an owner view whose WHERE and column list ARE
-- the gate. It carries frozen QUANTITIES from the snapshot and the
-- material→item link — and NO rate column, ever. The takeoff snapshot
-- has a rate column one join away; adding it here would put
-- construction pricing in front of every person who can raise an
-- indent. scripts/view-manifest.ts pins this shape and
-- `npm run db:check-views` fails the pull request that widens it.
--
-- /inventory is in the WHERE from day one: the next step compares
-- store issues against the same frozen quantities, and widening a
-- WHERE later means redefining the view — this way the seventh
-- redefinition problem (0042's warning) never starts.
--
-- ANCHOR C. indent_lines already carries two optional, mutually
-- exclusive anchors: (budget_id, line_key) for interiors and
-- construction_line_id for the construction plan. The estimate anchor
-- is (estimate_id) + the line's own item_id — header-of-source, not a
-- per-takeoff-row FK, because the pull AGGREGATES a material across
-- works (bulk buying is the point) and the stable pair is the honest
-- provenance. The two 0019 CHECKs are unnamed and additive-only says
-- they stay; the new named CHECK extends exclusivity over the third
-- anchor without touching them.
--
-- Re-runnable throughout.

-- ---------------------------------------------------------------------
-- 1. The window
-- ---------------------------------------------------------------------

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
  -- The bridge to procurement, read live from the material: the link
  -- and factor are bridging properties, not part of what was estimated,
  -- so a link added after submit still lets the frozen quantity pull.
  m.item_id,
  m.item_uom_factor
from estimator_estimate_takeoff t
join estimator_estimates e on e.id = t.estimate_id
left join estimator_materials m on m.id = t.material_id
where e.status = 'submitted'
  and (has_app('/estimator') or has_app('/indents') or has_app('/inventory'));

-- drop view restores default write grants every time (0059's lesson),
-- so the revokes ride in the same migration as the definition.
revoke all on estimate_takeoff_facts from public, anon;
revoke insert, update, delete, truncate on estimate_takeoff_facts from anon, authenticated;
grant select on estimate_takeoff_facts to authenticated;

-- ---------------------------------------------------------------------
-- 2. Anchor C on indent_lines
-- ---------------------------------------------------------------------
-- RESTRICT (the default): an estimate with indent lines against it
-- cannot be deleted — and only drafts are deletable anyway (0077), so
-- this can only ever refuse something already refused.

alter table indent_lines
  add column if not exists estimate_id uuid references estimator_estimates (id);

alter table indent_lines
  drop constraint if exists indent_lines_one_anchor;
alter table indent_lines
  add constraint indent_lines_one_anchor
  check (not (estimate_id is not null
              and (budget_id is not null or construction_line_id is not null)));

-- One line per (indent, estimate, item): pulling the same material
-- twice edits the line, never doubles it — the double-buy rule, anchor
-- C edition. Partial, so direct lines (all anchors null) never collide.
create unique index if not exists indent_lines_estimate_anchor_key
  on indent_lines (indent_id, estimate_id, item_id)
  where estimate_id is not null;

create index if not exists indent_lines_estimate_idx
  on indent_lines (estimate_id)
  where estimate_id is not null;

-- ---------------------------------------------------------------------
-- 3. The works vocabulary reaches the indent header
-- ---------------------------------------------------------------------
-- Optional: a site request may name the work it serves (the founder's
-- "adopt the works master in indents"). The 0053 stage column and its
-- FK stay untouched — the old vocabulary keeps working where it
-- already is.

alter table indents
  add column if not exists work_item_id uuid references work_items (id);

create index if not exists indents_work_item_idx
  on indents (work_item_id)
  where work_item_id is not null;

-- ---------------------------------------------------------------------
-- 4. Prove it all landed
-- ---------------------------------------------------------------------

do $$
declare
  c text;
begin
  if not exists (
    select 1 from pg_views
    where schemaname = 'public' and viewname = 'estimate_takeoff_facts'
  ) then
    raise exception '0078: estimate_takeoff_facts is missing';
  end if;

  -- The view must carry no rate column and no write privileges for the
  -- client roles.
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'estimate_takeoff_facts'
      and column_name like '%rate%'
  ) then
    raise exception '0078: estimate_takeoff_facts carries a rate column';
  end if;

  if exists (
    select 1 from information_schema.role_table_grants
    where table_schema = 'public'
      and table_name = 'estimate_takeoff_facts'
      and grantee in ('anon', 'authenticated', 'PUBLIC')
      and privilege_type in ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE')
  ) then
    raise exception '0078: estimate_takeoff_facts is writable by a client role';
  end if;

  for c in select unnest(array['estimate_id']) loop
    if not exists (
      select 1 from information_schema.columns
      where table_schema = 'public'
        and table_name = 'indent_lines' and column_name = c
    ) then
      raise exception '0078: indent_lines.% is missing', c;
    end if;
  end loop;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'indents' and column_name = 'work_item_id'
  ) then
    raise exception '0078: indents.work_item_id is missing';
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'indent_lines_one_anchor'
  ) then
    raise exception '0078: indent_lines_one_anchor is missing';
  end if;

  foreach c in array array[
    'indent_lines_estimate_anchor_key', 'indent_lines_estimate_idx', 'indents_work_item_idx'
  ]
  loop
    if not exists (
      select 1 from pg_indexes
      where schemaname = 'public' and indexname = c
    ) then
      raise exception '0078: index % is missing', c;
    end if;
  end loop;
end $$;
