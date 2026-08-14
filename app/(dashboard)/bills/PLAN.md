# Bills — the rules

**Shipped 2026-08-04.** Migrations `0025` + `0026`.

The accounts-facing record of what Goodearth owes and has paid. A bill is one of **three kinds** — against an issued purchase order, against an **approved** labour contract, or **NMR (daily wages)** with no anchor at all — numbered `BILL/<project>/<plot-or-unit-or-GEN>/NNN`, moving recorded → approved → paid, with send-back carrying a mandatory note.

**A bill has no line items, by founder decision.** The paper invoice's figures are the record.

_Trimmed 2026-08-14: the milestone log lives in git._

## The rules everything rests on

1. **The status machine lives in the database** (`bills_guard`): recorded → approved → paid, send-back approved → recorded with a mandatory note that the next approval clears. Header and amount edits only while recorded; anchor, vendor, scope and number permanent. `lib/bills/workflow.ts` mirrors it **for buttons only**.
2. **Approvers are a named list** (`bill_approvers`, managed in **Settings** beside indent approvers; admins always may). **Self-approval is allowed** — founder decision. The same list approves labour contracts.
3. **Amounts are stored as entered** from the paper invoice — taxable/GST/total are the vendor's figures, never computed, with no total-equals-sum CHECK. Over-billing against the PO value or contract value **warns, never blocks**.
4. **Money is gated.** SELECT on `bills` requires `/bills`. Two windows exist: `bill_facts` (money-free, open — Overview counts) and `po_billing_totals` (one ordered/billed total per PO, WHERE-gated to `/purchase-orders` OR `/bills`). **Never a second SELECT policy.** _(`0055` widened the `bills` qual to admit `/reporter`; `0058` added `bill_money_facts` for Financial Management. Both are owner-view or widened-qual, never a second policy.)_
5. **The mint derives everything from the anchor.** `create_bill()` reads the money-free `po_facts` — a `/bills`-only user cannot read the PO tables — or the contract row, copies project/plot/unit/vendor, resolves the scope, and mints via `bill_counters`. **Deliberately no vendor-inactive check**: a real invoice from a deactivated vendor still enters the books, and the contract's own `is_active` is the off-switch.
6. **Labour contracts belong to Bills**, not Masters (`0026` moved them on the founder's correction). Created at `/bills/contracts` by any `/bills` holder, `pending_approval` until a decider approves, terms permanent after. `kind` on bills is explicit (`po`/`contract`/`nmr`) with CHECKs tying it to the anchors; `vendor_id` is nullable **for NMR only** — a contractor when one supplied the workers, nothing when the muster roll is paid directly.

## Things that will bite

- **The PO reference on a bill comes from `po_facts`, never an embedded `purchase_orders` join.** The embed silently nulls for `/bills`-only users, because RLS filters the joined row rather than erroring.
- **Transition updates carry no `.eq("status")` filter.** A stale button then gets `bills_guard`'s message instead of a silent zero-row "success". This is the PO lesson; don't reintroduce the filter as an optimisation.
- **`countBillsPipeline` is deliberately ungated** — it reads `bill_facts` only, because the Overview renders for everyone. It is the one exception to "every function opens `requireTool("/bills")`".
- **Bills is a leaf.** Nothing reads it except the fact views. Financial Management reads `bill_money_facts`, never these tables.

## Open

The PO-anchor picker in the record form ships every issued/completed PO in the payload. Move it to server-side search (the `/api/catalogue` pattern) once the PO list makes that noticeable.
