# Inventory — the rules

The store-keeper's tool: what arrives against a purchase order, what each store holds, what goes out. Grant `/inventory`. Migrations `0023`, `0024`, `0080`, `0081`, `0084`.

## The shape of it

Three movements and one balance. **Goods receipts** (`GRN/<project>/NNN`) are always against an issued PO and land in a store or straight at the PO's site. **Stock issues** (`ISS/<project>/NNN`) take material from a store to a plot (used there) or to another store (a transfer). **Adjustments** are signed corrections with a mandatory reason — opening stock is a positive one. **Stock is computed from all three, never stored. No money exists anywhere in this tool**, which is why its reads are open to any signed-in person; writes need `/inventory`.

## Two stock views, deliberately

- **`stock_on_hand`** — a **store's live balance**, which both negative-stock guards read. **A plot must never enter it**: a plot has no balance to protect.
- **`stock_by_location`** — **where material is**, stores and plots. For a plot it is a running total that only grows — nothing leaves a site through this system. The Stock screen reads it.

## Settled decisions

- **PO reads go through `po_facts` / `po_line_facts`** — a store-keeper rarely holds `/purchase-orders`. Never widen the PO tables' policies for this.
- **A location is a store or a plot.** A delivery to a unit shows under its plot (1:1 since `0029`).
- **A general-scope PO cannot be delivered "to site"** — it has no plot; refused in `create_goods_receipt`.
- **Numbering is minted in the database**, per project; `lib/inventory/reference.ts` mirrors it under test.
- **Everything is append-only.** No DELETE policies; a wrong quantity is corrected by an adjustment, which keeps the reason visible.
- **A plot issue names the work it serves** (`0080` — bulk buying means only the issue can tie material to a villa). The work is on the issue header — one issue, one work — from the works masters; the stage is the work's category, derived. Transfers carry none; history is excused (`NOT VALID`). Retagging a mis-picked work is allowed (not in the guard's permanence tuple). **A direct-to-site delivery names its work at receiving** (`0081`) — it never passes through a store, so later never happens.
- **The site-request queue** (`/inventory/requests`, `0084`) is Inventory's window into Supervisors' `issue_requests`. Fulfil opens the issue form pre-filled (store still the keeper's choice, quantities editable — the issue records what was given); saving stamps the request, best-effort. Decline needs a reason the supervisor reads. `issue_requests_guard()` is the boundary (`SECURITY.md`).
- **Drawn past the estimate is flagged, never refused** — site work never waits. The amber banner is on the issue note, derived fresh each render (`lib/inventory/over-issue.ts`) from `estimate_takeoff_facts` and the plot's movements for that work. Different units and no conversion = no flag; a guess is worse than a gap.
- **A PO completes itself** once every line is received — an AFTER trigger, `security definer` so the keeper needs no `/purchase-orders`. **An issued PO whose goods have arrived cannot be cancelled.**

## Guards — the database is the boundary

| Guard                         | Refuses                                                                    |
| ----------------------------- | -------------------------------------------------------------------------- |
| `grn_lines_qty_guard`         | receiving more than was ordered, across every receipt                      |
| `stock_issue_lines_qty_guard` | an issue that would take a store below zero                                |
| `stock_adjustments_qty_guard` | a removal that would take a store below zero                               |
| `goods_receipts_guard`        | changing a receipt's order, destination or number                          |
| `stock_issues_guard`          | changing an issue's store, destination or number                           |
| `purchase_orders_guard`       | completing a PO with lines outstanding; cancelling one whose goods arrived |

The quantity guards serialise on an **advisory transaction lock**, not `select … for update` — a row lock would need UPDATE rights under another tool's RLS (`0021` §7).

## Things that will bite

- **A mis-keyed receipt cannot be deleted**, only corrected by an adjustment — and adjustments apply only to stores, so **a wrong site delivery cannot be corrected at all**. If it bites, build an admin-approved reversal, not a DELETE policy.
- **Units are not reconciled across movements** — stock sums quantities whatever unit each recorded. If an item's unit changes, the fix belongs in `stock_on_hand`.
- **`stores` has no `updated_at` or actor columns** (`0004`).
- **The receipt page is read-only.** The guard permits editing `challan_no`, `received_at` and `note` — one small form when someone needs it.
