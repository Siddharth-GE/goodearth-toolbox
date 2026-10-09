# plan.md — the ERP corrections

**Owner tags** per `MODELS.md`. The founder put Opus in the chair for this plan and the build (2026-10-08); `[Fable]` marks the two review sessions the founder asked for. Branch `feature/erp-corrections` (off `feature/masters`, whose three commits are not on `staging` yet — they go with this branch). Tick each step here as it lands.

## Where the build stands — read this first (handover, 2026-10-09)

**The founder asked on 2026-10-09 for the whole of Part B to be built, then Fable review #2, then staging.** B1 and `0109` landed on 2026-10-08; B2–B7 and B10 on 2026-10-09 (ticked and noted below). The next step not ticked is where to start.

**Done, committed and pushed** on `feature/erp-corrections` (nothing merged, nothing on `staging`):

- Docs leaned; this plan written with the founder's answers.
- **Part A, all of it** (A1–A6, ticked below). No migration needed; it runs on the branch's Vercel preview today. Not yet seen signed-in by anyone — the founder's checklist for it is the first block of _Verification_ below, steps 1 and 7, plus every list's search bar and the Adjustments sentence.
- **Part B migrations `0101`–`0108` reviewed by Fable (review #1, 2026-10-08) and APPLIED TO STAGING**, ledger level, types regenerated and committed, `db:check-views` clean (19 views, 8 money views each behind its own WHERE). Proof, re-runnable: `npx tsx scripts/dry-run-migrations.ts --project ipstebqawrvhkyntctrv supabase/migrations/010[1-8]*.sql --trial scripts/trials/erp-chain.sql` prints OK — every statement, every assert, 17/17 behaviour checks, nothing kept.
- **What review #1 changed in the migrations** (each proved by a trial step): `0104` the billed-log guard refused the un-stamp `delete_recorded_bill` needs, so a recorded labour bill could never be deleted — now the fence lets the stamp move, and nothing else; `0105` the work-order guard had reverted to 0026's version, losing 0034's role approvers and approval limits — restored; `0107` `is_bill_approver()` now uses `can_approve_bills()`; `bills_guard` carries 0034 forward plus two rules — **approved → paid only once payments + recoveries reach the total**, and approved → recorded refused once money has gone out; a cash request takes only approved bills; `0108` receipt lines, issue lines and adjustments are immutable (a rewritten quantity would leave `batch_on_hand` wrong forever; 0023's rule, now enforced).
- **B1 (Companies and Terms in Masters, the letterhead printing the project's company on the indent and PO)** and **`0109` (the working estimate's date, and the pull screen's amber notice — applied to staging, trial `scripts/trials/takeoff-working-date.sql`)**. B1's preview built; neither has been seen signed-in.
- **Part B's pure logic, tested and committed:** `lib/line-money.ts` (the line formula POs and bills share — discount, GST split by vendor state, other charges), `lib/purchase-orders/math.ts` rebuilt on it, `lib/bills/math.ts` (bill roll-up rounded as the database stores it; pending), `lib/bills/ledger.ts` (the cash request's week; a contractor's position), `lib/inventory/batches.ts` (batch names; the oldest-first preview; issue value). Shared PDF blocks in `lib/pdf/document.tsx` (heading, details band, notes, signatures).

**Next, in order:**

1. ✅ **`[Fable]` review #1** — done 2026-10-08; the answers are under _Questions for the tier above_. **Consequences for Opus in Part B:** `markBillPaid` is now refused by the database until B8 replaces it with "Record payment" (the marks-paid trigger is the only path to `paid`); `deleteBill` must call `delete_recorded_bill` once bills have lines (B7); the cash-request screen lists approved bills only; the trial runs as the founder's staging account, which is a staff account with four grants, so it grants itself `/bills` and an approver row inside the rolled-back transaction.
2. **`[Opus]` Part B screens**, B8 → B9 (B1–B7 and B10 done), against the applied schema, ticking each below. The pure modules above are ready to wire in.
3. **`[Opus]` B11 docs** — SECURITY, STATUS's contract table, the tool PLANs, TODO.
4. **`[Fable]` review #2**, then a PR → `staging` (CI runs on pull requests only; its `db:check` stays red until the migrations are on staging), then the founder's vet.

**Waiting on the founder:** their staging account holds only `/indents`, `/project-management`, `/purchase-orders` and `/reporter`, and no account that can sign in there is an admin — so they cannot open Masters (B1), Bills, Inventory, Supervisors or the Estimator to vet this build. Asked 2026-10-08 whether to grant them those five on staging by SQL; no answer yet. Ask again before pointing them at any of those screens.

**Traps this build already hit:** patching a file with `String.replace` in a `node -e` one-liner turns `$$` into `$` (it broke two migrations' dollar quotes) — use the Edit tool or split/join. Long `node -e` and heredoc patches through bash break on quoting — write the patch to a file (and a regex inside a quoted heredoc patch still lost its backslashes once — use the Edit tool for those). A scratch script outside the repo needs `NODE_PATH=<repo>/node_modules`; there is no PDF-to-image tool here, so a print is checked by reading its text runs, not by looking at it. Staging's rate book has no materials on any work (`TODO.md` item 5), so estimate pulls are empty until someone enters them: expected, not a bug.

## Context

The founder's team reviewed the purchase-to-payment chain on staging and sent "ERP Corrections and Clarifications" (Supervisor, Indent, PO, Work Order, Inventory, Bills, Reporter, Master). The founder's ruling over all of it: **indent, PO and bill are one chain — everything a person would otherwise pick is derived from the step before.** You don't make a PO, you pick an indent and go; company, project, location, work, material, unit and rate all come along.

Three of the asks reverse earlier founder decisions, deliberately, on 2026-10-08:

- **Bills get lines** (was: "a bill has no lines"). Material bills itemise the PO's materials; labour bills itemise the labour log. Totals are calculated.
- **Inventory carries money for `/inventory` holders** (was: "no money anywhere in this tool"). Receipts carry rate, GST and amount from the PO; issues carry the rate of the batch they came from. Store-keepers see them.
- **Labour logs carry piece-work quantities** (was: "heads, never wages"). Still no rupees on the supervisor's phone — the rates are entered by the billing team.

## Founder decisions (2026-10-08 — settled, not re-opened in the build)

| Topic                   | Decision                                                                                                                                                                                                                                            |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Store prices            | Everyone holding `/inventory` sees and works with rates; nobody else (stock quantities stay open to all signed-in).                                                                                                                                 |
| Bills                   | Itemised lines; totals calculated. Material bill lines pre-fill from the PO, labour bill lines from the labour log.                                                                                                                                 |
| Labour log              | Supervisor logs NMR (masons / helpers / others) or PW (lump sum, or quantity done in the work's unit). The **billing team** ticks logs and presses **Send to Bill**.                                                                                |
| NMR amount              | Day rate per trade (mason, helper, other) for that contractor, last bill's rates suggested; heads × rate calculated; total can be overwritten with a note.                                                                                          |
| Work orders             | **Labour contracts become Work Orders** — works picked from the Master list (qty × labour rate, or lump sum), terms from a reusable template, numbered and printable. PW bills are raised against a work order.                                     |
| Payments                | **Weekly cash request → release → pay.** Accounts lists bills (and advances) for the week; a **bill approver** releases it, cutting amounts if they choose; payments are recorded per bill, part-payments allowed. Every bill shows paid / pending. |
| Advances                | Recorded against a contractor (optionally a work order); recovered by deduction when a later bill is paid. An advance summary shows given / recovered / outstanding.                                                                                |
| Bill number             | Keep `BILL/<project>/<scope>/NNN`; show the vendor or contractor's name beside it everywhere, print included.                                                                                                                                       |
| Indent → PO             | Pick an approved indent from a list in POs → its remaining lines appear → a vendor per line (the last vendor for that material suggested) → **Create** makes one draft PO per vendor.                                                               |
| PO tax                  | Vendor's GST state = company's state → CGST + SGST (half each); otherwise IGST. Discount (% or ₹) and other charges **per line**. Everything calculated.                                                                                            |
| Company                 | Derived, never picked: a small Companies list in Masters, each project belongs to one; every document shows its project's company.                                                                                                                  |
| Budget rate             | A material's Master rate **rises automatically, never falls** — when a PO is issued at a higher rate (before GST, after discount, in the item's own unit). Logged. Masters can lower it by hand. Official estimates stay frozen.                    |
| Off-estimate requests   | Allowed with a reason. Estimate materials for the chosen work are listed first; "Something not in the estimate" opens the catalogue and asks why.                                                                                                   |
| Batches                 | Every store receipt line is a batch. An issue takes the oldest batch first; the store-keeper can switch batch. The issue's rate comes from the batch.                                                                                               |
| Receipt rate            | From the PO, editable if the delivery bill differs — a difference is flagged for accounts.                                                                                                                                                          |
| Search / filter / total | One bar on every list (Bills, Payments, Work orders, POs, Indents, every Inventory list) **and** in Reporter: type-to-search, quick filters on top (date range, project, villa, vendor), a totals row under every money and quantity column.        |
| Rollout                 | One branch, all of it; the founder vets it on staging together.                                                                                                                                                                                     |
| Review                  | Fable reviews before staging (how: _Order of work_ below).                                                                                                                                                                                          |

**Set aside by the founder, planned later:** subprojects, the works schedule (Gantt and cash flow — "I don't like Gantt"), drawing requests. Nothing in this build touches them.

## The PDF's "clarify" items — the answers

- **Material requests and site checks.** A supervisor's request names a villa, a work and a material → the store issues it → the issue counts against that villa's **official** estimate for that work → the Estimator's **Site check** lists anything drawn past the estimate ("over") or never estimated ("outside"), and the estimator approves it there. An off-estimate request now carries its reason, which Site check shows beside the row.
- **"Only cement appears" (Indent 1).** Two causes. (a) Footing's measurements were on the villa's _working_ estimate and never made official; Indents reads only the official copy. (b) The indent ignored the work picked on it and listed every material on the villa's estimate. Fixed by (b) filtering to the indent's work and (a) a notice when the working estimate has changed since the last official. **And staging's rate book has no materials on any work today** (the 2026-10-07 clear-out took them — `TODO.md` item 5); until a person enters them, no estimate carries materials anywhere.
- **Cement in cft (Indent 5).** A frozen estimate row from before materials became items (`0086`) carried the old material's unit. An indent line now always takes the material's Master unit, and the estimate's figure is shown converted, or flagged when it can't be.
- **The demo request under Villa 1 – Footing (Indent 4).** It was cleared with every other staging record on 2026-10-07. Nothing to do.
- **Adjustments (Inventory 4).** A signed correction to one store's stock with a mandatory reason: opening stock (+), a found box (+), breakage or a recount (−). Never for a wrong delivery or issue amount on a PO — those are fixed on the receipt. The screen will say this in one sentence above the form.

## Order of work

The money/permission migrations may be **drafted** by Opus but reach `db:apply` only after a Fable review (`MODELS.md`), and the screens can't be opened until the migrations are on staging. So:

1. **Opus builds Part A** (no migration) and **drafts every migration of Part B**.
2. **`[Fable]` review #1** — the migrations only: RLS, views, definer functions, money confinement. Fable applies them to staging (or tells Opus to) and regenerates types.
3. **Opus builds Part B's screens** against staging, opening every page.
4. **`[Fable]` review #2** — the full diff against this plan, `SECURITY.md` and `BUGCATCHER.md`; the merge to `staging`.
5. **The founder vets on staging** (the checklist at the end). Production waits for production to be restored and the founder's word.

---

## Part A — no migration

### A1. ✅ `[Opus]` Indents: the estimate pull follows the indent's work

- `getEstimatePull` (`lib/indents/queries.ts`) takes the indent's `work_item_id`; when set, only that work's takeoff rows are offered, with a "Show every work on this villa" toggle (`?all=1`). "Already requested" stays villa-wide by item (the double-buy rule is unchanged). Grouping stays `groupEstimatePull`; add a work filter to the pure layer with tests.
- **Which estimate it is reading, always said:** "From EST/SAA/004, made official 3 Oct. Changes the QS makes after that show here only once they make it official again." (`reference` and `submitted_at` are already in `estimate_takeoff_facts`; no new read.) A sharper "the working estimate has changed since" notice needs the working estimate's date across the boundary — a question for Fable #1 below.
- An empty pull says why: "The official estimate has no materials for Footing — FD.15. The QS adds them in Estimator → Works."

### A2. ✅ `[Opus]` A material moves in its Master unit, always

Found 2026-10-08 (founder: "did you see that unit change issue?"): besides the old frozen row, two live paths let a material leave its Master unit — the indent line grid's unit picker accepted any unit (cement → cft), and that unit then rode onto the PO, the receipt and stock, which sums quantities whatever their unit; and `recordStockAdjustment` saved the unit the browser sent.

- **Indent lines from the estimate or a direct pick carry `items.default_uom` and nothing else**: the line grid shows the unit as text (no picker), and `updateLine` ignores any unit for those lines, re-reading the item's. Budget-pulled (interiors) lines keep the selection's unit — a tile can be specified per sqft — and their picker.
- **Adjustments** re-read the item's `default_uom` on the server; the browser's unit is ignored.
- The pull basket shows the estimate's figure in the Master unit when the units match or convert, else "estimate says 100 cft — enter in bag" (`needs_qty`, already classified).
- POs and receipts already copy the unit from the line before them, so the chain holds once the indent does. Lines already saved in another unit (production) are listed for a person on ship day — `scripts/report-unit-mismatches.ts --project <ref>`, read-only.

### A3. ✅ `[Opus]` Indents: remaining to buy, and print

- Each line shows **Remaining = requested − ordered** (non-cancelled POs, `po_line_facts`, already read) beside "ordered X of Y"; the indent header shows "N lines still to buy"; the list shows a Remaining column.
- **Print**: `app/(dashboard)/indents/[indentId]/pdf/route.ts` + `lib/indents/indent-document.tsx` on `lib/pdf/document.tsx` — company, project, villa, work, number, status, lines (code, material, unit, requested, ordered, remaining), requested/approved by. No money. A Print button on the indent page.

### A4. ✅ `[Opus]` One search / filter / total bar

- `components/ui/list-toolbar.tsx` — a GET form: search box (`q`), date range (`from`, `to`), and the filter selects a list passes in (project, villa, vendor, status…); `components/ui/table.tsx` gains a `TotalsRow`. This is the shared filter toolbar `DESIGN.md` reserved for the third copy — there are now nine.
- Applied in Part A to: Indents list, POs list, Bills list (search on number, invoice no., vendor; totals of taxable / GST / total over **all matched rows**, not the page — computed in the query), Inventory receipts, issues, adjustments, stock, requests. Each query takes the filters server-side; "N of M" from a real count.
- Payments and Work orders get the same bar when they are built (B5, B6).

### A5. ✅ `[Opus]` Reporter: search, totals, quick filters

- A search box over the **result table** (filters the shaped rows in the browser — not a filter in the spec, so founder decision #4, pickers-only filters, stands and `PLAN.md` says why the search is different).
- A totals row under every summable column even without grouping (the aggregate already computes the grand total; show it).
- Quick filters above the builder: date range, project, villa, vendor — each writes an ordinary picker filter into the spec, shown only when the dataset has that field.

### A6. ✅ `[Opus]` Small ones

- Bills: the vendor/contractor name beside every bill number (list, detail, print).
- Inventory → Adjustments: the one-sentence purpose above the form (_clarify_ answer above).
- Supervisors: the request form lists the work's estimate materials first, with the empty-estimate sentence from A1 when there are none.

---

## Part B — the chain (migrations `0101`–`0108`, Fable review #1 before any is applied)

**Status (2026-10-08): all eight drafted and committed, NOT applied.** Run together on staging inside a transaction that always aborts: every statement and every migration's own asserts pass, and a behaviour trial (`git show` this commit's message) passed 11 of 11 — PO issue raises the Masters rate net of discount; receipts copy the PO's net rate; an issue of 40 takes 30 from the older batch and 10 from the newer; a breakage draws from what is left; a bill line of 2 × ₹4,000 makes the header ₹8,000; a ₹5,000 part-payment leaves the bill approved, ₹4,000 more is refused, an advance recovery plus ₹2,000 marks it paid; piece-work needs a quantity; a log cannot be billed outside Send to Bill; a work order is numbered WO/SAA/… and its lines set its value. Staging was checked unchanged afterwards. **Waiting for Fable review #1.**

Every migration: re-runnable, additive, ends asserting what it claimed, RLS on every new table, one SELECT policy per table, revokes on every new view (`anon, authenticated`) and function (`public, anon`), manifest row for every new view, `db:check-views` clean. Every new cross-tool write is added to `SECURITY.md`'s list; every new cross-tool read to `STATUS.md`'s contract table.

### B1. ✅ `[Opus]` Companies and terms templates — `0101_companies_and_terms.sql`

_Landed 2026-10-08:_ Masters → Companies and Masters → Terms (list + dialog each; one default per kind, saved flag-down first so a name clash never clears the old default), a Company picker on the project form and a Company column on the list, and the letterhead printing the project's company on the indent and PO (bills and work orders pass it in B6/B7). Select strings run against staging; the letterhead's text checked in a rendered sample. **The founder's staging account holds no `/masters`**, so they can't open these screens until it is granted.

- `companies` (Masters, reads open, writes `/masters`): `name`, `legal_name`, `address`, `gstin`, `state` (default `'Kerala'`), `phone`, `email`. `projects.company_id` nullable FK. **No seed** — the founder enters Goodearth's real details in Masters (never invented — `PRODUCT.md`); every print shows the placeholder letterhead until they do.
- `document_terms` (Masters): `kind` (`po` | `work_order`), `name`, `body`, `is_default` (one default per kind, partial unique index). Masters → Terms screen to edit them.
- `lib/pdf/document.tsx`'s letterhead takes a `company` prop; POs, bills, work orders and indents pass their project's company.
- Masters screens: Companies (list + form), Terms (list + form), a Company picker on the project form.

### B2. ✅ `[Opus]` PO lines: discount, other charges, tax split — `0102_po_line_charges.sql`

_Landed 2026-10-09:_ each line takes a discount (% or ₹ toggle) and other charges, saved on blur and checked by `lineChargesProblem` before the database's CHECKs; the amount cell shows before-tax, GST and other beneath the total; the totals box and the print share `summaryRows` (CGST/SGST per slab, or IGST). The header shows company, project, location and date; terms are a multi-line box with "Use template…", and a new PO starts from the default template. Invoiced per line reads `po_line_billing_facts`. The print carries code, material (category, description, line note), indent and work, discount, taxable, GST, other and amount; "Invoiced" only once something is billed. Select strings run against staging (no POs there to open — wiped 2026-10-07); the print's text checked in two rendered samples (in-state and out-of-state); the grid and header screenshotted from a throwaway probe at 1440px and phone width. Not seen signed-in.

- `purchase_order_lines` + `discount_pct numeric` / `discount_amount numeric` (one or the other — CHECK), `other_charges numeric`. Nothing new stored for CGST/SGST/IGST: **derived** from the vendor's `gst_state` against the project's company `state` (a vendor with no state is treated as same-state, with an amber "vendor's GST state not set — assumed Kerala" on the PO).
- `lib/purchase-orders/math.ts` (pure, tested): `taxable = qty × rate − discount`; `gst = taxable × gst_pct`; split into CGST/SGST halves or IGST; `line total = taxable + gst + other_charges` (other charges are added after tax, as vendors bill freight; a taxed charge is entered as its own line). `rollUpPo` gains discount, other charges, CGST/SGST/IGST totals. Null is not zero.
- **The PO screen shows every field the PDF lists** — date, company, project, location (villa or General, plus delivery store/site), indent no. per line, PO no., vendor, material code, description, category, **work** (the indent's work, derived through `indent_line_id`), unit, rate, ordered qty, **invoice qty** (billed so far, from bill lines — B7), subtotal, CGST, SGST, IGST, GST total, discount % / ₹, other charges, total, expected delivery, terms, remarks (header note + line note). The PDF prints the same.
- **Terms**: a new PO's `terms` is pre-filled from the default `po` template; the field becomes "Terms and conditions" (multi-line), editable while draft; "Use template…" replaces it.
- `po_line_facts` (money-free) is unchanged.

### B3. ✅ `[Opus]` PO from an indent

_Landed 2026-10-09:_ `/purchase-orders/from-indent` (approved indents with lines left, searchable) → `/purchase-orders/from-indent/[indentId]` (every line ticked, vendor suggested from the last **issued** PO of that item with that vendor's rate and GST; "one vendor for every ticked line"; the foot bar says "3 lines → 2 draft POs"). `createPosFromIndent` makes one draft per vendor through `create_purchase_order`, lines row by row with rate and GST; lands on the first PO, whose page names the others (`?made=`). Rules pure and tested in `lib/purchase-orders/from-indent.ts`. Select strings run against staging (no indents there); the form screenshotted from a probe. Not seen signed-in.

- `/purchase-orders/from-indent` — the approved indents with anything left to buy (project, villa, work, number, lines remaining), searchable. The POs welcome and list get a **"From an indent"** primary button; "New PO (direct)" stays for bulk/urgent buys.
- `/purchase-orders/from-indent/[indentId]` — every remaining line: material, unit, remaining qty (editable down), **vendor per line** (suggested: the last vendor that line's item was bought from on a non-cancelled PO), **rate suggested** from that vendor's last PO rate for the item. **Create** → one draft PO per vendor, scope from the indent (unit/plot), delivery defaulting to the villa's site, terms from the default template, lines added through the existing `addPoolLines` path (row by row, partial success reported). Lands on the first PO, with the others linked.
- No new table: `createPosFromIndent` in `lib/purchase-orders/actions.ts` calls `create_purchase_order` per vendor.

### B4. ✅ `[Opus]` The budget rate rises with POs — `0103_item_rate_from_po.sql`

_Landed 2026-10-09:_ the trigger was already on staging (proved in review #1's trial). Masters → Items shows the newest rise under each price — "Raised from ₹345 by PO/… · date" — from `item_price_changes` (gated) with the PO number from `po_facts` (`lib/masters/item-price-changes.ts`); there is no per-item page, so the list carries it. The item form says the rate rises by itself and may be lowered by hand. Select strings run against staging.

- On a PO's `draft → issued`, an AFTER trigger (security definer, execute revoked from `anon, authenticated`) raises `items.indicative_price` to the line's net unit rate (`rate − discount per unit`, before GST) when that is higher **and the line's unit is the item's `default_uom`**; writes `item_price_changes` (item, old, new, po_id, at). Never lowers.
- `item_price_changes`: SELECT `/masters` or `/purchase-orders`; no client writes. Masters → item page shows "Rate raised from ₹345 to ₹360 by PO/…".
- **A cross-tool write (PO → Masters)** — added to `SECURITY.md`. **Consequence stated for Fable:** `indicative_price` is readable by every signed-in person, so the highest price paid for each material becomes visible to all. The founder chose this rate for budgeting; Fable confirms or proposes a gated budget rate.
- Working estimates follow the new rate on next render; official estimates are frozen.

### B5. ✅ `[Opus]` Labour log kinds — `0104_labour_log_kinds.sql`

_Landed 2026-10-09:_ the log dialog asks "How is this paid?" — daily wages (heads), piece-work by quantity (in the work's unit, read from `work_unit_facts` on the server; the box is disabled with a sentence when the work has no unit), or a lump sum (what was done). `lib/supervisors/labour.ts` holds the shapes (pure, tested); the actions clear the other kinds' fields. The villa page reads each log by its kind, and a billed log shows "Billed · BILL/…" (from `bill_facts`) instead of Edit and Delete. Select strings run against staging. The dialog was not screenshotted (it opens on a press).

- `labour_logs` + `kind` (`nmr` | `pw_lump` | `pw_qty`, default `nmr` so existing rows read as NMR), `quantity numeric`, `uom` (FK `uoms`), `description text`, `bill_id uuid` (FK `bills`, set when sent). CHECKs: `nmr` → heads > 0, no quantity; `pw_qty` → quantity > 0 and uom; `pw_lump` → description. Unique key widens to `(plot, work, contractor, date, kind)`.
- **Bills reads and stamps them:** the existing SELECT qual widens to `has_app('/supervisors') or has_app('/bills')` (one policy); the stamp goes only through B7's definer function. A sent log is frozen (guard trigger: no edit or delete once `bill_id` is set).
- **The work's unit on a phone:** new money-free view `work_unit_facts (work_item_id, uom)` over `estimator_work_info`, open to signed-in, write-revoked, in the manifest — the supervisor's PW form shows "2 cum".
- Supervisors form: a three-way choice (Daily wages / Piece-work by quantity / Piece-work lump sum); quantity in the work's unit; no rupees. A sent log shows "Billed · BILL/…".

### B6. ✅ `[Opus]` Work orders — `0105_work_orders.sql`

_Landed 2026-10-09:_ `/bills/work-orders` (search, project / contractor / status filters, value and billed totals over every match), `/new` and `/[id]` sharing one editor (`WorkOrderEditor`: contractor, project fixed once made, villa, covers, works from the Masters list with the rate book's unit and labour rate offered, lump sums, terms from the default `work_order` text, "Start from a template"), `/[id]/pdf` (`lib/bills/work-order-document.tsx`, DRAFT until approved), `/templates` (Save as template on an order; switch off, never delete). Saving a pending order puts the new works in before taking the old out. `/bills/contracts` forwards to work orders; the old contract dialog and its actions are gone; every "labour contract" on screen reads "work order", and a bill's "Against" shows the WO number. Rules pure and tested (`lib/bills/work-orders.ts`). Select strings run against staging; the editor screenshotted from a probe; the print's text read from a sample.

- `labour_contracts` stays the table (Bills' anchor; history intact) and becomes **Work orders** on every screen: + `wo_no`, `reference` (`WO/<project>/NNN`, minted like bills via a `wo_counters` table), `terms text`, `company`-derived print.
- `labour_contract_lines`: `work_item_id`, `description`, `uom`, `quantity` (null for lump sum), `rate`, `is_lump_sum`, `amount` derived. `contract_value` becomes the lines' sum, written by the action and checked by a trigger once lines exist (older contracts keep their typed value). Lines editable only while `pending_approval` (same guard as the terms).
- **Works from the Master list**: the work picker (grouped by category); rate suggested from the rate book's labour rate through a new **gated** view `work_labour_rate_facts (work_item_id, uom, labour_rate)`, WHERE `has_app('/bills') or has_app('/estimator')`, in the manifest — a money view, Fable's call.
- **Templates**: `work_order_templates` (`name`, `terms`) + `work_order_template_lines` (work, description, lump-sum flag, no quantities). "Start from template" on a new work order; "Save as template" on any. A few standard ones are made by the founder on staging, not seeded.
- Print: `lib/bills/work-order-document.tsx` — company letterhead, WO number, contractor, project, villa, lines, total, terms, signatures.
- Approval unchanged (bill approvers). The bills list's contract filter and the bill form's "Against" read "Work order".

### B7. ✅ `[Opus]` Itemised bills — `0106_bill_lines.sql` (+ `0111`, drafted)

_Landed 2026-10-09:_ the bill page edits a recorded bill's lines (`BillLinesEditor`: quantity, rate, GST, ₹ discount, other charges; "Add the PO's materials still to bill", "Add the work order's works", "Add a line"); the header shows the lines' sums; a daily-wages bill's total can be set by hand with a reason; a bill made from labour keeps its lines and quantities. `/bills/new` loads the PO's or work order's lines into the same editor (kind, vendor and anchor in the address) and records header and lines together (`createBillWithLines`). `/bills/labour` is Send to Bill (day rates suggested from the contractor's last bill; piece-work rates from the work order, else the rate book). Deleting goes through `delete_recorded_bill`. `/bills/[id]/pdf` prints. Rules pure and tested (`lines.ts`, `labour-billing.ts`). The old typed-amount `createBill` / `createNmrBill` are gone. **Found while building: `0106`'s `bill_lines_guard` refused every material line to a `/bills`-only person** (it read `purchase_order_lines` as the person); `0111_bill_lines_guard_reads_billing_facts.sql` fixes it — **drafted, proved, NOT applied** (`scripts/trials/bill-line-po-check.sql`: refused without it, accepted with it). `scripts/trials/bills-as-billing-team.sql` runs every B7 write as a `/bills`-only person under RLS — OK with `0110`+`0111`. Select strings run against staging; the editor and Send to Bill screenshotted from a probe.

- `bill_lines`: `bill_id`, `line_kind` (`material` | `nmr` | `pw_qty` | `pw_lump` | `other`), `po_line_id`, `item_id`, `labour_log_id`, `work_item_id`, `description`, `uom`, `quantity`, `rate`, `gst_pct`, `discount_amount`, `other_charges`, `note`. RLS = `bills`' quals (`/bills`, widened for `/reporter` like `bills`). Editable only while the bill is `recorded`.
- **Header totals stay stored** (every money view reads them): for a bill with lines, the action recomputes `taxable_amount`, `gst_amount`, `total_amount` from `lib/bills/math.ts` (pure, tested — same formula as the PO) on every line save, and a trigger refuses a header total that disagrees with its lines, **except an NMR bill's total overwritten with a note** (`total_override_note`). Bills without lines (history) keep their typed amounts.
- **Material bill from a PO**: pick the PO (search, the `/api/catalogue` pattern the PLAN asked for) → lines pre-fill from the PO's lines with quantity = received − already billed, rate / GST / discount / charges from the PO; invoice qty and rate editable to match the vendor's invoice. Bills can't read PO money, so: new view `po_line_billing_facts` (po_line_id, item, uom, ordered, received, billed, rate, gst_pct, discount, other_charges), WHERE `has_app('/purchase-orders') or has_app('/bills')` — the second sanctioned PO↔Bills window beside `po_billing_totals`; Fable's call.
- **Send to Bill** (`/bills/labour`): unbilled labour logs, filtered by project, villa, contractor and dates, ticked → `send_labour_logs_to_bill(log_ids, …)` (security definer, checks `has_app('/bills')` in its body) creates the bill and its lines and stamps each log's `bill_id`, in one transaction:
  - NMR → one NMR bill; lines per trade (masons × mason day rate…), rates suggested from the contractor's last NMR bill.
  - PW → a `contract` bill against the contractor's approved work order for that project (required; if none, the screen offers "Make a work order" pre-filled with the logged works); a quantity line's rate from the work order's line for that work, else the rate book; a lump-sum line's rate typed.
- **Invoice qty on the PO** (B2) = `bill_lines.quantity` per `po_line_id`, through `po_line_billing_facts`.
- **Auto calculation everywhere**: qty × rate shown live, totals live (2 cum × ₹4,000 = ₹8,000).
- **Print**: `lib/bills/bill-document.tsx` — company, bill no. + vendor name, project, villa, work, lines, totals, paid / pending.

### B8. ☐ `[Opus]` Payments, advances and the weekly cash request — `0107_payments.sql`

- `bill_payments`: `bill_id`, `amount > 0`, `paid_on`, `payment_ref`, `cash_request_item_id`, `advance_recovered numeric default 0`. `contractor_advances`: `vendor_id`, `project_id`, `labour_contract_id?`, `amount`, `paid_on`, `payment_ref`, `note`, `cash_request_item_id?`. `advance_recoveries`: `advance_id`, `bill_payment_id`, `amount`. `cash_requests`: `week_of` (Monday), `status` draft → submitted → released → closed, `released_by/at`, `note`. `cash_request_items`: `cash_request_id`, `bill_id` **or** advance (`vendor_id`, `project_id`, `labour_contract_id?`), `requested_amount`, `released_amount`.
- All `/bills`-gated on SELECT (and the widened `/reporter` qual, as `bills`); writes `/bills`; release only by a bill approver or admin (checked in the guard, like `bills_guard`). Payments refuse more than the bill's pending balance; a recovery refuses more than the advance's outstanding.
- **A bill's paid state is derived**: the bills guard sets `status = 'paid'` when payments + recoveries reach `total_amount` (a trigger on `bill_payments`), and the screens show "Part paid ₹1,00,000 · pending ₹50,000". `markBillPaid` becomes "Record payment" (amount defaults to the pending balance). **Backfill**: every bill already `paid` gets one `bill_payments` row of `total_amount` on `paid_at` with its `payment_ref`, so history reads right. `bill_money_facts` and `po_billing_totals` keep their columns (Financial Management unchanged); a `paid_amount` column for FM is a later, separate view change.
- Screens (Bills tabs): **Cash requests** (this week's: approved bills with pending balances + open advances, pick amounts, submit; approver releases or cuts; then record each payment), **Payments** (every payment and advance, with the A4 bar: search, filters, sum), **Contractors** (per contractor: bills, paid, pending, advances given / recovered / outstanding — the "advance summary"). The ₹25 lakh billed / ₹20 lakh released example reads directly: the week's request shows ₹5 lakh still pending.

### B9. ☐ `[Opus]` Store batches with rates — `0108_inventory_batches.sql`

- **A batch is a store receipt line** (`goods_receipt_lines` where the receipt has a store). Its id is shown as `GRN/SAA/012-1` (receipt reference + line number) — derived, nothing new stored. Direct-to-site deliveries are used where they land and are not batches.
- `goods_receipt_line_rates` (`receipt_line_id` PK, `rate`, `gst_pct`, `po_rate`, `po_gst_pct`, `note`) — SELECT `has_app('/inventory')` (plus `/purchase-orders`, `/bills`, `/reporter`), writes `/inventory`. Filled by an AFTER INSERT trigger on `goods_receipt_lines` (security definer, execute revoked — the store-keeper cannot read PO tables) copying the PO line's rate and GST; the keeper may change `rate`/`gst_pct` when the delivery bill differs, and the receipt shows "differs from PO" in amber for accounts. Amount = qty × rate (+ GST) derived.
- `stock_issue_line_batches` (`issue_line_id`, `receipt_line_id`, `quantity`): which batches an issue line drew from. `create_stock_issue` allocates **oldest batch first** in the source store; the issue form shows the allocation and lets the keeper switch batch. Stock from before batches (opening stock, adjustments) is drawn last as "no batch" with no rate. Transfers carry their batches to the receiving store.
- `batch_on_hand` view (store, batch, item, received, issued, on hand) — money-free, open like `stock_on_hand`, in the manifest; the existing negative-stock guards are unchanged.
- **Receipt fields** (the PDF's list): received date (typed), project, work, material code and work description (from the PO / its indent), material, unit, quantity, rate, GST, amount, remarks. **Issue fields**: date, company, project, villa, work (from the request or chosen), material, quantity, batch, rate (from the batch), value.
- `PLAN.md`, the welcome screen's "No prices anywhere" sentence and `SECURITY.md`'s money list change to say rates live here for `/inventory` holders, in their own gated table.

### B10. ✅ `[Opus]` The off-estimate reason — inside `0104` (+ `0110`, drafted)

_Landed 2026-10-09:_ the request form asks "Why is it needed?" when the villa has an official estimate and the picked material isn't on it for that work; `createIssueRequest` decides the same from `estimate_takeoff_facts` and refuses without a reason, storing it only when off the estimate. The villa's request list shows it; Site check shows "Site's reason: …" under an outside row (`getOffEstimateReasons`). **Site check is an `/estimator` screen and `issue_requests` was readable only by `/supervisors` and `/inventory`**, so `0110_issue_requests_estimator_read.sql` widens its one SELECT policy to `/estimator` — **drafted and dry-run on staging (OK, nothing kept), NOT applied: a policy change waits for Fable #2.** Until it is applied an estimator-only person sees no reasons; nothing errors. Select strings run against staging.

- `issue_requests` + `off_estimate_reason text`; required by the action (which knows the estimate) when the item is not on the official estimate for that work; the database keeps it non-blank and the guard keeps resolving from rewriting it. Site check shows the reason beside an "outside" row.

### B11. ☐ `[Opus]` Docs — every fact to its home

`STATUS.md` (tool lines, migrations, the contract table: Bills reads `labour_logs`, `po_line_billing_facts`, `work_labour_rate_facts`; Supervisors reads `work_unit_facts`; POs read `companies`, `document_terms`), `SECURITY.md` (money confinement: inventory rates, bill lines, payments, the two new money views; cross-tool writes: PO → `items.indicative_price`, Bills → `labour_logs.bill_id`), tool `PLAN.md`s (Bills: lines, work orders, payments — the "no lines" decision reversed and why; Inventory: batches and rates; Supervisors: log kinds; POs: from-indent, charges, tax split; Indents: work filter, unit lock; Masters: companies, terms, rising rate; Reporter: search vs pickers-only filters), `TODO.md` (this build out of "Building now"; the set-aside three under next builds), `scripts/view-manifest.ts`.

---

## Files (expected)

New: `components/ui/list-toolbar.tsx`; `lib/indents/indent-document.tsx` + `app/(dashboard)/indents/[indentId]/pdf/route.ts`; `lib/masters/companies(.ts|-actions.ts)`, `lib/masters/terms(.ts|-actions.ts)` + Masters screens; `app/(dashboard)/purchase-orders/from-indent/**`; `lib/bills/math.ts` (+ test), `lib/bills/bill-document.tsx`, `lib/bills/work-order-document.tsx`, `lib/bills/payments-*.ts`; `app/(dashboard)/bills/{labour,cash-requests,payments,contractors,work-orders}/**`; `lib/inventory/batches.ts` (+ test); migrations `0101`–`0108`; `lib/supabase/database.types.ts` (generated).
Changed: Indents, POs, Bills, Inventory, Supervisors and Reporter queries/actions/screens named above; `lib/purchase-orders/math.ts` (+ test), `po-document.tsx`; `lib/pdf/document.tsx`; `scripts/view-manifest.ts`; the docs in B11.

## Risks Fable should look at

- **Money spreading**: four new money surfaces (inventory rates, bill lines, payments, two gated views) — each one policy, each gate written in the migration and asserted.
- **`indicative_price` becomes "highest price paid"**, readable by everyone (B4).
- **The bills guard** grows: lines-vs-header agreement, derived paid, override note. Transition updates keep no `.eq("status")` filter (Bills PLAN).
- **Definer functions**: `send_labour_logs_to_bill`, the receipt-rate trigger, the PO-issue rate trigger, FIFO allocation inside `create_stock_issue` (which is `security invoker` today — allocation must not need PO reads).
- **Backfill** of paid bills on production (`0107`) — one row per paid bill, idempotent on `bill_id`.
- **`labour_contracts` rename on screen only** — the table, its FKs and `bills.kind = 'contract'` stay, so Financial Management and Reporter are untouched.

## Verification

**Mechanical**: `npm test` (new pure tests: PO math with discount/charges/tax split, bill math, batch FIFO, estimate pull work filter), lint, typecheck, build, `check:actions`, `db:check-views` on staging, each migration's own asserts; `gh run list`.

**In the browser (Opus, staging, as admin and as the probe with a single grant)**: every new and changed page opened; dark mode; phone width for Supervisors, Indents and Inventory; every write pressed and its rows read back.

**The founder, on staging** — first, in Estimator → Works, give Footing (FD.15) its materials (M10 mix + steel), measure it on Plot 1's estimate and press **Make official**. Then:

1. **Indents** → New indent on Plot 1, work Footing → Pull from estimate: cement, sand, jelly **and** steel appear, each in its Master unit (cement in bags). Request some, submit, approve. The indent shows "Remaining" per line; **Print** gives a clean page.
2. **Purchase Orders** → **From an indent** → pick it → cement to one vendor, steel to another → Create: two draft POs, everything filled in. On one: a 5% discount and ₹500 freight on a line — totals change as you type; a Kerala vendor shows CGST + SGST, an out-of-state vendor IGST. Edit the terms. Issue it; **Print**. In Masters → the material: its rate rose if the PO's was higher.
3. **Inventory** → Receive the PO into Farm Store: rate and GST arrive from the PO; change one rate — it shows "differs from PO". Issue some cement to Plot 1 / Footing: the batch is chosen for you, with its rate. Search and filter each Inventory list.
4. **Supervisors** (phone width) → Plot 1: log a day of NMR (2 masons, 3 helpers) and a piece-work quantity (Footing, 2 cum). Request a material that is not in the estimate — it asks why.
5. **Bills** → **Work orders**: make one for the contractor from a template, works from the list, print it, approve it. → **Labour**: tick the two logs → Send to Bill: an NMR bill (heads × day rates) and a PW bill against the work order (2 × ₹4,000 = ₹8,000). → A material bill from the PO: lines arrive from the PO. **Print** a bill — the contractor's name beside the number.
6. **Cash request** for this week: add the bills and a ₹10,000 advance, submit, release with one amount cut; record the payments — a bill shows "Part paid · pending". On the next bill, recover part of the advance. **Contractors** shows given / recovered / outstanding; **Payments** searches, filters and sums.
7. **Reporter** → any starter: type in the search box, see the totals row, use a quick filter.
8. As the **probe** (`/inventory` only): Inventory rates are visible; Bills, POs and payments are refused.

## Plain summary for the founder (the "before" bullets)

- Indents will show exactly the materials of the work you picked, in the Master's units, with what's left to buy, and can be printed.
- A PO is made by picking an indent — vendor per line, everything else filled in — with discounts, freight, CGST/SGST or IGST worked out, editable terms, and the company on top.
- Site logs daily wages or piece-work; billing turns logs into bills with one button; work orders replace labour contracts; bills have lines, totals calculate, and they print.
- Accounts gets a weekly cash request, part-payments, advances and a pending balance on every bill and contractor.
- The store tracks batches with their PO rates; every list gets search, filters and totals; a material's budgeting rate rises with the POs.

## Questions for the tier above

_(Opus writes here instead of improvising.)_

- **For Fable #2:** `0111_bill_lines_guard_reads_billing_facts.sql` (B7) — `bill_lines_guard` (0106) checked a material line's PO line by reading `purchase_order_lines` as the person, which a `/bills`-only person cannot see, so every material line was refused for the billing team. The check now reads `po_line_billing_facts` (gated `/purchase-orders` or `/bills`), still invoker, same message. Proof: `bill-line-po-check.sql` fails without it, passes with it. **Wider lesson for review #2: review #1's trial ran as the database owner (RLS bypassed), so no policy was exercised.** `bills-as-billing-team.sql` (and the B8/B9 trials to come) run under `set local role authenticated`; please read them as the RLS proof the first trial was not. Approve and apply both to staging.
- **For Fable #2:** `0110_issue_requests_estimator_read.sql` (B10) widens `issue_requests`' one SELECT policy from `/supervisors or /inventory` to add `/estimator`, so Site check can show site's off-estimate reason. No money on the table; writes untouched; asserts one SELECT policy, three write policies, RLS on. Dry-run on staging OK. Approve and apply to staging, or propose a narrower view.

- **For Fable #1:** A1's working-vs-official notice — is adding `working_updated_at` to `estimate_takeoff_facts` acceptable (a date, no rate)?
  **Fable, 2026-10-08: yes.** A date is not money. Do it as `0109`: redefine the view carrying its column list and WHERE forward, add the column to the manifest row with a sentence, `db:check-views` clean. Fable #2 reads it.
  **Opus, 2026-10-08: done, and on staging** (the founder: "just do it now"). `0109` adds `working_updated_at` — the newest write to the villa's working estimate (header, lines, measurements, components); a deleted line alone does not move it. Proof: `npx tsx scripts/dry-run-migrations.ts --project ipstebqawrvhkyntctrv supabase/migrations/0109_*.sql --trial scripts/trials/takeoff-working-date.sql` (the date, an edit moving it past the official, the gate; the trial fails without `0109`). Then applied, types regenerated, `db:check-views` clean. The pull screen shows "The QS has changed this villa's working estimate since — last on …" in amber; the rule is `workingChangedSince` in `pull-rules.ts`, tested. **Fable #2 still reads `0109` before production.**
- **For Fable #1:** B4 — keep the rising rate on the open `indicative_price`, or a separate gated budget rate?
  **Fable: keep it on `indicative_price`.** `SECURITY.md` already makes the material rate visible to all and gates only what the Estimator computes from it; a rate per bag is not the secret — which vendor, which PO and the old price are, and those live in `item_price_changes`, gated to `/masters` or `/purchase-orders`. A second budget rate would split "what the Estimator prices with" into two numbers.
- **For Fable #1:** the definer functions — `po_issue_raises_item_rates`, `goods_receipt_lines_copy_rate`, `allocate_batches` and its two triggers (execute revoked from every client role), `send_labour_logs_to_bill` and `delete_recorded_bill` (callable, each checking `has_app('/bills')` in its body). The labour-log stamp is fenced by a transaction-local setting only those two functions raise (`toolbox.labour_billing`) — is that fence strong enough, given `set_config` is not exposed through PostgREST?
  **Fable: yes, approved.** `set_config` lives in `pg_catalog`, PostgREST exposes only `public`, and no client role runs raw SQL; both callable functions check `/bills` before raising the flag. The fence as drafted broke the second function (the un-stamp) — fixed in `0104`, and the stamp is now the only column the flag lets move. The trigger-only definers follow `SECURITY.md`'s rule: the revoke is the boundary.
- **For Fable #1:** the two new money views (`work_labour_rate_facts`, `po_line_billing_facts`) and `po_billing_totals` redefined with its gate carried forward (0106 asserts it).
  **Fable: approved.** Both WHERE-gated, barrier, manifest rows written, writes revoked. B11 adds both to `SECURITY.md`'s money list beside `po_billing_totals`; `work_labour_rate_facts` is never widened to `/supervisors`.
- **For Fable #1:** `0107` backfills one payment per already-paid bill with the payment triggers disabled for that one statement, re-enabled and asserted in the same migration.
  **Fable: approved.** Idempotent on `bill_id`, re-enabled and asserted. On production it runs once over the real paid bills — one row each, nothing else.
