-- 0102 — A PO line carries a discount and other charges
--
-- FOUNDER, 2026-10-08 (plan.md, B2): each PO line takes a discount (a
-- percentage OR an amount, never both) and other charges (freight,
-- loading), and everything is calculated. Nothing is stored for CGST,
-- SGST or IGST: the split is derived from the vendor's gst_state against
-- the project's company state (0101), in lib/purchase-orders/math.ts —
-- the one module that computes PO money ("amounts are computed, never
-- stored", Purchase Orders' PLAN).
--
--   line taxable = quantity × rate − discount
--   line GST     = taxable × gst_pct / 100   (CGST + SGST halves, or IGST)
--   line total   = taxable + GST + other_charges
--
-- Other charges are added after tax, as vendors bill freight; a taxed
-- charge is entered as its own line.
--
-- These are columns of a gated table (purchase_order_lines, SELECT
-- /purchase-orders or /reporter — 0055), so no policy changes. The
-- money-free po_line_facts view is NOT touched. po_lines_draft_only
-- already keeps them editable only while the PO is a draft.
--
-- Re-runnable throughout.

alter table purchase_order_lines add column if not exists discount_pct numeric;
alter table purchase_order_lines add column if not exists discount_amount numeric;
alter table purchase_order_lines add column if not exists other_charges numeric;

alter table purchase_order_lines drop constraint if exists po_lines_discount_pct_range;
alter table purchase_order_lines add constraint po_lines_discount_pct_range
  check (discount_pct is null or (discount_pct >= 0 and discount_pct < 100));

alter table purchase_order_lines drop constraint if exists po_lines_discount_amount_positive;
alter table purchase_order_lines add constraint po_lines_discount_amount_positive
  check (discount_amount is null or discount_amount >= 0);

alter table purchase_order_lines drop constraint if exists po_lines_one_discount;
alter table purchase_order_lines add constraint po_lines_one_discount
  check (discount_pct is null or discount_amount is null);

alter table purchase_order_lines drop constraint if exists po_lines_other_charges_positive;
alter table purchase_order_lines add constraint po_lines_other_charges_positive
  check (other_charges is null or other_charges >= 0);

comment on column purchase_order_lines.discount_pct is
  'Discount as a percentage of quantity × rate. Exclusive with discount_amount.';
comment on column purchase_order_lines.discount_amount is
  'Discount in rupees off the line''s quantity × rate. Exclusive with discount_pct.';
comment on column purchase_order_lines.other_charges is
  'Freight, loading and the like, in rupees, added after GST.';

do $$
begin
  if (select count(*) from information_schema.columns
      where table_schema = 'public' and table_name = 'purchase_order_lines'
        and column_name in ('discount_pct', 'discount_amount', 'other_charges')) <> 3 then
    raise exception '0102: a purchase_order_lines charge column is missing';
  end if;
  if not exists (select 1 from pg_constraint where conname = 'po_lines_one_discount') then
    raise exception '0102: po_lines_one_discount is missing';
  end if;
  if exists (select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'po_line_facts'
        and column_name in ('rate', 'discount_pct', 'discount_amount', 'other_charges')) then
    raise exception '0102: po_line_facts must stay money-free';
  end if;
end $$;
