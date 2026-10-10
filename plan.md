# plan.md — the ERP corrections

The founder's team's "ERP Corrections and Clarifications", built by `[Opus]` 2026-10-08 → 10-10. The founder's ruling over all of it: **indent, PO and bill are one chain — everything a person would otherwise pick is derived from the step before.** Three earlier decisions were reversed on purpose (2026-10-08): bills have lines; Inventory carries rates, for `/inventory` holders only; labour logs carry piece-work quantities, never rupees on the phone. Set aside for later: `TODO.md`, _Next builds_.

Every rule this build made already lives in its tool's `PLAN.md` and in `SECURITY.md`; this file holds only what is still open. When the founder has vetted it and production has it, this file goes.

## Where it stands (2026-10-10)

**Merged to `staging` (PR #86), waiting for the founder's vet** — the checklist below. Fable review #2 was skipped on the founder's explicit word; in its place Opus re-reviewed `0110` and `0111` (one changed line against `0106`'s guard), re-ran the rolled-back RLS trials as single-grant people, swept the diff for admin or browser clients, ungated reads and missing loading states, and applied both to staging — `0001`–`0111` level, `db:check-views` clean. `0112` (B9's history) followed the same day; it was not Fable-reviewed either. **No Part B screen has been opened signed in**: the founder's vet is the first look.

| Step | What                                                             | Rules                                      | Proof (`scripts/trials/`)                             |
| ---- | ---------------------------------------------------------------- | ------------------------------------------ | ----------------------------------------------------- |
| A1–3 | Indents: the work's materials, Masters unit, still to buy, print | `indents/PLAN.md`                          | `takeoff-working-date.sql` (`0109`)                   |
| A4   | One search / filter / totals bar on every list                   | `DESIGN.md` (`list-toolbar`)               | —                                                     |
| A5   | Reporter: search, totals row, quick filters                      | `reporter/PLAN.md`                         | —                                                     |
| B1   | Companies and terms templates (`0101`)                           | `masters/PLAN.md`                          | `erp-chain.sql`                                       |
| B2–3 | PO discount, charges, GST split; PO from an indent (`0102`)      | `purchase-orders/PLAN.md`                  | `erp-chain.sql`                                       |
| B4   | The material rate rises with POs (`0103`)                        | `masters/PLAN.md`, `SECURITY.md`           | `erp-chain.sql`                                       |
| B5   | Labour log kinds (`0104`)                                        | `supervisors/PLAN.md`                      | `erp-chain.sql`                                       |
| B6   | Work orders (`0105`)                                             | `bills/PLAN.md`                            | `erp-chain.sql`                                       |
| B7   | Bill lines, Send to Bill, bill print (`0106`, `0111`)            | `bills/PLAN.md`                            | `bills-as-billing-team`, `bill-line-po-check`         |
| B8   | Payments, advances, the weekly cash request (`0107`)             | `bills/PLAN.md`                            | `payments-as-billing-team`                            |
| B9   | Store batches with rates (`0108`, history `0112`)                | `inventory/PLAN.md`                        | `batches-as-store-keeper`, `replay-pre-batch-history` |
| B10  | The off-estimate reason (`0104`, `0110`)                         | `supervisors/PLAN.md`, `estimator/PLAN.md` | dry run                                               |

## Before production

- **B9's question is answered by `0112`** (founder, 2026-10-10: "finish the database changes"): stock issued or removed before batches existed is replayed oldest-first, drawing only what existed at the time (`inventory/PLAN.md`). **Apply `0108` and `0112` in the same `db:apply` run** — the replay refuses if an issue recorded in between already drew the same batches. Kept or cleared on ship day, production's stock records come out right. Proof: `replay-pre-batch-history.sql` (and it fails with a figure wrong, or with the at-the-time rule removed).
- **`0107` backfills one payment per already-paid bill** — on production it runs once over the real paid bills, one row each (`bills/PLAN.md`).

## Verification — the founder, on staging

First, in **Estimator → Works**, give Footing (FD.15) its materials (M10 mix + steel), measure it on Plot 1's estimate and press **Make official**. In **Masters → Companies**, enter Goodearth's real details and set that company on the Saarang project (nothing is seeded — until then every print shows the placeholder letterhead and GST is reckoned against Kerala); **Masters → Terms** takes a default PO text and a default work order text. Then:

1. **Indents** → New indent on Plot 1, work Footing → Pull from estimate: cement, sand, jelly **and** steel appear, each in its Master unit (cement in bags). Request some, submit, approve. The indent shows "Remaining" per line; **Print** gives a clean page.
2. **Purchase Orders** → **From an indent** → pick it → cement to one vendor, steel to another → Create: two draft POs, everything filled in. On one: a 5% discount and ₹500 freight on a line — totals change as you type; a Kerala vendor shows CGST + SGST, an out-of-state vendor IGST. Edit the terms. Issue it; **Print**. In Masters → the material: its rate rose if the PO's was higher.
3. **Inventory** → Receive the PO into Farm Store: rate and GST arrive from the PO; change one rate — it shows "differs from PO". Issue some cement to Plot 1 / Footing: the batch is chosen for you, with its rate. Search and filter each Inventory list.
4. **Supervisors** (phone width) → Plot 1: log a day of NMR (2 masons, 3 helpers) and a piece-work quantity (Footing, 2 cum). Request a material that is not in the estimate — it asks why.
5. **Bills** → **Work orders**: make one for the contractor from a template, works from the list, print it, approve it. → **Labour**: tick the two logs → Send to Bill: an NMR bill (heads × day rates) and a PW bill against the work order (2 × ₹4,000 = ₹8,000). → A material bill from the PO: lines arrive from the PO. **Print** a bill — the contractor's name beside the number.
6. **Cash request** for this week: add the bills and a ₹10,000 advance, submit, release with one amount cut; record the payments — a bill shows "Part paid · pending". On the next bill, recover part of the advance. **Contractors** shows given / recovered / outstanding; **Payments** searches, filters and sums.
7. **Reporter** → any starter: type in the search box, see the totals row, use a quick filter.
8. As the **probe** (it holds `/inventory` and `/estimator`): Inventory rates are visible, and Site check shows site's reason; Bills, POs and payments are refused.
