# Purchase Orders — the rules

Grant `/purchase-orders`. Migrations `0020`–`0022`, `0079`.

POs are raised from **approved indent lines**, or **directly** for bulk and urgent buys (`0079`, founder 2026-08-19 — never directly from a budget). The front door is **From an indent** (`/purchase-orders/from-indent`, founder 2026-10-08: "you pick an indent and go"): its remaining lines each get a vendor — the last vendor that item was bought from on an issued PO suggested, with that vendor's last rate and GST — and Create makes one draft PO per vendor, scoped to the indent's unit or plot, delivering to its site, terms from the default template. The older "From approved indents" pull on a draft PO stays. One vendor and one plot/unit (or "General") per PO — the scope is part of the number: `PO/<project>/<plot-or-unit>/NNN`, numbers running per scope. **Money enters the system here**: a line's rate is the vendor-agreed purchase price plus a GST % picked from the `gst_rates` master. **Nothing from Budgets — cost, margin, client rate — appears on a PO, ever.**

## The rules everything rests on

1. **The status machine lives in the database** (`purchase_orders_guard` + `po_lines_draft_only`): draft → issued → (deletion_requested → cancelled | back to issued). `completed` belongs to Inventory's receipt trigger alone. Lines and header editable only in draft. `lib/purchase-orders/workflow.ts` mirrors it **for buttons only**.
2. **Over-ordering against an indent is impossible.** `unique (po_id, indent_line_id)` plus the `po_lines_qty_guard` trigger — serialised on an **advisory lock**, not `select … for update`, because a row lock would need UPDATE rights under another tool's RLS that the acting user doesn't hold (`0021` §7) — refuse the same indent line twice on a PO, and any total beyond the approved quantity across all non-cancelled POs. **A direct line (`0079` — `indent_line_id` null, the bulk/urgent path) has NO quantity ceiling, deliberately:** it is not plot-specific, so there is no approved figure to cap it against. The guard early-returns on it; pricing-before-issue and the receipt cap (`grn_lines_qty_guard`) are the gates that remain. Same-item direct lines merge on add; the unique pair never sees them (NULLs are distinct).
3. **Deleting an issued PO takes an admin's yes** — request with a note → admin approves → cancelled, and the quantities return to the pool. Drafts go via `delete_draft_purchase_order()`, creator-or-admin.
4. **Money is gated.** SELECT on the PO tables requires `/purchase-orders` (the Budgets precedent). **Any future money-free exposure is a narrow view, never a wider policy.** _(`0055` widened the qual to admit `/reporter`, by founder decision — a widened qual, still one policy.)_
5. **Amounts are computed, never stored** — `lib/purchase-orders/math.ts` is the only module that computes PO money, on `lib/line-money.ts`'s line formula (shared with Bills). A line stores quantity, rate, GST %, a discount (a % **or** ₹, never both — `0102`) and other charges; taxable = quantity × rate − discount, GST on the taxable, other charges added after GST. Null is not zero; round at display. The screen's totals box and the print come from the same `summaryRows`, so they cannot disagree.
6. **The GST split is derived, never stored** — the vendor's `gst_state` against the project's company `state` (Masters → Companies): same → CGST + SGST per slab, otherwise IGST. A vendor with no state is treated as same-state, and the PO says so in amber.

## Things that will bite

- **The Issue button must not gate on the server's `fullyPriced` snapshot.** Rate saves don't revalidate, so that prop goes stale and the button plays dead. It checks priced-at-click instead. This was a founder-found bug and the obvious "fix" reintroduces it.
- **Line pulls insert row by row, deliberately** — the reasoning is in `indents/PLAN.md`.
- **Reads go to indents and masters tables directly** — never another tool's gated queries module.
- **Consumers read `po_facts` / `po_line_facts`**, which are money-free by column list and open to all authenticated. That is deliberate and documented in `0022`: what exists and how much was ordered is operational fact, not commercial secret. **Never add a money column to either.**
- **`po_billing_totals` carries money** (ordered and billed) and is WHERE-gated to `/purchase-orders` OR `/bills`. It is not in the money-free family despite sitting beside it. **`po_line_billing_facts`** (`0106`) is its per-line sibling, same gate — the PO reads its "Invoiced" quantity from it.
- **Because the split is derived, editing a vendor's GST state re-labels the split on that vendor's issued POs** (CGST + SGST ↔ IGST). The GST total and grand total never move. Accepted with the "derived, never stored" decision; a stored split would be a migration.
- **Terms are copied, not linked.** A new PO starts from the default `po` template (Masters → Terms); "Use template…" replaces the text on a draft. Changing a template later never rewrites a PO already made.
- **A header save refreshes the page** (unlike a line save): a new vendor can move the order between CGST + SGST and IGST, and the server works that out.

## Open

The letterhead prints the project's company (Masters → Companies) — a project without one prints the placeholder. Optionally a Geist `.ttf` to lift every PDF at once.
