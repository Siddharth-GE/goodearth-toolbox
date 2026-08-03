# Inventory — build plan & status

Phase 7 of the rebuild. The store-keeper's tool: record what arrives
against a purchase order, know what each store holds, record what goes
out. Read `STATUS.md` and `CLAUDE.md` first; `DESIGN.md` before
styling.

**Branch:** `feature/inventory` · **Migration:** `0023_inventory.sql`

---

## The shape of it, in one paragraph

Three movements and one balance. **Goods receipts** (`GRN/<project>/NNN`)
are always against an issued PO and land either in a store or straight
at the PO's site. **Stock issues** (`ISS/<project>/NNN`) take material
out of a store to a plot (used there) or across to another store (a
transfer). **Adjustments** are signed corrections carrying a mandatory
reason — opening stock is a positive adjustment. **Stock on hand** is
computed from all three, never stored. No money exists anywhere in this
tool.

## Settled decisions

- **Quantities only, no money** — the reason reads are open to any
  signed-in staff member (the Indents precedent). Writes need
  `/inventory`.
- **A location is a store or a plot** (founder, 2026-08-03 kickoff).
  There is no "manufacturing" bucket; issue destinations are another
  store or a plot.
- **Numbering:** `GRN/<project code>/NNN` and `ISS/<project code>/NNN`,
  per-project counters, minted in the database (`create_goods_receipt`,
  `create_stock_issue`). The TS mirrors are `lib/inventory/reference.ts`,
  pinned by tests.
- **Everything is append-only.** A receipt or issue records a physical
  event, so there are no DELETE policies and their numbers, anchors and
  destinations are permanent. A wrong quantity is corrected by a stock
  adjustment, which keeps the reason visible instead of erasing it.
- **A PO completes itself** once every line is fully received — an
  AFTER trigger on `goods_receipt_lines`, `security definer` so the
  store-keeper needs no `/purchase-orders` grant. The PO guard
  re-checks that nothing is outstanding, so the transition is
  self-validating from any direction.
- **An issued PO whose goods have arrived can no longer be cancelled**
  (the check 0021 §8 left a comment for).
- **PO reads go through `po_facts` / `po_line_facts`** — a store-keeper
  holds `/inventory` and usually not `/purchase-orders`. Never widen
  the PO tables' policies for this.

## Guards (the boundary is the database, buttons are a courtesy)

| Guard                         | Refuses                                                                    |
| ----------------------------- | -------------------------------------------------------------------------- |
| `grn_lines_qty_guard`         | receiving more than was ordered, across every receipt                      |
| `stock_issue_lines_qty_guard` | an issue that would take a store below zero                                |
| `stock_adjustments_qty_guard` | a removal that would take a store below zero                               |
| `goods_receipts_guard`        | changing a receipt's order, destination or number                          |
| `stock_issues_guard`          | changing an issue's store, destination or number                           |
| `purchase_orders_guard`       | completing a PO with lines outstanding; cancelling one whose goods arrived |

The two quantity guards serialise on an **advisory transaction lock**,
not `select … for update` — a row lock would need UPDATE rights under
another tool's RLS, which the acting user doesn't hold (the reasoning
is written out at length in 0021 §7).

## Milestones

- [x] **M1 — receive.** Migration 0023, GRN against a PO with partial
      deliveries, store-or-site destination, over-receipt refused, PO
      auto-completion, receipts on the PO detail page.
      _Gate: receive a real PO in two parts, watch it flip to Completed._
- [x] **M2 — stock.** Stock on hand by store and item, per-item
      movement history (receipts, issues, transfers, adjustments).
      _Gate: check one item's count against reality._
- [x] **M3 — out & adjust.** Issues to a plot or as a transfer,
      negative-stock refusal, adjustments with a mandatory reason,
      Overview pipeline stage 03.
      _Gate: issue material to a plot, transfer between stores, adjust a
      count with a reason._

**Built, not yet founder-tested** — all three milestones were written in
one session; the migration still has to be applied in Studio and the
gates walked in the browser before merging to `master`.

## Screens

| Route                                 | What it does                                          |
| ------------------------------------- | ----------------------------------------------------- |
| `/inventory`                          | Receive: POs awaiting delivery + recent deliveries    |
| `/inventory/receive/[poId]`           | The receive basket — ordered / received / arrived now |
| `/inventory/receipts/[receiptId]`     | One delivery note                                     |
| `/inventory/stock`                    | On hand, by store and item                            |
| `/inventory/stock/[storeId]/[itemId]` | Why the number is what it is — every movement         |
| `/inventory/issues`                   | What has gone out                                     |
| `/inventory/issues/new`               | Pick a store, then issue from what it actually holds  |
| `/inventory/issues/[issueId]`         | One issue note                                        |
| `/inventory/adjustments`              | The correction form + every adjustment ever made      |

## Known gaps / next

- **A mis-keyed receipt cannot be deleted**, only corrected by an
  adjustment against a store (and a site delivery cannot be corrected
  at all, since it never entered stock). Raise with the founder after
  the M1 gate — if it bites, the fix is an admin-approved reversal
  flow, not a DELETE policy.
- **Uom is not reconciled across movements.** Stock sums quantities
  regardless of the unit each movement recorded; in practice an item's
  unit doesn't change. If it ever does, the fix belongs in the
  `stock_on_hand` view, not in the screens.
- **`stores` has no `updated_at` or actor columns** (0004), so store
  rows carry no attribution — unlike every table this tool adds.
- Bills (Phase 8) anchors on `purchase_order_lines.id` too; nothing in
  this tool needs to change for it.
