# Bills — the rules

Grant `/bills`. Migrations `0025`, `0026`.

The accounts-facing record of what Goodearth owes and has paid. A bill is one of **three kinds** — against an issued purchase order, against an **approved** work order, or **NMR (daily wages)** with no anchor at all — numbered `BILL/<project>/<plot-or-unit-or-GEN>/NNN`, moving recorded → approved → paid, with send-back carrying a mandatory note.

**A bill has no line items, by founder decision.** The paper invoice's figures are the record.

## The rules everything rests on

1. **The status machine lives in the database** (`bills_guard`): recorded → approved → paid, send-back approved → recorded with a mandatory note that the next approval clears. Header and amount edits only while recorded; anchor, vendor, scope and number permanent. `lib/bills/workflow.ts` mirrors it **for buttons only**.
2. **Approvers are a named list** (`bill_approvers`, managed in **Settings** beside indent approvers; admins always may). **Self-approval is allowed** — founder decision. The same list approves labour contracts.
3. **Amounts are stored as entered** from the paper invoice — taxable/GST/total are the vendor's figures, never computed, with no total-equals-sum CHECK. Over-billing against the PO value or contract value **warns, never blocks**.
4. **Money is gated.** SELECT on `bills` requires `/bills`. Two windows exist: `bill_facts` (money-free, open — Overview counts) and `po_billing_totals` (one ordered/billed total per PO, WHERE-gated to `/purchase-orders` OR `/bills`). **Never a second SELECT policy.** _(`0055` widened the `bills` qual to admit `/reporter`; `0058` added `bill_money_facts` for Financial Management. Both are owner-view or widened-qual, never a second policy.)_
5. **The mint derives everything from the anchor.** `create_bill()` reads the money-free `po_facts` — a `/bills`-only user cannot read the PO tables — or the contract row, copies project/plot/unit/vendor, resolves the scope, and mints via `bill_counters`. **Deliberately no vendor-inactive check**: a real invoice from a deactivated vendor still enters the books, and the contract's own `is_active` is the off-switch.
6. **Work orders belong to Bills**, not Masters (`0026` moved the labour contracts here on the founder's correction; `0105` made them work orders, founder 2026-10-08). **The table is still `labour_contracts`** — renamed on every screen only, so `bills.kind = 'contract'`, `labour_contract_id`, Financial Management and Reporter are untouched. Made at `/bills/work-orders` by any `/bills` holder: a contractor (a vendor marked as a contractor), the project and villa, what it covers, **its works** (`labour_contract_lines` — a work from the Masters list at the rate book's unit and labour rate through the gated `work_labour_rate_facts`, or a lump sum) and **its terms** (copied from the default `work_order` text in Masters → Terms). Numbered `WO/<project>/NNN` by the database on insert (`wo_counters`; needs the project's short code). `pending_approval` until a bill approver approves (their approval limit applies); while it has works its value **is their sum** — a trigger writes it — and works, value and terms are permanent once approved. Correcting an approved order is switching it off and making a new one. **Templates** (`work_order_templates`): "Save as template" keeps an order's works and terms without quantities or rates; "Start from a template" fills a new one; switched off, never deleted. The rules are `lib/bills/work-orders.ts` (pure, tested); the print is `lib/bills/work-order-document.tsx`. `kind` on bills is explicit (`po`/`contract`/`nmr`) with CHECKs tying it to the anchors; `vendor_id` is nullable **for NMR only** — a contractor when one supplied the workers, nothing when the muster roll is paid directly.

## Things that will bite

- **The PO reference on a bill comes from `po_facts`, never an embedded `purchase_orders` join.** The embed silently nulls for `/bills`-only users, because RLS filters the joined row rather than erroring.
- **Transition updates carry no `.eq("status")` filter.** A stale button then gets `bills_guard`'s message instead of a silent zero-row "success". This is the PO lesson; don't reintroduce the filter as an optimisation.
- **`countBillsPipeline` is deliberately ungated** — it reads `bill_facts` only, because the Overview renders for everyone. It is the one exception to "every function opens `requireTool("/bills")`".
- **Bills is a leaf.** Nothing reads it except the fact views. Financial Management reads `bill_money_facts`, never these tables.

## Open

The PO-anchor picker in the record form ships every issued/completed PO in the payload. Move it to server-side search (the `/api/catalogue` pattern) once the PO list makes that noticeable.
