/**
 * Lists every saved line whose unit is not its item's Masters unit.
 *
 * WHY. A material moves from indent to stock in its Masters unit
 * (plan.md, A2, 2026-10-08). Before that rule the indent line grid let a
 * person switch a cement line to cft, and the unit rode onto the PO, the
 * receipt and stock — which sums quantities whatever their unit. The
 * screens now refuse it; this finds what was saved before, for a person
 * to look at. It changes nothing.
 *
 * Interiors lines (an indent line with a budget, and the PO and receipt
 * lines made from one) are left out: a tile may be specified per sqft.
 *
 *   npx tsx scripts/report-unit-mismatches.ts --project <ref>
 */
import { requireProjectRef, sql } from "./supabase-management";

const ref = requireProjectRef(process.argv);

const query = `
with lines as (
  select 'indent' as kind, i.reference as document, l.item_id, l.quantity, l.uom
    from indent_lines l join indents i on i.id = l.indent_id
   where l.budget_id is null
  union all
  select 'purchase order', p.reference, l.item_id, l.quantity, l.uom
    from purchase_order_lines l join purchase_orders p on p.id = l.po_id
    left join indent_lines il on il.id = l.indent_line_id
   where il.budget_id is null
  union all
  select 'goods receipt', g.reference, l.item_id, l.quantity, l.uom
    from goods_receipt_lines l join goods_receipts g on g.id = l.receipt_id
    join purchase_order_lines pl on pl.id = l.po_line_id
    left join indent_lines il on il.id = pl.indent_line_id
   where il.budget_id is null
  union all
  select 'stock issue', s.reference, l.item_id, l.quantity, l.uom
    from stock_issue_lines l join stock_issues s on s.id = l.issue_id
  union all
  select 'adjustment', to_char(a.adjusted_at, 'YYYY-MM-DD'), a.item_id, a.quantity, a.uom
    from stock_adjustments a
)
select lines.kind, lines.document, coalesce(it.code, '—') as code, it.name,
       lines.quantity, lines.uom as saved_in, it.default_uom as masters_unit
  from lines join items it on it.id = lines.item_id
 where lower(trim(lines.uom)) <> lower(trim(coalesce(it.default_uom, '')))
 order by lines.kind, lines.document, it.name`;

// tsx runs scripts as CommonJS here, so no top-level await.
void (async () => {
  const rows = await sql(ref, query);
  if (rows.length === 0) {
    console.log("Every line is in its item's Masters unit.");
  } else {
    console.log(`${rows.length} line(s) saved in a unit other than the item's Masters unit:\n`);
    console.table(rows);
  }
})().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
