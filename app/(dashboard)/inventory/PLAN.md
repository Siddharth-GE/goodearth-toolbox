# Inventory — the rules

The store-keeper's tool: record what arrives against a purchase order, know what each store holds, record what goes out. Shipped 2026-08-03. Migrations `0023`, `0024`.

_Trimmed 2026-08-14: milestone log, screen inventory and the pre-merge smoke report live in git._

## The shape of it

Three movements and one balance. **Goods receipts** (`GRN/<project>/NNN`) are always against an issued PO and land either in a store or straight at the PO's site. **Stock issues** (`ISS/<project>/NNN`) take material out of a store to a plot (used there) or across to another store (a transfer). **Adjustments** are signed corrections carrying a mandatory reason — opening stock is a positive adjustment. **Stock is computed from all three, never stored. No money exists anywhere in this tool.**

## Two stock views, deliberately

- **`stock_on_hand`** — a **store's live balance**. Goes up and down, can be drawn down, and both negative-stock guards read it. **A plot must never enter this view**: a plot has no balance to protect, and folding one in would corrupt every guard that asks "how much is in that store".
- **`stock_by_location`** — **where material is**, across stores and plots. For a store it is the balance above; for a plot it is a running total of everything that has landed there. Those totals only grow, because nothing leaves a site through this system — it is built into the house. This is what the Stock screen reads.

## Settled decisions

- **Quantities only, no money** — which is why reads are open to any signed-in staff member (the Indents precedent). Writes need `/inventory`.
- **PO reads go through `po_facts` / `po_line_facts`** — a store-keeper holds `/inventory` and usually not `/purchase-orders`. **Never widen the PO tables' policies for this.**
- **A location is a store or a plot.** No "manufacturing" bucket (founder, kickoff). Units used to be their own location kind because `units.plot_id` was nullable; `0029` made plot ↔ unit strictly 1:1, so a delivery at a unit now shows under its plot and the 'unit' kind is gone.
- **A general-scope PO cannot be delivered "to site"** — it has no plot or unit, so there is nowhere for the goods to show. Refused in `create_goods_receipt`, and the checkbox is disabled.
- **Numbering is minted in the database** (`create_goods_receipt`, `create_stock_issue`), per-project counters. The TS mirrors in `lib/inventory/reference.ts` are pinned by tests.
- **Everything is append-only.** A receipt or issue records a physical event, so there are no DELETE policies and their numbers, anchors and destinations are permanent. A wrong quantity is corrected by a stock adjustment, which keeps the reason visible instead of erasing it.
- **A plot issue names the work it serves** (`0080`, founder 2026-08-19: bulk buying means only the issue can tie material to a villa). The work lives on the ISSUE HEADER — one physical issue serves one work; two works is two issues — and comes from the works masters, the estimate's own vocabulary; the stage is the work's category, derived and never stored. History is excused by a `NOT VALID` check; transfers never carry a work. `work_item_id` is deliberately NOT in `stock_issues_guard()`'s permanence tuple: retagging a mis-picked work is a label fix with no quantity effect, audited like every write. The old 6-arg `create_stock_issue` survives as a delegating wrapper for the migrate-before-deploy window. **The same shape covers direct-to-site deliveries** (`0081`, founder 2026-08-20: a to-site GRN never passes through a store, so its work is recorded at the receiving moment or it slips): `goods_receipts.work_item_id`, mandatory for new to-site receipts, refused on store receipts, history excused `NOT VALID`, old `create_goods_receipt` signature wrapped.
- **The site-request queue is Inventory's window into the Supervisors' `issue_requests`** (`0084`, Phase 2 Step H). Fulfil walks into the issue form with villa, work, item and quantity pre-filled — the store is still the keeper's choice, and quantities stay editable because the issue records what was actually given, not what was asked. Saving stamps the request `fulfilled` with the issue id, best-effort: if the stamp fails the issue stands and the request stays in the queue (decline it with "issued as …"). Decline requires a reason the supervisor reads at site. This write into another tool's table is the fifth documented exception (`SECURITY.md`); the `issue_requests_guard()` trigger — not this code — is the boundary.
- **Drawn past the estimate is flagged, never refused** (Phase 2 Step I, founder: site work never waits). The amber banner lives on the ISSUE NOTE, not in the save action — `recordStockIssue` redirects there on success, so the keeper sees it immediately and every later reader sees the same truth. Derived fresh each render (`getOverIssueRows` → pure `lib/inventory/over-issue.ts`) from `estimate_takeoff_facts` + the plot's cumulative movements for that work; a resubmitted estimate that covers the material clears it by itself. No conversion factor and differing units = no flag — a guess is worse than a gap.
- **A PO completes itself** once every line is fully received — an AFTER trigger on `goods_receipt_lines`, `security definer` so the store-keeper needs no `/purchase-orders` grant. The PO guard re-checks that nothing is outstanding, so the transition is self-validating from any direction.
- **An issued PO whose goods have arrived can no longer be cancelled.**

## Guards — the boundary is the database, buttons are a courtesy

| Guard                         | Refuses                                                                    |
| ----------------------------- | -------------------------------------------------------------------------- |
| `grn_lines_qty_guard`         | receiving more than was ordered, across every receipt                      |
| `stock_issue_lines_qty_guard` | an issue that would take a store below zero                                |
| `stock_adjustments_qty_guard` | a removal that would take a store below zero                               |
| `goods_receipts_guard`        | changing a receipt's order, destination or number                          |
| `stock_issues_guard`          | changing an issue's store, destination or number                           |
| `purchase_orders_guard`       | completing a PO with lines outstanding; cancelling one whose goods arrived |

The two quantity guards serialise on an **advisory transaction lock**, not `select … for update` — a row lock would need UPDATE rights under another tool's RLS, which the acting user doesn't hold. The reasoning is written out at length in `0021` §7.

## Things that will bite

- **Any tool rendering the shared catalogue picker must be listed in `app/api/catalogue/route.ts`.** `/inventory` was missing, so the Adjustments item picker returned 403 and sat empty for an actual store-keeper. Found only by smoke-testing as the probe account holding one grant — an admin would never have seen it. This will recur for every future tool.
- **A mis-keyed receipt cannot be deleted**, only corrected by an adjustment — and adjustments only apply to stores, so **a wrong site delivery cannot be corrected at all**. If it bites, the fix is an admin-approved reversal flow, not a DELETE policy.
- **Uom is not reconciled across movements.** Stock sums quantities regardless of the unit each movement recorded. If an item's unit ever changes, the fix belongs in the `stock_on_hand` view, not in the screens.
- **`stores` has no `updated_at` or actor columns** (`0004`), so store rows carry no attribution — unlike every table this tool adds.
- **The receipt detail page is read-only.** The database guard permits editing exactly `challan_no`, `received_at` and `note`, so this is one small form when someone actually needs it. The unused `updateGoodsReceipt` action that anticipated it was deleted — build the third copy, not the first.
