-- 0082 — Units of measure become ONE managed list, in Masters
--
-- FOUNDER, 2026-08-20: "there are units used across apps, all
-- different… keep it in the masters." Until now there were two
-- vocabularies: procurement's eight values hard-coded in a CHECK on
-- seven tables (each/rft/sqft/lumpsum/bag/kg/litre/cft, mirrored in
-- lib/masters/constants.ts), and the Estimator's own picker master
-- (estimator_uoms, 0075) with thirteen. Adding "tonne" to procurement
-- meant a migration; the same unit spelt "nos" on one side and "each"
-- on the other meant a translation table (0076). One list ends that.
--
-- THE 0053 SHAPE, EXACTLY. `uoms` is construction_stages again: a
-- Masters-owned list (reads open, writes /masters), FK-by-NAME from
-- every uom column, ON UPDATE CASCADE so a rename follows through,
-- DELETE RESTRICT so a unit in use is refused, NOT VALID so history is
-- excused, is_active to stop new picks without touching old rows.
--
-- THE CHECKS COME OFF. The eight-value CHECKs stop new units from ever
-- being usable, so they are dropped in the same breath the FK lands —
-- a swap of enforcement, not a removal of it (the 0079 relaxation
-- precedent, with a stricter FK arriving in the same migration). The
-- stock-arithmetic invariant is untouched: an item still moves in
-- exactly ONE unit, because every movement line's uom is stamped
-- server-side from items.default_uom, never typed.
--
-- THE ESTIMATOR JOINS THE LIST. Its three uom columns were free text
-- with picker-only enforcement (0075, "the enforcement is the UI") —
-- superseded by this decision: they get the same NOT VALID FK, and the
-- picker reads this master. estimator_uoms stays as a table (additive
-- only) but nothing reads it any more. The 0077 snapshot columns stay
-- free text on purpose — they are frozen copies of history.
--
-- Re-runnable throughout.

-- ---------------------------------------------------------------------
-- 1. The list
-- ---------------------------------------------------------------------

create table if not exists uoms (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (length(trim(name)) > 0),
  sort_order int not null default 0,
  is_active boolean not null default true,
  created_by uuid references profiles (id),
  updated_by uuid references profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists audit_uoms on uoms;
create trigger audit_uoms
  after insert or update or delete on uoms
  for each row execute function audit_row();

drop trigger if exists set_updated_at on uoms;
create trigger set_updated_at
  before update on uoms
  for each row execute function set_updated_at();

alter table uoms enable row level security;

drop policy if exists "uoms readable by authenticated" on uoms;
create policy "uoms readable by authenticated"
  on uoms for select to authenticated
  using (true);

drop policy if exists "uoms writable by masters app" on uoms;
create policy "uoms writable by masters app"
  on uoms for insert to authenticated
  with check (has_app('/masters'));

drop policy if exists "uoms updatable by masters app" on uoms;
create policy "uoms updatable by masters app"
  on uoms for update to authenticated
  using (has_app('/masters')) with check (has_app('/masters'));

drop policy if exists "uoms deletable by masters app" on uoms;
create policy "uoms deletable by masters app"
  on uoms for delete to authenticated
  using (has_app('/masters'));

-- ---------------------------------------------------------------------
-- 2. Seed — the union of both old vocabularies, everyday units first
-- ---------------------------------------------------------------------
-- 'each' and 'nos' both stay: they are the same idea under two site
-- conventions, both live in saved rows, and deactivating one later is
-- a Masters decision, not a migration.

insert into uoms (name, sort_order) values
  ('each',    10),
  ('nos',     20),
  ('sqft',    30),
  ('sqm',     40),
  ('cft',     50),
  ('cum',     60),
  ('rft',     70),
  ('rmt',     80),
  ('kg',      90),
  ('tonne',  100),
  ('bag',    110),
  ('litre',  120),
  ('set',    130),
  ('lumpsum', 140)
on conflict (name) do nothing;

-- ---------------------------------------------------------------------
-- 3. Tidy the strays (one 'Sqft' typed on staging before 0075)
-- ---------------------------------------------------------------------
-- Case-insensitive canonicalisation against the list, estimator side
-- only — procurement values were CHECK-constrained and cannot stray.
-- Anything matching nothing stays as typed; NOT VALID excuses it.

update estimator_materials m set uom = u.name
from uoms u where lower(m.uom) = lower(u.name) and m.uom <> u.name;
update estimator_mixes m set uom = u.name
from uoms u where lower(m.uom) = lower(u.name) and m.uom <> u.name;
update estimator_work_info w set uom = u.name
from uoms u where lower(w.uom) = lower(u.name) and w.uom <> u.name;

-- ---------------------------------------------------------------------
-- 4. The eight-value CHECKs come off, the FKs go on
-- ---------------------------------------------------------------------
-- The inline CHECKs were never named, so they are found by their
-- definition (the literal 'each' list) and dropped by whatever name
-- Postgres gave them.

do $$
declare
  r record;
begin
  for r in
    select rel.relname as table_name, con.conname
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace n on n.oid = rel.relnamespace
    where n.nspname = 'public'
      and con.contype = 'c'
      and rel.relname in (
        'items', 'selection_lines', 'construction_budget_lines', 'indent_lines',
        'purchase_order_lines', 'goods_receipt_lines', 'stock_issue_lines',
        'stock_adjustments'
      )
      and pg_get_constraintdef(con.oid) like '%''each''%'
      and pg_get_constraintdef(con.oid) like '%''lumpsum''%'
  loop
    execute format('alter table %I drop constraint %I', r.table_name, r.conname);
  end loop;
end $$;

alter table items drop constraint if exists items_default_uom_fkey;
alter table items
  add constraint items_default_uom_fkey
  foreign key (default_uom) references uoms (name)
  on update cascade not valid;

alter table selection_lines drop constraint if exists selection_lines_uom_fkey;
alter table selection_lines
  add constraint selection_lines_uom_fkey
  foreign key (uom) references uoms (name)
  on update cascade not valid;

alter table construction_budget_lines drop constraint if exists construction_budget_lines_uom_fkey;
alter table construction_budget_lines
  add constraint construction_budget_lines_uom_fkey
  foreign key (uom) references uoms (name)
  on update cascade not valid;

alter table indent_lines drop constraint if exists indent_lines_uom_fkey;
alter table indent_lines
  add constraint indent_lines_uom_fkey
  foreign key (uom) references uoms (name)
  on update cascade not valid;

alter table purchase_order_lines drop constraint if exists purchase_order_lines_uom_fkey;
alter table purchase_order_lines
  add constraint purchase_order_lines_uom_fkey
  foreign key (uom) references uoms (name)
  on update cascade not valid;

alter table goods_receipt_lines drop constraint if exists goods_receipt_lines_uom_fkey;
alter table goods_receipt_lines
  add constraint goods_receipt_lines_uom_fkey
  foreign key (uom) references uoms (name)
  on update cascade not valid;

alter table stock_issue_lines drop constraint if exists stock_issue_lines_uom_fkey;
alter table stock_issue_lines
  add constraint stock_issue_lines_uom_fkey
  foreign key (uom) references uoms (name)
  on update cascade not valid;

alter table stock_adjustments drop constraint if exists stock_adjustments_uom_fkey;
alter table stock_adjustments
  add constraint stock_adjustments_uom_fkey
  foreign key (uom) references uoms (name)
  on update cascade not valid;

alter table estimator_materials drop constraint if exists estimator_materials_uom_fkey;
alter table estimator_materials
  add constraint estimator_materials_uom_fkey
  foreign key (uom) references uoms (name)
  on update cascade not valid;

alter table estimator_mixes drop constraint if exists estimator_mixes_uom_fkey;
alter table estimator_mixes
  add constraint estimator_mixes_uom_fkey
  foreign key (uom) references uoms (name)
  on update cascade not valid;

alter table estimator_work_info drop constraint if exists estimator_work_info_uom_fkey;
alter table estimator_work_info
  add constraint estimator_work_info_uom_fkey
  foreign key (uom) references uoms (name)
  on update cascade not valid;

-- ---------------------------------------------------------------------
-- 5. Prove it all landed
-- ---------------------------------------------------------------------

do $$
declare
  v int;
begin
  if not exists (
    select 1 from pg_class cl
    join pg_namespace n on n.oid = cl.relnamespace
    where n.nspname = 'public' and cl.relname = 'uoms'
      and cl.relkind = 'r' and cl.relrowsecurity
  ) then
    raise exception '0082: uoms is missing or has RLS off';
  end if;

  select count(*) into v from pg_policies
  where schemaname = 'public' and tablename = 'uoms';
  if v <> 4 then
    raise exception '0082: expected 4 policies on uoms, found %', v;
  end if;

  select count(*) into v from uoms;
  if v < 14 then
    raise exception '0082: expected at least 14 seeded units, found %', v;
  end if;

  -- Every uom column now answers to the list, and no eight-value CHECK
  -- survives to fight it.
  select count(*) into v from pg_constraint
  where conname like '%uom_fkey' and contype = 'f';
  if v < 11 then
    raise exception '0082: expected 11 uom foreign keys, found %', v;
  end if;

  select count(*) into v
  from pg_constraint con
  join pg_class rel on rel.oid = con.conrelid
  join pg_namespace n on n.oid = rel.relnamespace
  where n.nspname = 'public' and con.contype = 'c'
    and pg_get_constraintdef(con.oid) like '%''each''%'
    and pg_get_constraintdef(con.oid) like '%''lumpsum''%';
  if v <> 0 then
    raise exception '0082: % eight-value uom CHECKs still standing', v;
  end if;
end $$;
