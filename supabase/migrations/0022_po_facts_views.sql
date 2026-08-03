-- Phase 6, M3 — two money-free windows through the purchase-order RLS.
--
-- SELECT on purchase_orders/purchase_order_lines requires the
-- /purchase-orders grant (0021 §12) so a rate can never leak. But two
-- screens legitimately need PO *facts* without money:
--
--   * The indent detail page shows "ordered X of Y" per line, read by
--     site teams who hold /indents and usually not /purchase-orders.
--   * The Overview pipeline (stage 02) counts POs for every signed-in
--     user, exactly as stage 01 counts indents.
--
-- Same mechanism as approved_budgets/approved_budget_lines (0019 §9):
-- views owned by postgres (the table owner bypasses RLS), with the
-- COLUMN LIST as the security boundary. rate, gst_pct, terms and the
-- delivery/deletion notes are ABSENT — a quantity and a status are not
-- money. Open to all authenticated: what exists and how much was
-- ordered is operational fact, not commercial secret. NEVER add a money
-- column to either view.
--
-- security_barrier stops a caller's leaky function being pushed below
-- the view by the planner (the 0019 precedent). Do NOT solve this with
-- a second row-level SELECT policy on the PO tables instead: permissive
-- policies OR together, and a row policy exposes every column.

drop view if exists po_line_facts;
drop view if exists po_facts;

create view po_facts
with (security_barrier) as
select po.id, po.project_id, po.plot_id, po.unit_id, po.scope_code,
       po.vendor_id, po.reference, po.status, po.expected_by,
       po.created_at, po.issued_at
from purchase_orders po;

create view po_line_facts
with (security_barrier) as
select l.id, l.po_id, l.indent_line_id, l.item_id, l.quantity, l.uom,
       po.reference as po_reference, po.status as po_status
from purchase_order_lines l
join purchase_orders po on po.id = l.po_id;

revoke all on po_facts from public, anon;
revoke all on po_line_facts from public, anon;
grant select on po_facts to authenticated;
grant select on po_line_facts to authenticated;
