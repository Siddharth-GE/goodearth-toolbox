-- 0029 — plot ↔ unit is strictly one-to-one.
--
-- Founder decision (2026-08-04): every unit sits on exactly one plot,
-- and a plot holds one unit. Until now units.plot_id was nullable with
-- no uniqueness (0004), so screens had to treat "plot" and "unit" as
-- two separate questions — the indent form literally asked both. From
-- here the pair is one place: forms collapse to a single picker, and
-- 0024's deferred question ("consolidate unit into plot?") is answered
-- below in stock_by_location.
--
-- Timing: the real plots/units master data is not loaded yet. Live
-- pre-flight (2026-08-04): 2 units, both already on a plot; no plot
-- holds two units; 11 test indents carry BOTH plot_id and unit_id
-- (fixed in §1). The queued master-data import must create each plot
-- first and pair units 1:1 — the unique index makes a double link fail
-- loudly rather than silently.
--
-- Direction of enforcement: unit → plot is hard (NOT NULL + unique).
-- plot → unit ("every plot must already have its unit") is NOT
-- enforced — a plot has to be insertable before its unit exists, and a
-- deferred circular FK would tax every write path for no operational
-- gain. The plots screen surfaces missing units instead.
--
-- Re-runnable throughout (the 0016 convention).

-- ---------------------------------------------------------------------
-- 1. Data fix — test indents that answered both questions
-- ---------------------------------------------------------------------
-- 11 test indents carry a plot AND a unit. The unit wins: everywhere a
-- scope is resolved (resolveScopeCode and its SQL twin in 0021) the
-- unit code already beats the plot code, so nulling the plot changes
-- no display and no reference number. indents_guard refuses header
-- edits on non-draft rows (9 of the 11), so it steps aside for the
-- one statement; the audit trigger stays on — the fix is logged.

alter table indents disable trigger indents_guard;
update indents set plot_id = null
  where plot_id is not null and unit_id is not null;
alter table indents enable trigger indents_guard;

-- ---------------------------------------------------------------------
-- 2. The one-to-one
-- ---------------------------------------------------------------------
-- NOT NULL: a unit cannot exist off-plot. UNIQUE: a plot holds at most
-- one unit. The 0004 FK carried ON DELETE SET NULL, which would now
-- violate the NOT NULL — replaced with the default NO ACTION: a plot
-- with a unit on it simply cannot be deleted.

alter table units alter column plot_id set not null;

create unique index if not exists units_plot_id_key on units (plot_id);

alter table units drop constraint if exists units_plot_id_fkey;
alter table units add constraint units_plot_id_fkey
  foreign key (plot_id) references plots (id);

-- A unit's plot must belong to the unit's own project. Enforced with a
-- composite FK onto (project_id, id) — declarative, validated against
-- existing rows at apply time, no trigger needed. The FK is dropped
-- before its target unique constraint so a re-run doesn't trip over
-- the dependency.

alter table units drop constraint if exists units_plot_same_project;
alter table plots drop constraint if exists plots_project_id_id_key;
alter table plots add constraint plots_project_id_id_key unique (project_id, id);
alter table units add constraint units_plot_same_project
  foreign key (project_id, plot_id) references plots (project_id, id);

-- ---------------------------------------------------------------------
-- 3. Indents catch up with the scope XOR every sibling already has
-- ---------------------------------------------------------------------
-- purchase_orders (0021), goods_receipts (0023), labour_contracts and
-- bills (0025) all CHECK "at most one of plot/unit"; indents predates
-- the idiom and never got it. §1 cleared the violating rows.

alter table indents drop constraint if exists indents_one_scope;
alter table indents add constraint indents_one_scope
  check (not (plot_id is not null and unit_id is not null));

-- ---------------------------------------------------------------------
-- 4. stock_by_location — 'unit' folds into its plot
-- ---------------------------------------------------------------------
-- 0024 kept units as their own location kind because units.plot_id was
-- nullable and rolling up would have stranded deliveries to plot-less
-- units, deferring the consolidation "when the founder makes it". Made:
-- a unit and its plot are the same place. Receipts that landed at a
-- unit surface under that unit's plot (coalesce handles rows written
-- either way, before or after this migration); the separate 'unit'
-- branch goes. Stores and issues are untouched, and stock_on_hand — the
-- store balance the negative-stock guards read — is not involved here
-- at all (the 0024 header explains why a plot must never enter it).
-- Live pre-flight: zero existing unit-destined receipts, so this moves
-- no rows today.

create or replace view stock_by_location as
-- A store's live balance, exactly as the guards see it.
select 'store'::text as location_kind, s.store_id as location_id,
       s.item_id, s.quantity
from stock_on_hand s

union all

-- A plot: everything that has landed there — straight off the lorry
-- (at the plot itself or at its unit, same place) plus everything
-- carried out of a store to it. Grouped so an item that arrived both
-- ways shows one row.
select 'plot'::text as location_kind, m.location_id, m.item_id,
       sum(m.quantity) as quantity
from (
  select coalesce(u.plot_id, gr.plot_id) as location_id,
         l.item_id, l.quantity
  from goods_receipt_lines l
  join goods_receipts gr on gr.id = l.receipt_id
  left join units u on u.id = gr.unit_id
  where gr.to_site and coalesce(u.plot_id, gr.plot_id) is not null

  union all

  select si.plot_id, l.item_id, l.quantity
  from stock_issue_lines l
  join stock_issues si on si.id = l.issue_id
  where si.plot_id is not null
) m
group by m.location_id, m.item_id;

revoke all on stock_by_location from public, anon;
grant select on stock_by_location to authenticated;
