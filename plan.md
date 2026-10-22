# OS process updates — the build plan

## Context

The operations team sent "Requested OS Process Updates" (18 asks across Estimates & Procurement, Supervisor, Commercial, Work Master), a revised masters workbook (`Tb\1.xlsx`), the site checklists workbook (`Tb\3.xls`), and three notes on what the current Masters is missing (SS/MEP not divided into groups; Infra, Maintenance and Mobilisation works absent; no GST column on items). `Tb\later.xlsx` (steel reinforcement abstracts, tile quantities per plot) is named "later" and is **parked** — not in this plan.

Staging's database is becoming production (`TODO.md`), so **nothing here deletes a master or a record**: works are added, re-parented, re-coded or deactivated, never removed. Every migration is additive, applied to staging only (`0131`+), vetted by the founder on `staging.goodearthkannur.org`, then shipped on their word.

The founder's decisions (2026-10-22):

1. **Villa works adopt the Infrastructure sheet's new numbering** (`FD.02.04`, `SS.01.02`). That sheet's "Buildings" section is the master for villa works; the "Villas - Work" sheet is not read.
2. **Each SS/MEP group gets one package work** carrying the ₹/sqft; sub-works are unpriced site-tracking works.
3. **Order: Masters first**, then the small screen fixes, then the three builds.
4. **Budget vs actual is visible to `/estimator` and `/bills` holders** (plus `/reporter`), through a money view gated in its own WHERE.

**Approved by the founder 2026-10-22.** Work on `feature/os-updates` in its own worktree (`../toolbox-os`); one pull request per wave. Ticks below are the live board.

## What already exists — remind the founder, build nothing

| Ask | Status | Where |
| --- | --- | --- |
| E&P 1 Material requests linked to approved estimates, separate approval for unbudgeted | **Done** (`0113`) | A line the estimate doesn't cover needs a reason and the estimator's yes in Site check before the approver can approve. Only an "Urgent" mark is missing (Wave 2). |
| E&P 2 Duplicate rows in the Estimator | **Done** | Measurement sheet: **Duplicate** on a row, **Copy rows to another work**. A work can appear once per estimate by design (`unique (estimate_id, work_item_id)`). |
| E&P 3 Indents from the estimate for a stage | **Partly** | Pull is per work, with "Show every work". A stage (category) filter is Wave 2. |
| E&P 4 Consolidated POs, traceable per indent | **Done** | A General PO gathers several villas' approved indents; every PO line keeps `indent_line_id`; the indent shows "still to buy". |
| E&P 6 Highest PO rate as budgeting rate; actuals at purchase rate; budget versions kept | **Done** | `0103` raises `items.indicative_price` on a dearer PO, never lowers; `0108` batches carry the PO rate so issues are valued at what was paid; official estimates are numbered and superseded, never overwritten. |
| Commercial 3 Additional charges separate from the rate | **Partly** | Per-line "Other charges" (after GST) exist on PO and bill lines and print. A document-level charge with its own GST is Wave 2. |
| Commercial 5 Advances to suppliers | **UI only** | The database already allows any vendor; only the picker filters to contractors. Wave 2. |

Everything else below is new.

## Wave 1 — Masters: the works list and GST on items `[Opus orchestrates]`

### Migration `0131_works_families_and_item_gst.sql` `[Opus drafts, Fable reviews — touches Masters' open tables, no RLS change]`

- `work_categories.family text` — the sheet's Stage column: `Site Mobilisation`, `Infrastructure - Civil`, `Infrastructure - MEP`, `Buildings`, `Maintenance`. CHECK on those five. Backfill existing categories as `Buildings`.
- `items.gst_pct numeric null check (gst_pct >= 0 and gst_pct <= 100)` — null means "not entered". Validated against active `gst_rates` in the action, no FK (the PO line copies the number the same way).
- Re-run safe, ends in asserts. Types regenerated (`npm run db:types:staging`) and committed with it.

### Importer rewrite `[Opus — the matching; Sonnet — the sheet reading]`

`scripts/import-masters-workbook.ts` + `lib/masters/masters-workbook.ts` (pure, tested). The workbook layout changed, so:

- **Sheets read:** `Vendor & Contractor Names` (unchanged), `Material Master` (now with `GST %` in column G — read it when present; `18%` or `18`), `Material Category`, `Infrastructure - Work ` (note the trailing space — match sheet names trimmed), `Mobilisation - Works`, `Maintenance - Works`. The `Stages` sheet is gone — **construction stages are no longer touched by the importer**; the `Villas - Work` and `Project IDs` sheets are not read.
- **Row classification in the works sheets** is structural, replacing the old code-pattern rules: column A = family (carried down), column C filled = a heading (a category when its code is blank, a group when it has a code), column D filled = a work. A category's code is its children's prefix (`FM` from `FM.01`); for `Buildings - Foundation` style rows the stage itself is the category (`FD`, name `Foundation`). `Mobilisation - Works` → category `SM`, family `Site Mobilisation`, ungrouped works `SM.1`–`SM.12`. `Maintenance - Works` → category `MAIN` "Maintenance", family `Maintenance`, its section rows become groups coded `MAIN-1`…`MAIN-10`, works `MAIN.1`–`MAIN.50`.
- **Package works:** a group heading whose Unit column is a percentage and whose rate is filled (every SS and MEP group) also yields a work coded `<group>.00` (`SS.01.00`), named after the heading, `uom = 'sqft'`, `labour_rate` = the sheet's rate, `model_measure = 'manual'`. The percentage itself is not stored (the rate is already the share).
- **Matching old rows to new (the hard part):** codes changed wholesale, so match each existing work to a new row by **category + loose name** (`looseKey`, with `2-Side`/`Two-Sided` and `&`/`and` normalised), a hand table `WORK_REMAPS` in `masters-workbook.ts` for the rest (old code → new code), matched on code AND name like the existing fix tables so a sheet edit fails loudly. Today's priced SS/MEP heading works (`SS.3` "Ground Floor Lintel Beam RCC Work" 18.4 …) map to the new package works. A matched work keeps its **id** (every FK — estimates, logs, issues, drawings, work orders — follows) and takes the new code, name, group and sort order. Codes are swapped through temporary values inside the one transaction (old `SS.3` is a sub-work's new code).
- **Never delete.** An old work with no match is **deactivated** and listed; so is an old group or category no longer named. `SS.2A` (under ENC), `SS.AS`, `SS.A` — the hand-added leftovers — are matched or deactivated like any other. The `blockers()` stop and the count assertion are replaced by: asserts that every active work in the database is in the sheet, every sheet work exists, and no row was deleted.
- **Rate book:** written as today (`estimator_work_info` upsert) for rows with a unit; a rate the sheet no longer gives is **left alone** (not deleted) and listed. The `model_measure` backfill is re-keyed to the new codes (`FD.03.04` base and sides; `FD.03.05`, `FD.04.04`, `FD.04.11`–`FD.04.14` and every sqft package work manual).
- **Materials:** as today, plus `gst_pct` from column G **only when the cell is filled** — blank keeps what Masters holds (the founder enters GST by hand). Deletion of a material no longer listed stays as today (the sheet is the same 1,118).
- **Dry run prints the whole tree** — family → category → group → work, with `=` kept, `~` renamed/re-coded (old → new), `+` new, `−` deactivated, and a "could not match" list. **The founder reads the dry run before `--commit`.** Backup to `data/backups/` first, as today.

### Screens `[Sonnet]`

- **Masters → Works:** group by family, then category, then group; a family switch at the top; package works marked. Edit forms gain the family on a category.
- **Masters → Items (materials):** a GST % column and field (a select over active `gst_rates`, blank allowed). `lib/masters/items.ts` / `items-actions.ts` (two-file rule).
- **Every work picker** (Indents, Supervisors, Inventory issue/receipt, Estimator add-works, Bills work orders, Design Management sets): `<optgroup>` per category already; add the family as a prefix on the category label (`Buildings · Foundation`). The list grows from 270 to ~780 works, so the pickers that are plain `<select>`s stay; nothing new.
- **Purchase Orders → From an indent:** GST suggestion order becomes **the item's `gst_pct` when set, else the last PO's**; the pool-line grid defaults GST from the item too (`lib/purchase-orders/from-indent.ts`, `line-grid.tsx`).
- **Estimator:** "Download works list for SketchUp" carries the new codes; the From-the-model page's refusal message says to re-send the list (`estimator/PLAN.md` decision 12 updated). The Goodearth QS plugin (outside this repo) matches on code, so the founder re-sends the works list once after the import.

### Docs

`masters/PLAN.md` (the workbook section rewritten: what each sheet gives, the never-delete rule, families, package works, GST), `estimator/PLAN.md` (package works, re-send the list), `STATUS.md` Masters line, `TODO.md` item 3 ("rebuild the rate book's materials") stays.

### Verification

`npm test` (new tests for the row classifier, package works, name matching, GST cell), dry run against staging and read the tree, `--commit`, then open Masters → Works (families, SS/MEP groups with package works), Masters → Items (set a GST, see it), Estimator → Rate book (SS packages priced), one existing estimate (lines still named right), Supervisors villa page (labour log work picker), Indents new (work picker). Re-send the works list to SketchUp and import a takeoff once.

## Wave 2 — the small fixes `[Sonnet builds, Opus vets each commit]`

One migration, `0132_small_fixes.sql` `[Opus drafts; Fable reviews the Bills function and the Supervisors columns]`, holding every column below; each fix is its own commit.

1. **Urgent indents** (E&P 1). `indents.is_urgent boolean default false`. A tick on the indent form, a red "Urgent" badge on the list, the approver's list sorted urgent-first, the welcome count. Editable while draft only (`indents_guard` tuple). The push notification text is unchanged.
2. **Indent pull by stage** (E&P 3). On `/indents/[id]/pull-estimate`, a **Stage** select (work categories present on the official estimate) beside "Show every work"; `factsForWork` gains a category filter in `lib/indents/pull-rules.ts` (tested). No migration.
3. **Deduction rows** (E&P 7). `estimator_estimate_line_measurements.is_deduction boolean default false`; the four `> 0` checks stay — a deduction is a positive row subtracted, so "2 × 1.2 × 2.1, deduct" reads plainly and prints with a minus. `measurementQuantity` / `sheetTotal` in `calc.ts` subtract deductions (tested); `syncLineQty` still refuses a total not above zero; model rows are never deductions (`0118`'s import never sets it); the copy function `estimator_copy_estimate_contents` must carry the column (assert it, as `0118` did for `from_model`). A "Deduct" tick on the row form and a −/opening label in the sheet. `estimator/PLAN.md` decision 6 updated ("additions only" goes).
4. **Piece-work without a work order** (Supervisor 1). `send_labour_logs_to_bill()` accepts a null work order for piece-work: the bill is then kind `nmr` with the contractor as vendor, lines priced from the rate book's `work_labour_rate_facts` as the suggestion (no order line to suggest from). Send to Bill's picker becomes optional with the sentence "No work order — billed as a direct labour bill." `lib/bills/labour-billing.ts` tests cover both. Fable reviews the function (it is a definer that checks `/bills`).
5. **Work classification** (Supervisor 4). `work_class text not null default 'standard' check in ('standard','additional','rework')` on `labour_logs` (added to `labour_logs_one_per_day` and the billed guard's tuple), `stock_issues` (header, beside the work — one issue, one work, one class), and `issue_requests` (so the supervisor's request carries it and Fulfil pre-fills it). Three-way segmented control on the labour form, the request form and the issue form; shown on the villa page's labour list, the issue note, Send to Bill's rows and the bill line description. `0104`'s `labour_logs_shape_matches_kind` untouched.
6. **Invoice number from the GRN** (Commercial 1). `goods_receipts.invoice_no text`, `invoice_date date` (nullable; challan stays). The receive form asks for them. The bill form, once a PO is picked, lists that PO's receipts' invoice numbers and dates (not yet on an approved bill) and pre-fills when there is exactly one. Bills reads `goods_receipts` directly — a new read in STATUS.md's contract row for Bills. Shown on the receipt page.
7. **Material issue report by location** (Commercial 2). A Reporter dataset `stock_issue_lines`: project, issue no, date, from store, to (plot or store), work, work class, item, code, quantity, unit — money-free, built on the open stock tables (`lib/reporter/datasets.ts`, `datasets/types.ts`). Plus an **Items** toggle on `/inventory/issues` that lists lines instead of headers under the same filters (plot, store, dates).
8. **Document-level additional charges** (Commercial 3). `purchase_orders.charges_amount numeric`, `charges_gst_pct numeric`, `charges_note text`; the same three on `bills`. `lib/purchase-orders/math.ts` and `lib/bills/math.ts` add "Additional charges" and their GST as their own `summaryRows` entries (tested); `bill_lines_roll_up` adds them to the header totals; PO and bill prints show them under the lines; `po_billing_totals` includes them. The PO page and bill page get a small "Additional charges" box (amount, GST %, what for). The per-line "Other" column stays. `purchase-orders/PLAN.md` rule 5 and `bills/PLAN.md` rule 3 updated.
9. **Bill entry PO-first** (Commercial 4). On `/bills/new`, for PO and work-order bills the **Against** picker comes first (every billable PO/order, searchable by number and vendor, moved to a server-side search like `/api/catalogue` — closes the open item in `bills/PLAN.md`), the vendor fills from it and shows read-only. NMR keeps the vendor picker. `create_bill()` already takes the vendor from the anchor; no migration.
10. **Advances to any vendor** (Commercial 5). The advance form's picker lists every active vendor, contractors first, labelled "Vendor"; messages say "Pick the vendor"; `/bills/contractors` becomes "Advances" in its heading and lists every vendor with an advance. Recovery already works against any of that vendor's bills. No migration.
11. **Receive screen PO filter** (Commercial 6). The "Awaiting delivery" list gets the page's existing `ListToolbar` (search on PO number and vendor, project, villa) through `listReceivablePos` in `lib/inventory/receipts-queries.ts`. No migration.

Verification per fix: the probe account (single grant) presses the one button; trial SQL for 4 and 5 under `set local role authenticated` (BUGCATCHER #19). Founder's checklist in the final message of each commit.

## Wave 3 — the three builds

### 3a. Site checklists `[Fable designs here; Opus the tables; Sonnet the screens]`

Supervisors-owned. Migration `0133_site_checklists.sql`.

- `checklist_templates` (name, work_refs text, note, sort_order, is_active) and `checklist_template_items` (template_id, sort_order, text, origin `source|added|review`, review_note). Loaded by `scripts/import-checklists.ts` from the workbook saved as `.xlsx` (the repo's reader is xlsx-only; the founder saves `3.xls` as `.xlsx` once): the ten checklists (Blockwork 21 items … Roof Slab Electrical 33), and **Concrete grade check** as an eleventh whose items are its works, each answered with the grade in Remarks. Templates are Masters-like reference data but live with Supervisors (they are the site's); editable in **Supervisors → Checklists** by `/supervisors` holders; reads open to signed-in (`session_is_verified()` floor).
- `site_checklists` (plot_id, template_id, location text, drawing_revision text, started_on, finished_on, inspected_on, status `open|signed_off`, checked_by, signed_off_by/at, attachment_path) and `site_checklist_items` (checklist_id, template_item_id, status `not_checked|pass|fail|na`, remarks). RLS `/supervisors` on every verb, draft-only guard once signed off. One attachment through `lib/uploads/` (the phone camera exists) into a private bucket, for the test certificate the concrete-grade sheet asks for.
- Phone screens on the villa page: a **Checklists** section — start one (pick template, location/floor), tick items (Pass / Fail / N/A, remark), review notes shown in amber as hints, sign off. A print later if asked.
- `supervisors/PLAN.md` gains the section; STATUS.md the line.

### 3b. Site confirms what the store issued `[Fable designs here; Opus the function; Sonnet the screens]`

Migration `0134_site_receipt.sql`. Inventory's tables, written by Supervisors through one definer — a new cross-tool write for `SECURITY.md`'s list.

- `stock_issues.site_confirmed_at`, `site_confirmed_by`, `site_note`; `stock_issue_lines.received_quantity numeric null` (null = not yet confirmed; shortage = quantity − received). Same three header columns and per-line `received_quantity` on `goods_receipts(_lines)` for direct-to-site deliveries.
- `confirm_site_receipt(p_issue_id or p_receipt_id, p_lines jsonb, p_note)`: definer, checks `has_app('/supervisors')`, the destination is a plot, not already confirmed; writes only those columns; a shortage line needs a note. Execute revoked from `public, anon`. `stock_issues_guard` / `goods_receipts_guard` admit exactly these columns moving under the function's transaction-local flag (the `0113` pattern). Trial as the probe with `/supervisors` only.
- Supervisors villa page: **Deliveries to this villa** — issues and direct deliveries not yet confirmed, each opening a confirm form (quantities pre-filled, editable; a shortage asks why). Inventory's issue note and receipt page show "Confirmed by … on …" or the shortage in amber. Stock stays what was issued (quantities, never money); the shortage is a note for the store-keeper and accounts, not a movement — an adjustment stays Inventory's.
- STATUS.md: Supervisors' row adds the write; `SECURITY.md` cross-tool list; `inventory/PLAN.md` and `supervisors/PLAN.md`.

### 3c. Budget vs actual, and stage payments `[Fable designs here and reviews the view; Opus builds the view and the page; Sonnet the work-order shortcut]`

Migration `0135_villa_cost_facts.sql` — **a money view**, `money: true` in `scripts/view-manifest.ts`, gated in its own WHERE to `has_app('/estimator') or has_app('/bills') or has_app('/reporter')`, writes revoked. `SECURITY.md` _Money stays confined_ records that the Estimator now reads committed and actual money through this one view, by the founder's decision 2026-10-22.

- `villa_cost_facts`: one row per (unit/plot, work category, work item, kind): kind `po_committed` (issued/completed PO lines of the villa's indents: taxable value, from `purchase_order_lines` through `indent_lines.indent_id → indents.work_item_id`, general POs attributed through the indent's villa), `material_issued` (issue lines to the plot valued at their batch rates from `goods_receipt_line_rates`; "no batch" lines carry null, shown as unknown), `wo_committed` (approved work-order lines by work), `labour_billed` (bill lines by work: work-order bills per line, NMR bill lines by the log's work), `po_billed` (material bill lines by the PO line's indent work). Every figure before GST. Null never zero (BUGCATCHER #13).
- **Estimator → villa → Budget vs actual** (`/estimator/villas/[unitId]/budget`): per category and per work: Estimated (the official estimate's frozen `estimator_estimate_line_costs`, labour and material apart), Committed (PO + work orders), Actual (material issued, labour billed), variance; a totals row; the official's number and date at the top; "unknown" where a figure cannot be known. `lib/estimator/budget-vs-actual.ts` pure and tested. Also reachable from Bills (a link on a villa's bills list) since `/bills` sees the view — the page's `requireTool` accepts either grant (the one page in the Estimator that does; written down in `estimator/PLAN.md`).
- **Stage-based payments for Superstructure and MEP:** a work order's lines are already work + unit + quantity + rate, so the SS/MEP package works (Wave 1) are the stages. Build: (i) on the work-order form, **"Add every package work of a category"** — picks Superstructure or MEP, adds one line per package work at the rate book's rate with the villa's built-up sqft typed once (or read from the official estimate's package lines when present); (ii) `bill_lines.labour_contract_line_id` (nullable FK) so a bill names which stage line it bills, a `work_order_line_billing_facts` view (money, `/bills` or `/reporter`) of value and billed so far per line, the work-order page showing billed/remaining per stage, and `linesFromWorkOrder` pre-filling each line at value − billed so far (over-billing still warns, never blocks). `bills/PLAN.md` rule 6 and `SECURITY.md`'s window list updated.

## Migrations and numbering

Next free number on every remote branch is `0131` (`origin/staging` and `origin/feature/native-apps` end at `0130`). `0131` Wave 1, `0132` Wave 2, `0133`–`0135` Wave 3 — each applied to staging first with `npm run db:apply -- --project ipstebqawrvhkyntctrv --commit`, dry-run with a trial as the probe where a guard or definer changes (`0132` items 4–5, `0134`, `0135`). Types committed with each. `db:check-views` and `db:check-policies` on every pull request.

## Branch and sessions

`feature/os-updates` off `staging`, in its own worktree (another session may switch branches). One pull request per wave into `staging`; the founder vets each on `staging.goodearthkannur.org` before the next wave's PR. Fable's approval pass at each merge unless the founder waives it in so many words.

## Verification (end to end, after each wave)

- CI green (`gh run list`), then **open the pages** on the preview as the probe (single grant), not as admin.
- Wave 1: Masters → Works shows five families; Superstructure has 11 groups each with a package work priced in ₹/sqft; Items shows a GST column; Estimator → Rate book lists packages; an old estimate's lines keep their names; SketchUp list re-sent and a takeoff imported.
- Wave 2: raise an urgent indent and see it first in the approver's list; pull an estimate for one stage; add a deduction row and see the total fall; send piece-work logs to bill with no work order; log labour as Rework and see it on Send to Bill; record a GRN with an invoice number and see it offered on the bill; Reporter's new dataset filtered to one plot; a PO with ₹1,500 freight at 18% printing right; the bill form picking the PO first; an advance to a supplier recovered from their material bill; the receive screen searched by PO number.
- Wave 3: start a Blockwork checklist on a phone, fail one item with a remark, attach a photo, sign off; confirm a store issue short by two bags and see the shortage on the issue note; open a villa's Budget vs actual as an estimator and as a bills holder, and read the unknown cases aloud; a Superstructure work order with 11 stage lines, two bills against two stages, the order showing billed and remaining.

## Parked

- `later.xlsx` (steel abstracts per plot, tile quantities): a reinforcement takeoff sheet in the Estimator, when the founder asks.
- A checklist print; checklists for Infra works; per-supervisor villa scoping (`TODO.md` open question).

# Native apps on iPhone and Android

**Approved by the founder 2026-10-18 ("everything looks good"). Build Android first.** A1, A2, A4, B and D's camera are on staging (#112, #113, #115, #116); C (push) is built on `feature/native-apps`. **Next, unless the founder says otherwise: the iPhone (A3)**, once Apple's enrolment is through. Work on `feature/native-apps` in its own worktree (`C:\Users\goodearth\Documents\Code\kaadal-toolbox\toolbox-native`, beside the main folder), brought level with `staging` first; each piece ends in a pull request, merged only on the founder's word. **The founder waived Fable's reviews for this build** (2026-10-18: "waive all the fable reviews i trust you"), so Opus takes each `[Fable]` step and says so beside it. Every new package is a release at least two weeks old (Capacitor 8.5.3 was days old on 2026-10-18).

The founder's choices (2026-10-18): **one shared app in both stores**, built with Capacitor 8, showing today's Toolbox screens and adding **push notifications, Face ID / fingerprint, and camera and scanning**. iPhone on the **public App Store**; no Mac, so iPhone builds run on GitHub's free macOS machines (the repo is public). Same ID on both: `com.kaadalgroup.toolbox`.

Why this shape: every tool works on day one, a website fix still reaches both apps with no store release, and the native features are what Apple's "more than a website" rule (4.2) asks for. The Android version replaces the Play wrapper (`android/PLAN.md`) as an ordinary update: same package, same upload key. Version 1 of the wrapper ships first, so staff have an app meanwhile.

## The risks, said once

- **Capacitor calls loading the live site "not intended for production".** Many apps ship it; the cost is review risk when the network drops. So the app carries its own "No connection — try again" screen (`server.errorPath`) and never shows a blank page.
- **Apple may say a staff-only app belongs in Apple Business Manager** (guideline 3.2), as it has for others. The fallback is the same build sent as a private Custom App: a setting in App Store Connect, not a rebuild.
- **Google refuses to sign in inside an app's web view.** "Sign in with Google" must open in a browser tab and come back to the app (step A4). Apple's demo reviewer needs that path, as Play's does.
- **Apple's login rule (4.8)** exempts apps that sign in with an existing company account, which ours is; the review notes say so.

## Founder first

- [ ] [Founder] Apple Developer Program as an **Organization** (in progress), then App Store Connect: create the app `com.kaadalgroup.toolbox`, and an **App Store Connect API key** (Users and Access → Integrations) for the build machine.
- [ ] [Founder] Send version 1 of the Android wrapper to Play (`android/PLAN.md`), so staff are not waiting on this.
- [x] [Founder] A **Firebase** project (free) for Android push: `kaadal-toolbox`, under `admin@kaadal.co.in`, done 2026-10-20; its two files are in `android-signing` (`android/PLAN.md`).
- [ ] [Founder] An **APNs key** (.p8) from the Apple account for iPhone push.
- [ ] [Founder] An iPhone with **TestFlight** and an Android phone, for trying each phase.

## A. The shell, both stores

- [x] [Opus] `mobile/`: a Capacitor 8 project with its own `package.json` (the web app's dependencies untouched), pointed at `https://toolbox.kaadalgroup.com`, the offline screen, and the Kaadal K icon and splash. Android only so far; the iPhone's icon comes with A3. Two things Chrome did for the wrapper are now the app's own: prints and exports go through Android's downloader (`mobile/PLAN.md`), and the back button through `@capacitor/app`.
- [x] [Opus] Android: built on this PC, signed with the existing upload key, version code 2: `kaadal-toolbox-2.0.0.aab` and `-test-install.apk` in `android-release` (`android/PLAN.md`). Capacitor 8 needs **Java 21**, added beside the wrapper's 17 (`mobile/PLAN.md`, _Building a new version_). Seen on an Android 16 emulator: the K launch screen, the live sign-in page, the "No connection" screen in flight mode, Try again, the back button. Not yet seen: anything after sign-in, Print, and the keyboard.
- [ ] [Founder] **Try version 2 on an Android phone** (install `kaadal-toolbox-2.0.0-test-install.apk`; it updates the wrapper in place if that is on the phone). Step 2 confirmed on the founder's phone 2026-10-19; the rest still to try:
  1. Open it: the K on cream, then the burgundy sign-in page, with no address bar.
  2. Sign in with email and password; switch to the mail app for the code and back. Tick "trust this device", close the app, reopen: still signed in.
  3. Open a few tools from different teams; the phone's back button steps back through pages.
  4. **Print** an indent or a PO: "Opening …" appears, then the PDF opens in the phone's viewer.
  5. Tap into a form field: the keyboard doesn't cover it.
  6. Attach a picture somewhere (an expense bill or a drawing): the phone's picker opens.
  7. Flight mode on, open a page: "No connection". Flight mode off, **Try again**.
  8. **Continue with Google** opens Google in a burgundy tab over the app. It finishes signing in only once the two steps below A4 are done.
- [ ] [Opus] iPhone: a manually-run GitHub workflow on a macOS machine that builds, signs and uploads to TestFlight with the App Store Connect key held as GitHub secrets. Never runs on pull requests, so a fork can't reach the secrets.
- [x] [Fable → Opus] **Google sign-in out of the web view.** The founder waived Fable's review (2026-10-18: "waive all the fable reviews i trust you"), so Opus designed it, more simply than first drafted here: Google returns to the app's own address, `com.kaadalgroup.toolbox://auth/callback`, rather than a verified web link, so **no new public path** (no `apple-app-site-association`) and the iPhone uses the same address. The code alone is worthless without the PKCE cookie in the app's web view. The rule is in `SECURITY.md`, the mechanics in `mobile/PLAN.md`.
- [x] [Opus] Built: `lib/native/app.ts` reads the user agent's mark on the server (pure and tested, no new web dependency); `signInWithGoogle` picks the return address; on Android, other sites open in a Chrome tab over the app and the return is finished in the web view. Seen on the emulator: Google's page in a burgundy tab over the app, its close button back to the app, and a return carrying a made-up code finished on the site and refused, with the app open and from cold.
- [ ] **Before the round trip works**, two things outside the code:
  - [x] [Opus, at the founder's word] `com.kaadalgroup.toolbox://auth/callback` added to staging's Supabase redirect list, 2026-10-20. Staging's settings become production's at the switch; the new practice project needs it too.
  - [x] [Founder] Merge the website's half to staging: #112 and #113, merged 2026-10-19.
- [ ] [Founder] Vet on TestFlight and Play's internal track: sign in all three ways, open every team's tools, turn on flight mode and see the offline screen.

## B. Face ID and fingerprint

- [x] [Fable → Opus, waived] Settled by Opus (the founder waived Fable's reviews, 2026-10-18): the email and password go into the phone's Keystore, released only by the face or finger, and the app signs in through **today's password path**, so the trusted device (30 days) skips the code as it does now. No new door into the server. Two changes from the first draft: the offer is a tick box on the sign-in form rather than a question after sign-in (nothing has to carry the password across pages), and the plugin is our own over Google's `androidx.biometric` 1.1.0, so the key itself holds the password. The rule is in `SECURITY.md`, the mechanics in `mobile/PLAN.md`.
- [x] [Opus] Built: version 2.1.0 (code 3). "Turn off fingerprint sign-in" in the profile menu clears it. Seen on the Android 16 emulator against a local copy of the site: the tick box, the "Save your sign-in" prompt, the app asking by itself on a fresh sign-in page, "Use password" leaving the form and a fingerprint button, a saved password that fails cleared with a note, a newly added fingerprint clearing it, and another page refused. Not seen: a real sign-in (model sessions have no account), or the profile menu's item.
- [ ] [Founder] Vet, once the website's half is on staging and version 2.1.0 is on the phone: sign in with the box ticked and touch the sensor; **sign out** (the app otherwise stays signed in for 30 days), and the app asks for your finger by itself and signs you in; change your password on the website and see the app clear the saved one and ask for the password; the profile menu's "Turn off fingerprint sign-in".

## C. Push notifications

- [x] [Fable → Opus, waived] The design, approved by the founder 2026-10-20 ("go"): `push_devices` (`0130`) — a person reads and forgets only their own phones, and records one only through `claim_push_device()`, so a shared site phone follows whoever signed in last; sending to someone else is the sanctioned admin-client use in `lib/push/send.ts`, told whom by the action that just wrote. Firebase delivers to both phones (the APNs key goes into Firebase for the iPhone), so there is one sending path. The rules are `SECURITY.md`, _Push notifications_. Applied to staging 2026-10-20 after a dry run whose trial passed as the staff account and the probe.
- [x] [Opus] `lib/push/` sends after the response (`after()`), never inside the write, never to the actor, never throwing; the token signing is shared with the Chat door in `lib/google/`. The app is version 2.3.0 (code 5).
- [x] [Opus, not Sonnet] The first three: an **indent approved** (to whoever raised it), a **baton passed on, sent back or handed over** (to its new holder, from Google Chat too: a baton is always one named person, not a department), a **design stage** (to each person put on it by a pass, a start, "set where it is" or being added). A tap opens that page. Seen on the Android 16 emulator: the permission prompt, registration, the channel, Firebase accepting a send through `lib/` (200), and a tap opening its page from an open app and from a closed one. Not seen: a notification arriving, because an emulator without a Google account never receives one; nor anything after sign-in.
- [x] [Opus, at the founder's word] `FIREBASE_SERVICE_ACCOUNT_KEY` in Vercel's Preview settings (staging), 2026-10-20; Production's comes at the switch. [Founder] The Firebase Android key restricted to the app with both signing SHA-1s (`android/PLAN.md`).
- [x] [Founder] Vetted 2026-10-20 ("everything works"), installed from Play's internal testing and merged as #117. The checklist was: version 2.3.0 on the phone (`kaadal-toolbox-2.3.0-test-install.apk`), signed in as yourself, with a second account on a computer doing each thing to you: Allow notifications when asked; approve an indent you raised; pass a Relay baton to you; put you on a design stage. Each arrives with the K, and a tap opens its page. Sign out and do it again: nothing arrives. Turn notifications off for Toolbox in the phone's settings: the app still works.

## D. Camera and scanning

- [x] [Opus] Photos: built in the app, not the website, as version 2.2.0 (code 4). Chrome and the iPhone already offer the camera on a picture field; the Android app now does too (`CameraFileChooser`), so every photo upload has it at once: Birdwing documents and expense bills, Directory photos, Selections views. Seen on the Android 16 emulator: Camera beside Files on a picture field, a shot reaching the page as a readable JPEG, Files choosing a picture, cancelling in the camera or the picker, the picker opening again after, and a spreadsheet field going straight to Files.
- [x] [Founder] Vetted on the phone 2026-10-20 ("it all works"), merged as #116. The checklist was: version 2.2.0 (`kaadal-toolbox-2.2.0-test-install.apk`): on Birdwing Books → Expenses, a row's **Bill** button offers **Camera**; take a photo of a paper bill and it uploads; the same button's other choice still picks a PDF; your Directory photo from the camera. iPhone: checked when A3 builds it.
- [ ] [Founder] **Question: what gets scanned?** Items and bins carry no barcodes today, so scanning first needs labels — for example a QR sticker per item or rack printed from Inventory. Scanning is planned once that is decided.

## E. The stores

- [ ] [Opus] Draft the App Store listing, privacy labels and review notes (the reviewer Gmail with Google sign-in, the 4.8 exemption, the native features to try); screenshots from TestFlight.
- [ ] [Founder] Submit to the App Store; send the Android update to Play.
- [ ] [Fable] Approval pass over the full diff before each merge, as `MODELS.md` says.

# The refactor before production — done

Approved 2026-10-17 ("the refactor must happen"); built and merged to staging on 2026-10-18 (#106 for Phase 0, #107 for Phases 1–6, with Marathon and the construction budgets removed), with `0127`–`0129` applied there; the founder vetted it on staging the same day: "all looks good". Its rules now live in CLAUDE.md, SECURITY.md and BUGCATCHER.md, and its checks in CI. The full plan, every step ticked, is `git show ec86aaf:plan.md`.

# Waiting for the founder's vet

Each piece below is on staging. Its checklist stays here until the founder has tried it; the rules it made live in its tool's `PLAN.md`, and its story in git (`git show 88749ab:plan.md`).

## Before production (the ERP corrections)

_The ERP corrections._

- **B9's question is answered by `0112`** (founder, 2026-10-10: "finish the database changes"): stock issued or removed before batches existed is replayed oldest-first, drawing only what existed at the time (`inventory/PLAN.md`). **Apply `0108` and `0112` in the same `db:apply` run** — the replay refuses if an issue recorded in between already drew the same batches. Kept or cleared on ship day, production's stock records come out right. Proof: `replay-pre-batch-history.sql` (and it fails with a figure wrong, or with the at-the-time rule removed).
- **`0107` backfills one payment per already-paid bill** — on production it runs once over the real paid bills, one row each (`bills/PLAN.md`).

## Verification — the founder, on staging

_The ERP corrections._

First, in **Estimator → Works**, give Footing (FD.15) its materials (M10 mix + steel), measure it on Plot 1's estimate and press **Make official**. In **Masters → Companies**, enter Goodearth's real details and set that company on the Saarang project (nothing is seeded — until then every print shows the placeholder letterhead and GST is reckoned against Kerala); **Masters → Terms** takes a default PO text and a default work order text. Then:

1. **Indents** → New indent on Plot 1, work Footing → Pull from estimate: cement, sand, jelly **and** steel appear, each in its Master unit (cement in bags). Request some, submit, approve. The indent shows "Remaining" per line; **Print** gives a clean page.
2. **Purchase Orders** → **From an indent** → pick it → cement to one vendor, steel to another → Create: two draft POs, everything filled in. On one: a 5% discount and ₹500 freight on a line — totals change as you type; a Kerala vendor shows CGST + SGST, an out-of-state vendor IGST. Edit the terms. Issue it; **Print**. In Masters → the material: its rate rose if the PO's was higher.
3. **Inventory** → Receive the PO into Farm Store: rate and GST arrive from the PO; change one rate — it shows "differs from PO". Issue some cement to Plot 1 / Footing: the batch is chosen for you, with its rate. Search and filter each Inventory list.
4. **Supervisors** (phone width) → Plot 1: log a day of NMR (2 masons, 3 helpers) and a piece-work quantity (Footing, 2 cum). Request a material that is not in the estimate — it asks why.
5. **Bills** → **Work orders**: make one for the contractor from a template, works from the list, print it, approve it. → **Labour**: tick the two logs → Send to Bill: an NMR bill (heads × day rates) and a PW bill against the work order (2 × ₹4,000 = ₹8,000). → A material bill from the PO: lines arrive from the PO. **Print** a bill — the contractor's name beside the number.
6. **Cash request** for this week: add the bills and a ₹10,000 advance, submit, release with one amount cut; record the payments — a bill shows "Part paid · pending". On the next bill, recover part of the advance. **Contractors** shows given / recovered / outstanding; **Payments** searches, filters and sums.
7. **Reporter** → any starter: type in the search box, see the totals row, use a quick filter.
8. As the **probe** (it holds `/inventory` and `/estimator`): Inventory rates are visible, and Site check shows site's reason; Bills, POs and payments are refused.

## Verification — the founder, on staging (second build)

_Indents wait for the estimator._

1. **Indents** → New indent on Plot 1, work Footing → **Add items**: pick cement (on the estimate) and something it does not list. Cement shows "from the official estimate"; the other shows amber **Outside the estimate** with a "Why is it needed?" box.
2. **Submit** without typing a reason — it asks why. Type one, submit.
3. As the approver: **Approve** is locked — "Waiting for the estimator on 1 line". Send back still works.
4. **Estimator → Site check**: "Indents waiting for you" lists the line with site's reason. **Refuse** with a note → on the indent the approver sees the refusal and sends it back. Change the quantity (the old answer clears), resubmit; in Site check press **Approve**; now Approve on the indent works. The Estimator's welcome counts what waits.
5. **Print** the indent: the line shows its reason and "Estimator approved".
6. **Purchase Orders**: no "Add items directly". **Bulk PO from several indents** → General → **From approved indents** lists approved indents from every villa, each named by its villa.
7. As the **probe** (it holds `/estimator` and `/inventory`): Site check shows the waiting lines and Approve works; Indents is refused.

## Verification — the founder, on staging (fourth piece)

_Teams in the sidebar._

1. Any page: the sidebar shows Overview, then **Management, Operations, Events, People, Admin** as closed rows with a count. Click one — its tools open under it; click again — it closes. Open a tool: its team stays open on the next page.
2. **Settings → Teams** → **New team** "Design". Move it to the top with the arrows. Under _Tools_, set Design Management and Selections to Design — the sidebar moves them at once.
3. Rename a team; delete one — its tools move to **Other** at the bottom of the sidebar, and nobody loses access to anything.
4. The home page's tool cards and a person's apps in **Settings → People** are grouped the same way.
5. On a phone: the menu shows the same closed teams.
6. As the **probe** (it holds `/estimator` and `/inventory`): only the teams holding those two appear, and **Settings → Teams** is refused.

## Verification — the founder, on staging (fifth piece)

_Birdwing, the Hospitality section._

You are admin, so you see both tools without a grant. A test stay made here is a real row on staging — cancel it when done.

1. **The sidebar** shows a **Hospitality** team holding **Birdwing Stays** and **Birdwing Books**.
2. **Birdwing Stays → Settings**: "On every invoice" names Maloor Eco Farms (check its address and GSTIN in Masters → Companies); bank, UPI and the cancellation policy are filled in. **Rate card**: every head says _Switched off_ — read each rate and switch on the right ones (Edit → In use).
3. **Calendar**: October shows no named rooms for the old stays (the sheet never said which room). Go to next month, tap a free night in **R2** on a Friday → the new stay opens with R2 and the dates filled. Make the guest "Test Guest", Friday to Sunday, **Book the stay** → its page, numbered BW-0221.
4. **New stay** again for Saturday → R2 shows _Taken: BW-0221 · Test Guest_ and can't be ticked. (Two people booking it in the same second are refused by the database.)
5. On BW-0221: **Add a charge** → Room rent, quantity 2 → it comes to ₹7,980; add Dinner × 2 → ₹1,050. **Preview** → a DRAFT PDF. **Issue invoice** → it reads **MEF/GH/133**; **Open PDF**; the charges can no longer be changed.
6. **Record a receipt** — UPI, today → _Pending_ drops by it.
7. **Calendar** again: R2 is blue on those nights. **Check in**, then **Cancel stay** is gone (a stay in the house is checked out, not cancelled) — **Undo check-in**, then **Cancel stay** with a reason → R2 is free again.
8. **Review**: 128 stays. Tick a few Goodearth ones → pick **Marketing** → **Set cost centre** → **Charge pending to cost centres** → they leave the list; their stay pages show "charged to Marketing".
9. **Birdwing Books → Expenses**: October 2026 shows the old sheet's lines; attach a photo of a bill to one from your phone.
10. **Upload the sheet**: save the workbook's _Combined Expenses_ sheet as CSV and upload it → the preview says **0 new**, every line _Already in_.
11. **Attendance** on your phone: today at the top — mark Sajna _Present_, tap the name, in 07:30, out 18:30, Save.
12. **Settings** → give Amal, Appu and Bijeeth their pay rules (Amal ₹30,000, Appu ₹40,000, no shift = fixed).
13. **Salaries → October 2026**: Amal's card says ₹30,000 is already in Expenses from the old sheet, and won't confirm. **November**: once the month begins, Sajna's figures are worked out from attendance.
14. **Financial Management → Birdwing**: the tiles match the HTML page — billed ₹21.4 L, collected ₹14.0 L, pending ₹7.3 L, expenses ₹23.9 L, occupancy about 30% (estimated) — less what steps 5–8 moved.
15. **Reporter** → new report → **Birdwing stays** → group by _Who for_, sum _Pending_.
16. As the **probe** (it holds `/estimator` and `/inventory`): neither Birdwing tool appears, and `/birdwing` sends it home.

## Open questions for the founder (fifth piece)

_Birdwing, the Hospitality section._

1. **Cost centres** for internal stays — seeded Marketing, Sales, Projects, Directors, Kaadal (editable in Settings). Does a cross-charge need an approver, or is the person who records it enough? Built: the person who records it, named on the line.
2. **Rate card** — the laptop app's 13 heads are seeded **switched off**; read them in Birdwing → Settings and switch on the right ones before the first real charge.
3. **Pay rules** — only Sajna's is known (₹15,000, ₹80/hr OT, ₹80/room-day, shift 08:30–17:30). Amal ₹30,000 and Appu ₹40,000 look fixed; Bijeeth's basis is unknown. Needed before the first salary run.
4. **Grants** — Amal, Akshay on `/birdwing`; who on `/birdwing-books`?
5. **The 67 unpaid internal stays** — bulk-assign cost centres on the Review screen, or one by one?
6. **November 2026 salaries** already in the sheet — imported flagged "future", never confirmed, unless you say drop them.

## Verification — the founder, on staging (sixth piece)

_From the model: a SketchUp takeoff becomes a villa's estimate._

1. **SketchUp: Extensions → Goodearth QS → Toolbox address…** → `https://staging.goodearthkannur.org`.
2. **Open `Sample villa.skp` → Send to the toolbox.** A window opens; sign in (password, then the code). If it lands on the home page, close it and press **Send to the toolbox** again.
3. **From the model** shows the file, 18 works, 36 rows, its problem count and 3 to measure by hand. Pick a test villa → every work says _adds_; the hand-measured ones say _to measure_.
4. **Import → Open the estimate.** Under the title: _Measured from Sample villa.skp_. FD.14 reads 0.392 cum from `2 × 1.4 × 1.4 × 0.1`; F.1.36 and F.1.37 read 1 nos each; PF.8 reads 365.542 sqft. The model's rows carry a _Model_ badge and no edit buttons.
5. **On FD.9, add a hand row** `1 × 1 × 1 × 1` → 2.818 cum.
6. **In SketchUp, shorten wall BW1 by a metre** (keep it a solid) → **Send to the toolbox.** The villa is already picked; FD.9 says _replaces the model's 2 rows with 2 · 1 typed row kept_ → Import → FD.9 = 2.548 cum.
7. **Rate book → FD.6** (on no estimate) → set its unit to **sqm**. In SketchUp tag a closed block `FD.6` and send: _refused — the rate book measures FD.6 in sqm, the model sent cum_; the rest imports. Set FD.6 back to cum.
8. **Make official** on that estimate → the official copy's sheets still show the _Model_ badges.
9. **Start another villa's estimate from this one** (everything), then send the model to that villa: no work doubles.
10. **Rate book → Download works list for SketchUp** → in SketchUp, **Choose works list…** → that file: the counts match the rate book. (Inside SketchUp's window, **Send the works list to SketchUp** on From the model does the same in one press.)
11. **As the probe** (`/estimator` and `/inventory`): From the model imports. As someone without `/estimator`, the page sends them home.

## Still open (sixth piece: rate-book data)

_From the model: a SketchUp takeoff becomes a villa's estimate._

1. **Superstructure materials.** SS and MEP works are shares of a package rate per sqft; their sub-works (SS.2a–SS.2g, SS.5a, SS.9b, SS.6a–SS.6e, SS.11a/b) have no unit. Give them physical units and recipes, so the model can drive blocks and cement for the superstructure?
2. **FD.16, FD.22, FD.29–FD.32** are sqft: shuttering area (base + sides) or plan area? Until answered they are measured by hand.

## Verification — the founder, on staging (seventh piece)

_The Saarang tracker, inside Client Relations._

1. **Masters → Stages**: the Build progress card lists the nine stages in order, the last marked Handover. Add "Waterproofing", move it up between the slabs with the arrows, then deactivate it.
2. **Client Relations** opens on its welcome: overdue, this week, waiting on management. **Actions** is the first door.
3. **Actions**: the team strip shows Anu, Sayooj and Sebastina with the imported counts (Anu 26 open). Click Anu — only Anu's. **Needs you** is empty.
4. Type "Share 3D with client", pick Plot 4, Sayooj, **Tomorrow** → **Add**: it appears under _Next 7 days_.
5. Tick it — it leaves the list; **Undo** brings it back. Tick an overdue one, then _Show done_.
6. On a _date assumed_ action pick **This Friday** — the flag goes and it moves to _Next 7 days_.
7. **••• → Waiting on management** — it moves to the top, and **Needs you** counts 1.
8. **Plots**: lot cards with health pills; the **No next step** chip lists sold plots with nothing open. Open Plot 10 → **Next steps** on top; add one there; tap a Kaadal stage; step the build forward with ▶ — the card's rail fills.
9. **Clients**: cards with faces and plot chips; open one — their plots and their actions. **Collections** reads like Actions: overdue first.
10. **Plots → Saarang West - Villas**: 27 cards, six with a buyer, each showing its configuration (1BHK Study …). In Saarang, **Plot 33 & 34** is one card; Plots 9 and 27 have no buyer; Plots 3, 35 and 43 have their new buyers. **Clients → Stage: Lost** lists the three who cancelled, each with its reason.
11. **Anu, signed in on a phone**: Anu opens on their own list with the greeting; the composer, the menus, the chips and the tick work with a thumb; nothing scrolls sideways.
12. As the **probe** (it holds `/estimator` and `/inventory`): Client Relations is not in the sidebar, and `/client-relations/actions` sends it home.

## Verification — the founder, on staging (eighth piece)

_Only whoever set an action closes it._

1. **Actions** → add "Trial: send the brochure" for **Anu**, Tomorrow. You set it.
2. Ask Anu (or sign in as Anu) to open **Actions**: Anu's tick on it says _Mark finished — Siddharth confirms_. Anu ticks it → it moves to **Waiting to confirm**, "Waiting for Siddharth to confirm".
3. Back as you: it tops your list under **Waiting to confirm**, "Waiting for you to confirm". Tick it → closed. Undo works.
4. Anu cannot open it again; on Sayooj's own actions Anu's tick is dashed and locked.
5. One of Anu's imported actions (from the tracker): Anu ticks it straight to done, counting as its setter.

## Verification — the founder, on staging (tenth piece)

_Each person sees the work assigned to them._

With `/client-relations` given to Anu, Sayooj and Sebastina:

1. **Settings → People → Sayooj**: under Client Relations, a **Team lead** tick. Leave it off for now.
2. **As Anu** (on a phone if you can): **Plots** shows only Anu's plots; **Actions** opens on Anu's own list, and **All I see** adds what Anu set for others and others' steps on Anu's plots; **Clients** lists only Anu's clients; the owner menu shows names without counts.
3. Paste the link of one of Sayooj's plots (from your own view) into Anu's browser: "This plot is not one of yours".
4. As Anu, add a step on one of Anu's plots for Sayooj. **As Sayooj**: that plot appears, with that one step — not Anu's other steps on it. Sayooj ticks it finished; Anu closes it; the plot leaves Sayooj's list.
5. As Anu, give one of Anu's plots to Sebastina (Construction owner chip): the page turns into "This plot is not one of yours… it is with your colleague now". As Sebastina, it is in Sebastina's Plots.
6. Tick **Sayooj as Team lead**: their Actions opens on everyone with the team strip, Plots shows all of them, the owner menu shows counts. Their access history says "Made team lead in Client Relations". Untick: back to their own.
7. As yourself: everything as before. **Financial Management** and **Reporter** still show every plot's payments.
8. As the **probe**: Client Relations is still refused.

## Verification — the founder, on staging (eleventh piece)

_Transmittals the design team can use._

Staging is becoming the real database, so this checklist issues nothing — an issued transmittal can never be deleted. The TB mint and the kept list are proved by the trial; the team's next real issue shows them.

1. **Villa 41 → TR-0002 → Cover sheet (PDF)**: its nine uploaded sheets listed by name; the file is named `Goodearth-Transmittal-Villa41-TR-0002.pdf`.
2. **Villa 40 → New transmittal → Structural → Foundation Layout → Revise to R1.** On the draft, set Revision to **0** — refused, in a sentence. Set **3** — saved; it reads R3.
3. Paste a Google Drive or WhatsApp link as the WorkDrive link — refused, in a sentence.
4. Paste a real WorkDrive share link: in two seconds or so, "38 sheets" and their names. Paste the folder's own WorkDrive address instead — refused, asking for the share link. Add a file to the folder in WorkDrive, press **Read the folder again** — 39.
5. Type _What changed_ — the line under the title says it is ready. **Don't issue: delete the draft.**
6. After the team's next real issue: it reads **TB-000n**; its cover sheet carries the link and every sheet's name; on a supervisor's phone, **Supervisors → that villa → Open drawings** opens the folder.

## Verification — the founder, on staging (twelfth piece)

_Construction and Interior, two sides of a plot._

1. **Plots**: each card shows two owners — a hard hat for Construction, a sofa for Interior, with the interior stage beside it. The **Side** filter → Interior lists only plots with interior work; pick Interior + Sayooj — only plots where Sayooj owns the interiors or holds an interior step.
2. Open a plot with both owners: the header names both. **Next steps** → **Interior**: only interior steps; type a step — the owner chip already says the Interior owner, and the side chip says Interior. Switch it to Construction: the owner becomes the Construction owner.
3. On a step's **•••** → Side: move it to Construction; Undo brings it back.
4. **Actions** → **Interior**: only interior steps, and the team strip counts only interior work.
5. Nowhere in Client Relations says "Kaadal" or "Sales" any more (the plot record's **Construction** and **Interior** cards).

## Verification — the founder, on staging (thirteenth piece)

_The design board: each villa passed from stage to stage._

Staging is becoming the real database, so use villas the team is really working on — what goes in is real from day one, and an action is never deleted. You are admin: you see everything, but you are offered as a person on a stage or an action's owner only if you hold `/design-management` yourself (Settings → People).

1. **Design management** opens on its welcome: villas in design, revising, with the client, actions overdue. The tabs are **Board · Actions · Design stages**.
2. **Design stages**: Design, Permit, Working Drawings, Structural and Interiors are ticked **On the board**; MEP, Typical Details and Landscape are not. Tick MEP, open the Board — it has an MEP column; untick it.
3. **Board**: "No villa has started yet", and **Not started** lists every villa. Open **Villa 41** → **Set where it is** → Working Drawings, with Jiljith and Navarang → the Board shows it in the Working Drawings column; on its page Design and Permit read Done.
4. On Villa 41's Working Drawings, tap **With the client** — the card says so; **Undo** puts it back. **Pass to Structural →** pick Vaishnav → Working Drawings Done, Structural Working with Vaishnav; Villa 41 moves to the Structural column.
5. On its **Design** card, **Send back for revision** — the button waits until you say why. "Client changed the staircase" → Villa 41 stays in Structural; its card reads **Revising Design**, red; the villa's **History** has the line with the reason. Tap **Done** on Design — the revision is over.
6. On Villa 40, **Set where it is** → Design; then **Start Interiors** beside it — both Working; Villa 40 sits in the Interiors column.
7. On a stage, **+ Add** puts someone on; the cross takes them off, with Undo. **•••** → Take back the start returns a stage started by mistake to Not started.
8. **Actions**: the team strip (you are admin). Type "Send the revised plan to the client", pick Villa 41, **Design**, Jiljith, **Tomorrow** → **Add**: under _Next 7 days_, and on Villa 41's page under Next steps. As Jiljith (or ask them), tick it — "Waiting for Siddharth to confirm"; as you, tick it closed; Undo works.
9. Villa 41's page still lists its transmittals, and **New transmittal** works as before.
10. On a phone: the Board stacks a stage at a time; a lot card opens its villa; nothing scrolls sideways.
11. As the **probe** (`/estimator`, `/inventory`): Design Management is not in the sidebar, and `/design-management/actions` sends it home.

## Verification — the founder, on staging (fourteenth piece)

_One owner per side._

1. Open **Plot 17**: its Interior owner now reads **Anu** (from Anu's step). **W14**'s Construction owner reads **Sayooj**.
2. On a plot with no Interior owner: **Next steps → Interior** — the owner chip reads "No interior owner" in amber; type a step and Add — it asks you to give the plot an Interior owner first.
3. Give that plot an Interior owner (the Interior card). Add the step — it is theirs; the owner chip on it is not a menu.
4. Change the plot's **Interior owner** to someone else: every open interior step on it moves to them; a done one keeps who did it.
5. Try to set the Interior owner to nobody while it has open steps — refused, in a sentence.
6. On a step's **•••** → Side → Construction: "Moved to Construction · (the Construction owner)'s now".
7. On **Actions**, a step with **no plot** still lets you pick any owner.

## Verification — the founder, on staging (the Kaadal look)

_The Kaadal look._ The founder waived Fable's approval pass for this merge ("merge", 2026-10-18). Opus re-reviewed the full diff: no migration, policy, view, action or money read is touched; dark mode still declares `color-scheme`; `/login`, `/forgot-password`, `/_not-found` and `/_global-error` still prerender. The rules are `DESIGN.md`.

1. Open staging in a private window: light, whatever the device says; the tab reads **Kaadal Toolbox**; sign-in is the burgundy page with the white panel.
2. Sign in. The sidebar reads **Toolbox** and lists teams; click a team — its page opens, a band in its colour and a box per tool.
3. Open a tool from the box: its opening band is in the team's colour, and **← (team)** goes back. Only that team lists its tools in the sidebar.
4. The home page shows each team as a colour block, in Settings → Teams order: burgundy, teal, olive, ochre, sage, blush, then round again; Other is ink.
5. Inside a tool, the tabs are underlined in burgundy; on a phone they swipe sideways. Bills, Indents and PO "Lines" headings are in Gambetta.
6. As the probe (single grant), the home page and the team page show only the probe's tools, and a team the probe has nothing in is not there.
7. Switch to dark once: the rail and sign-in are deep teal, the page ink; open a date picker — it is dark too.
