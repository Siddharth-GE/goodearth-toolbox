-- Phase 7, follow-up — stock by LOCATION, not just by store.
--
-- Founder, after testing 0023: "stock should have the plots as well —
-- right now it's just Farm Store and the other stores. Whenever
-- something goes directly there it should show, to study the data later
-- which we will consolidate."
--
-- So a location is a store, a plot, or a unit. Two different questions
-- are being answered, and keeping them in two views is the point:
--
--   * stock_on_hand (0023) — a STORE's live balance. Things go in and
--     come out, it can be drawn down, and the two negative-stock guards
--     read it to refuse an issue that would take it below zero. This
--     view is NOT touched here, and a plot must never enter it: a plot
--     has no balance to protect, and folding one in would corrupt every
--     guard that asks "how much is in that store".
--
--   * stock_by_location (below) — WHERE material currently sits, across
--     every kind of location. For a store it is the balance above. For
--     a plot or unit it is a running total of what has landed there:
--     direct-to-site deliveries plus everything issued out of a store
--     to that plot. Nothing leaves a plot through this system — it is
--     consumed by the build — so those totals only ever grow.
--
-- Units are their own location kind rather than being rolled up into
-- their plot: units.plot_id is nullable (0004), a PO is scoped to one
-- or the other (0021), and rolling up would silently strand every
-- delivery to a plot-less unit. Consolidating a unit into its plot is a
-- reporting decision, made when the founder makes it — not a fact this
-- view should decide on their behalf.
--
-- Re-runnable throughout (the 0016 convention).

-- ---------------------------------------------------------------------
-- 1. Every site delivery must have a site
-- ---------------------------------------------------------------------
-- A general-scope PO (PO/SAA/GEN/001) has no plot and no unit, so
-- "unloaded at site" has no site to name and the goods would land in no
-- location at all — invisible in the view below, which is exactly the
-- data the founder wants to study. Such a delivery must go into a
-- store.
--
-- Enforced inside create_goods_receipt(), the only path that mints a
-- receipt, rather than as a table CHECK: a constraint would have to be
-- validated against rows already recorded during testing, and this is a
-- rule about how a receipt is created, not about what a row may hold.

create or replace function create_goods_receipt(
  p_po_id uuid,
  p_store_id uuid,
  p_to_site boolean,
  p_challan_no text,
  p_received_at date,
  p_note text
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_project_id uuid;
  v_plot_id uuid;
  v_unit_id uuid;
  v_status text;
  v_reference text;
  v_project_code text;
  v_store_active boolean;
  v_no int;
  v_id uuid;
begin
  if (p_store_id is not null) = coalesce(p_to_site, false) then
    raise exception 'Choose where the goods went: a store, or the site';
  end if;

  select f.project_id, f.plot_id, f.unit_id, f.status, f.reference
    into v_project_id, v_plot_id, v_unit_id, v_status, v_reference
  from po_facts f
  where f.id = p_po_id;

  if v_project_id is null then
    raise exception 'That purchase order no longer exists';
  end if;
  if v_status <> 'issued' then
    raise exception 'Goods can only be received against an ISSUED purchase order (% is %)',
      v_reference, v_status;
  end if;

  -- New in 0024: no site to deliver to means it has to go into a store.
  if coalesce(p_to_site, false) and v_plot_id is null and v_unit_id is null then
    raise exception 'This is a general purchase order with no plot or unit, so there is no site to deliver to — receive it into a store';
  end if;

  if p_store_id is not null then
    select is_active into v_store_active from stores where id = p_store_id;
    if v_store_active is null then
      raise exception 'Pick a store for this delivery';
    end if;
    if not v_store_active then
      raise exception 'That store is marked inactive in Masters';
    end if;
  end if;

  select code into v_project_code from projects where id = v_project_id;
  if v_project_code is null then
    raise exception 'This project has no short code yet — set one in Masters before recording deliveries';
  end if;

  insert into grn_counters (project_id, last_no)
  values (v_project_id, 1)
  on conflict (project_id) do update set last_no = grn_counters.last_no + 1
  returning last_no into v_no;

  insert into goods_receipts (
    project_id, po_id, store_id, to_site, plot_id, unit_id,
    grn_no, reference, challan_no, received_at, note, created_by, updated_by
  )
  values (
    v_project_id, p_po_id, p_store_id, coalesce(p_to_site, false),
    case when coalesce(p_to_site, false) then v_plot_id end,
    case when coalesce(p_to_site, false) then v_unit_id end,
    v_no,
    -- greatest() because lpad TRUNCATES past its target (the 0019 §7
    -- rule); matches the TS mirror in lib/inventory/reference.ts.
    'GRN/' || v_project_code || '/'
      || lpad(v_no::text, greatest(3, length(v_no::text)), '0'),
    nullif(trim(p_challan_no), ''), coalesce(p_received_at, current_date),
    nullif(trim(p_note), ''), auth.uid(), auth.uid()
  )
  returning id into v_id;

  return v_id;
end $$;

revoke execute on function create_goods_receipt(uuid, uuid, boolean, text, date, text) from public;
grant execute on function create_goods_receipt(uuid, uuid, boolean, text, date, text) to authenticated;

-- ---------------------------------------------------------------------
-- 2. stock_by_location — where the material is, whatever kind of place
-- ---------------------------------------------------------------------
-- location_kind is 'store' | 'plot' | 'unit'; location_id points into
-- the matching master table. Screens join the name themselves, the way
-- they already do for the po_facts views — this view carries facts, not
-- labels, so renaming a store never has to touch it.

create or replace view stock_by_location as
-- A store's live balance, exactly as the guards see it.
select 'store'::text as location_kind, s.store_id as location_id,
       s.item_id, s.quantity
from stock_on_hand s

union all

-- A plot or unit: everything that has landed there. Grouped after the
-- union so a plot that received the same item both ways shows one row.
select m.location_kind, m.location_id, m.item_id, sum(m.quantity) as quantity
from (
  -- Delivered straight off the lorry at the PO's plot.
  select 'plot'::text as location_kind, gr.plot_id as location_id,
         l.item_id, l.quantity
  from goods_receipt_lines l
  join goods_receipts gr on gr.id = l.receipt_id
  where gr.to_site and gr.plot_id is not null

  union all

  -- Delivered straight off the lorry at the PO's unit.
  select 'unit'::text, gr.unit_id, l.item_id, l.quantity
  from goods_receipt_lines l
  join goods_receipts gr on gr.id = l.receipt_id
  where gr.to_site and gr.unit_id is not null

  union all

  -- Carried out to the plot from a store. This is the same movement
  -- that subtracts from the store in stock_on_hand — one thing moving,
  -- counted once on each side, never created or destroyed.
  select 'plot'::text, si.plot_id, l.item_id, l.quantity
  from stock_issue_lines l
  join stock_issues si on si.id = l.issue_id
  where si.plot_id is not null
) m
group by m.location_kind, m.location_id, m.item_id;

revoke all on stock_by_location from public, anon;
grant select on stock_by_location to authenticated;
