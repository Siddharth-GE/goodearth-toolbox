# Kaadal Billing — the rules

Kritham Creations' vendor orders for the Kaadal interiors plots, and what has been paid on each, by Kaadal or by the client. Grant `/kaadal-billing` (its grant warning: every order and payment, and the vendors' bank details). Migration `0169`, staging only. It replaces the founder's "Kaadal Billing" page; its records came across from `Kaadal_Vendor_Payments_2026-10-28.xlsx` through `scripts/import-kaadal-billing.ts`.

## The founder decisions (2026-10-29, plan.md)

1. **In Interiors Operations, "exactly like this".** The page's five tabs — Orders, Payments, Plots, Vendors, Checks — its totals band, plot filter, search, New order, Record payment and Excel export, built in the toolbox's materials. The page's side drawer is a page of its own (an order, a vendor, a plot) under the tool's title.
2. **Its records came with it**: 13 vendors, 24 orders, 29 payments.

## Settled trade-offs

- **Vendors are the tool's own, not Masters'.** They are furniture and décor shops paid from this one ledger, added inline on New order, and their bank details are typed text that then stays inside this grant (Masters' `vendor_payment_details` is `/masters`, `/purchase-orders` and `/bills`). If these shops ever buy through Purchase Orders, they move to Masters and this table points at them.
- **Plots are the ledger's own labels** (`Plot 11`, `Plot 45-46`, `Site`), not Masters plots: the sheet groups two plots as one and bills the site itself. The five it started with are `BASE_PLOTS` in `ledger.ts`; a typed one ("45") becomes "Plot 45".
- **Edits and deletes are allowed, with Undo**, unlike Bills' payments (a reversal row): this ledger replaces a sheet and its team corrects in place. `audit_row` keeps every change and delete with who made it; the screen shows who changed a row last. Deleting an order takes its payments in one statement (0169's cascade, inside this tool, not the line chain); a vendor with orders can't be deleted.
- **Not scoped**: whoever holds the grant sees and edits the whole ledger.

## How it is built

- **The page's rules, ported exactly**, pure in `lib/kaadal-billing/ledger.ts` (figures, plot shares, totals, checks) and `rules.ts` (what is accepted, in the page's words), both tested. An order's net is its value less its deduction; a several-plot order splits by the plot values from the quote, else evenly; the deduction sits on its plot, or is shared by value; a payment is shared by each plot's net value, put on one plot, or split by amounts. Within half a rupee is settled.
- **The database holds the money rules too** (0169's guards): plot values on the order's own plots, every plot valued, adding up to the order value; a split payment's plots on its order, adding up to the payment to the paisa; a plot leaves an order only once no payment is marked for it; each plot once. So the Checks tab now finds only what deserves a second look — a payment with no date (one imported), one dated ahead, two of the same amount on one day, an overpaid order or plot share, a vendor owed money by transfer with no bank details.
- **Warnings ask "Save anyway"**: more than the order's balance, more than a plot's share, the same amount on the same day. Errors block. Every action re-runs `rules.ts` on a fresh read; the screen's checks are a convenience.
- **A new order value scales the plot values with it**; adding a plot clears them (they no longer fit), removing one keeps them only if they still add up.
- **One read per page**: `getLedger()` loads the whole ledger (hundreds of rows) and every tab works its figures out from it.
- **The Excel download** is the page's three sheets — Vendor Payment Summary, Payments, Plot-wise Summary — written by `writeWorkbookBytes`.
- **The data file** (`../kaadal-billing-data/`, outside the repo — it is public and the file holds bank account numbers) is what the import read. The import is re-runnable: every row's id is `md5('kaadal-billing:<key>')`, so a second run adds nothing. For production, run it once more with `--project pajfrgnkapicdgangjey` after 0169 is applied there, or carry staging's rows if the team has worked in it by then.

## Reads outside itself

Only `profiles` (names). Nothing reads this tool's tables.

## Open

Not in this build: attaching a vendor's invoice or a payment's receipt; Turing proposing payments (it reads the tables already, as every admin's table); a vendor statement as a PDF.
