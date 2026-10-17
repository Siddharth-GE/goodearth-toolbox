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

# Second build — indents wait for the estimator (2026-10-11)

The founder: "a po can only be made from an indent … indents can be made direct but has to be first thing that is reconciled in the estimate"; asked whether the indent waits, "indent should wait for estimator approval for sure"; and a bulk buy is one PO gathering several villas' indents. Built by `[Opus]` on `feature/indent-estimator-gate`. The rules live in `indents/PLAN.md` (_Outside the estimate waits for the estimator_), `purchase-orders/PLAN.md`, `estimator/PLAN.md` (decision 11) and `SECURITY.md` (the cross-tool write); this section holds only what is still open.

- [x] `[Opus]` `0113` written; dry-run on staging with `scripts/trials/indent-estimator-gate.sql` as a single-grant person, and proved to bite (a copy without the estimator check fails at TRIAL 5). The older trials lift the new PO rule inside their own transaction (`0113` + `batches-as-store-keeper` passes).
- [x] `[Opus]` Indents, Estimator (Site check, welcome) and Purchase Orders screens; the types carry `0113`'s columns by hand.
- [x] ~~`[Fable]` Review `0113`~~ — **skipped on the founder's explicit word for this merge** (2026-10-11: "skip fable review you do the review and merge"). In its place `[Opus]` re-reviewed the whole diff against `SECURITY.md` and `BUGCATCHER.md`: `indents_guard` diffed against `0034`'s — the two checks are pure additions; `indent_lines_draft_only` is `0019`'s plus the answer path; the definer checks `/estimator` in its body and is reached by no trigger; no browser or admin client, every query and action behind `requireTool`, every read checks `error`. One finding, fixed: Site check's indent approvals read the few approved lines first, not every villa's indents. **The Fable review of `0113` is due before production.**
- [x] `[Opus]` Applied to staging (`0001`–`0113`); types regenerated — they match the hand-written ones plus the estimator's FK to `profiles` (nothing embeds `profiles` through `indent_lines`, so nothing turns ambiguous); `db:check-views` and `db:check` clean; every new `select` string run at staging's PostgREST (zero rows, all valid); the trial re-run on the applied database passes. **No screen has been opened signed in** — a model session cannot sign in; the founder's vet is the first look.
- [x] `[Opus]` Pull request to `staging` (#89); CI green; merged.
- [ ] Founder — the checklist below, on staging. Then production: Fable's review of `0113`, then `0113` after `0112`.

## Verification — the founder, on staging (second build)

1. **Indents** → New indent on Plot 1, work Footing → **Add items**: pick cement (on the estimate) and something it does not list. Cement shows "from the official estimate"; the other shows amber **Outside the estimate** with a "Why is it needed?" box.
2. **Submit** without typing a reason — it asks why. Type one, submit.
3. As the approver: **Approve** is locked — "Waiting for the estimator on 1 line". Send back still works.
4. **Estimator → Site check**: "Indents waiting for you" lists the line with site's reason. **Refuse** with a note → on the indent the approver sees the refusal and sends it back. Change the quantity (the old answer clears), resubmit; in Site check press **Approve**; now Approve on the indent works. The Estimator's welcome counts what waits.
5. **Print** the indent: the line shows its reason and "Estimator approved".
6. **Purchase Orders**: no "Add items directly". **Bulk PO from several indents** → General → **From approved indents** lists approved indents from every villa, each named by its villa.
7. As the **probe** (it holds `/estimator` and `/inventory`): Site check shows the waiting lines and Approve works; Indents is refused.

# Third piece — the batch ID, big and copyable (2026-10-12)

The founder: "the batch id needs to be big and visible and copy as well as … a small button". Screens only, Inventory only, no migration; the rule is in `inventory/PLAN.md`. Built by `[Opus]` on `feature/inventory-batch-id` (#90).

- [x] `[Opus]` `BatchId` on the delivery note, "Batches in this store" and the issue note. Rendered through a throwaway probe at a true 390px phone width, light and dark, inside the dashboard's own layout; the copy button pressed for real (the clipboard held the ID) and with the clipboard forced to fail (the fallback line showed). CI green.
- [x] ~~`[Fable]` Review~~ — **skipped on the founder's explicit word for this merge** (2026-10-13: "merge"). In its place `[Opus]` re-reviewed the diff against `BUGCATCHER.md`: no database read, upload or permission touched; colours are tokens only (`text-success` for the tick), checked in dark mode (#4); the copy button is `type="button"`, so inside the issue form it never submits. One finding, fixed: the fallback said "tap the ID", but a phone selects on press and hold.
- [ ] Founder — on staging: **Inventory → Receive → a delivery note**: the batch ID is large under each line; press the copy button and paste it into WhatsApp. The same on **Stock → a material in a store** and on an **issue note**. Once on a phone.

# Fourth piece — teams in the sidebar (2026-10-13)

The founder: "lets categorise and on the left they must just sit as a closed set, design, commercial, interiors etc and only when opened will you see all the tool under it, in settings each tool can get a team tag, and a place where you can make all the team tags so that we can rearrange as needed". Agreed before the build: it starts from today's five headings (nothing moves until the founder rearranges); one team per tool; the team of the page you are on opens by itself; a tool with no team sits under **Other**; teams arrange, grants still decide. Built by `[Opus]` on `feature/sidebar-teams`.

- [x] `[Opus]` `0114`: `tool_teams` and `tool_team_apps` — read by every signed-in person, written by admins; seeded once with today's five headings. Dry-run on staging with `scripts/trials/tool-teams.sql` under RLS as the staff account and as the admin; proved to bite (with the insert policy loosened it fails at TRIAL 2).
- [x] `[Opus]` `lib/nav/` (the shell's read and the pure arranging rule, seven tests); the sidebar's closed teams; the home page and Settings' grant lists follow the same teams; `group` leaves `lib/tools.ts`. The sidebar's read degrades to one list on failure, and re-throws Next's own signals (`unstable_rethrow` — the first build showed the catch swallowing them). Types for `0114` written by hand.
- [x] `[Opus]` **Settings → Teams**: make, rename, reorder and delete teams; pick each tool's team. The sidebar and Teams screen rendered through a throwaway probe — desktop light and dark, a true 390px phone (drawer open; Teams with a delete confirmation). One fix from looking: on a phone, a team's buttons now wrap before its name is cut short. **No screen has been opened signed in.**
- [x] ~~`[Fable]` Review `0114`~~ — **skipped on the founder's explicit word** (2026-10-13: "You review it"). In its place `[Opus]` reviewed against `SECURITY.md` and `BUGCATCHER.md`: RLS on both tables, one SELECT policy each, every write `is_admin()` and asserted so, no anon policy, no view or function (so no revokes owed), `has_app()`/`is_admin()` untouched; every action calls `requireAdmin` first (five of five); no admin or browser client; every read checks `error`, completeness through `fetchAll`; no embeds; colours are tokens only. Findings, fixed: the sidebar's catch swallowed Next's own signals; a team's list id appeared twice (rail and drawer).
- [x] `[Opus]` Applied to staging (`0001`–`0114`); regenerated types identical to the hand-written ones; `db:check-views` and `db:check` clean; the migration re-run and the trial passed on the applied database; every new `select` string run at staging's PostgREST (five teams, twenty tools placed). **The Fable review is due before production**, like `0113`'s.
- [x] `[Opus]` Pull request to `staging` (#91); CI green; merged.
- [x] `[Opus]` **The founder's first look: every tool under Other.** The deployment's log showed `PGRST303` "JWT issued at future" — a just-renewed session a hair ahead of the database's clock — and the layout's fallback lasting until a reload (BUGCATCHER #20). Fixed in the shared retry: that one refusal is now retried, every other token refusal still is not (two tests). The founder chose the fix over a rollback.
- [ ] Founder — the checklist below, on staging.

## Verification — the founder, on staging (fourth piece)

1. Any page: the sidebar shows Overview, then **Management, Operations, Events, People, Admin** as closed rows with a count. Click one — its tools open under it; click again — it closes. Open a tool: its team stays open on the next page.
2. **Settings → Teams** → **New team** "Design". Move it to the top with the arrows. Under _Tools_, set Design Management and Selections to Design — the sidebar moves them at once.
3. Rename a team; delete one — its tools move to **Other** at the bottom of the sidebar, and nobody loses access to anything.
4. The home page's tool cards and a person's apps in **Settings → People** are grouped the same way.
5. On a phone: the menu shows the same closed teams.
6. As the **probe** (it holds `/estimator` and `/inventory`): only the teams holding those two appear, and **Settings → Teams** is refused.

# Fifth piece — Birdwing, the Hospitality section (2026-10-13)

The founder: "We need to build a new section a couple of tools under it, heres the rough build plan tweak it as neccesary in our code base with our rools, to keep it modular seperate etc, another tool set in our tool box and build it" — with Fable's `BIRDWING-BUILD-PLAN.md` and `birdwing-consolidated.html` (the "before" picture). Two tools under a new **Hospitality** team: **Birdwing Stays** (`/birdwing` — bookings, rooms, calendar, charges, invoice, receipts, cross-charge) and **Birdwing Books** (`/birdwing-books` — expenses, attendance, salary). Built by `[Opus]` on `feature/birdwing`. The rules live in each tool's `PLAN.md`; this section holds only what is open.

**Where the build plan was tweaked to this codebase:**

- Migrations are `0115` (Stays), `0116` (Books), `0117` (the facts views) — staging was already at `0114`.
- No `ToolGroup`/`GROUP_ORDER`: teams live in the database since `0114`, so `0115` makes a **Hospitality** team holding both tools (only if none exists; a re-run never fights Settings → Teams).
- The multi-step operations (`birdwing_issue_invoice`, `birdwing_confirm_salary`) are **security invoker**, the `issue_transmittal` shape — RLS stays the boundary, no definer carries its own grant check.
- **The letterhead is a Masters company** (PRODUCT.md): picked once in Birdwing → Settings; bank, UPI and the cancellation policy are typed there once, never seeded.
- **One private bucket per tool** (`birdwing-stays`, `birdwing-books`) instead of one bucket with two prefixes — each tool self-contained.
- **Room-days and guest-days come from the stays**, as the laptop app worked them out: Books reads one counts-only view, `birdwing_occupancy_facts` (no names, no money), instead of staff typing rooms served.
- A **room block** is a stay with `is_block` (no guest, no use, no charges — a composite key makes it so); a cancelled stay **releases** its rooms (`released_at`) rather than deleting them.
- An invoice row exists **only once issued**; the "draft" is the stay's charges, previewed with a DRAFT watermark.
- The import reads the laptop app's own parsed data (`seed.json` — 220 stays, 599 expense lines, 767 attendance days, the 13 rates, bank/UPI/policy) rather than re-parsing the workbooks.
- **Phase 5 (the guest's own check-in link) is not built**: it needs the first new public prefix since `/deck/`, argued in SECURITY.md first. Check-in details are staff-entered on the stay.

## Steps

- [x] `[Opus]` `0115` and `0116` written, with `scripts/trials/birdwing-stays.sql` and `birdwing-books.sql`: dry-run on staging under RLS as a single-grant person, and each proved to bite (without the overlap guard Stays fails at TRIAL 3; without the closed-month guard Books fails at TRIAL 8).
- [x] ~~`[Fable]` Review `0115`/`0116`~~ — **skipped on the founder's explicit word for staging** (2026-10-13: "Opus reviews, apply"). In its place `[Opus]` reviewed against `SECURITY.md` and `BUGCATCHER.md`: RLS on every table, exactly one SELECT policy each, nothing for anon (all asserted in the files); no definer function — every function runs as the caller, execute revoked from `public, anon` (trigger functions from `authenticated` too); the one view money-free and name-free, write grants revoked, pinned in the manifest; both buckets private with `public.has_app` qualified; both app CHECKs restated in full. No findings. **The Fable review is due before production.**
- [x] `[Opus]` Applied to staging (`0001`–`0116`); types regenerated (additions only); `db:check-views` and `db:check` clean; both migrations re-run and both trials passed on the applied database.
- [x] `[Opus]` Both tools registered. **Stays**: welcome, calendar (month and week), stays list, the two-step new stay, the stay page (rooms, charges, invoice and its PDF, receipts, cross-charge or write-off, check-in details, documents), Review, Settings. **Books**: welcome, expenses with bills and a CSV download, the sheet upload with its preview, attendance (today first, then the month), salaries, Settings. Pure rules tested (`lib/birdwing/*`, `lib/birdwing-books/*`: status machine, money, calendar, forms, invoice shaping, payroll, the upload reader). Shared pieces made where a third copy would have been: `components/ui/confirm-dialog`, `components/ui/upload-button`, `lib/uploads/`, `parseCsv`, `amountInWords`.
- [x] `[Opus]` `0117` — three owner views for Financial Management and Reporter (`scripts/trials/birdwing-facts.sql`, proved to bite: with `/birdwing` let in it fails at TRIAL 3). ~~`[Fable]` Review~~ — **skipped on the founder's explicit word for staging** (2026-10-13, asked again for `0117`: "Opus reviews, apply"). `[Opus]` reviewed: write grants revoked and asserted, each view gated in its own `WHERE` to `/financial-management` or `/reporter` and asserted, no phone/email/ID column (asserted), no table policy touched, manifest rows added; the grant warnings for both name Birdwing now. Applied to staging; `db:check-views` 23 of 23 pinned; the trial re-ran on the applied database. **The Fable review is due before production.**
- [x] `[Opus]` Financial Management → **Birdwing** tab (the consolidated page's eight tiles, month by month, who the rooms were for, where the money went, occupancy, what is pending) and Reporter's **Birdwing stays** and **Birdwing expenses** datasets.
- [x] `[Opus]` `scripts/import-birdwing.ts` — **run on staging** (one transaction; a second run adds nothing): 220 stays (BW-0001…0220), 545 charge lines, 216 old invoices kept as history, 135 receipts, 586 expense lines (13 at ₹0 left out), 767 attendance days, five staff (Sujitha switched off), Sajna's pay rule, and Maloor Eco Farms added to Masters → Companies and set as the invoicing company, with bank, UPI and policy. Reconciled to the paisa against the consolidated page — billed ₹21,38,120.11, collected ₹14,03,745.48, expenses ₹23,91,966.50 + ₹70,000 pre-entered — and read back through Financial Management's views as the admin: the same, pending ₹7,34,374.63, occupancy 433 of 1,460 room-nights. The invoice counter is untouched at 132. 128 stays carry review flags (67 Goodearth stays never collected, 11 receivable mismatches, 9 shared invoice numbers on 18 rows, 14 room counts, 3 date problems, 10 commission splits, the Kalidas draft).
- [x] `[Opus]` Books refuses to confirm a salary for a month already holding that person's salary from the old sheet (it would pay the month twice).
- [x] `[Opus]` Checks: prettier, lint, typecheck, 1,094 tests, `next build` (all 18 Birdwing routes), `check:actions` (381 lists clean). Every new `select` string and filter run at staging's PostgREST (all valid). 63 exported reads and writes, each opening with its grant check; no admin or browser client; no raw colour. The invoice PDF rendered from real figures and its text read back. The interactive pieces rendered through a throwaway probe (deleted) — the stay panels on a desktop, attendance in dark mode and the new-stay form on a true 390px phone (no sideways scroll), the salary cards in dark mode. **No screen has been opened signed in**: the founder's vet is the first look.
- [x] ~~`[Fable]` Approval pass before the merge~~ — **skipped on the founder's explicit word for this merge** (2026-10-13: "Merge when CI is green"). In its place `[Opus]` reviewed the full diff against this plan, `SECURITY.md` and `BUGCATCHER.md` (the checks two steps up); three findings fixed before the merge (the welcome's "to invoice" count, the room rate's window, a placeholder). Pull request #93 into `staging`; CI green; merged.
- [ ] Founder — the checklist below, on staging. Then production: Fable's review of `0115`–`0117` and the code, the migrations, then the import (`TODO.md`).

## Verification — the founder, on staging (fifth piece)

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
11. **Attendance** on your phone: today at the top — mark Sajna _Present_, tap her name, in 07:30, out 18:30, Save.
12. **Settings** → give Amal, Appu and Bijeeth their pay rules (Amal ₹30,000, Appu ₹40,000, no shift = fixed).
13. **Salaries → October 2026**: Amal's card says ₹30,000 is already in Expenses from the old sheet, and won't confirm. **November**: once the month begins, Sajna's figures are worked out from attendance.
14. **Financial Management → Birdwing**: the tiles match the HTML page — billed ₹21.4 L, collected ₹14.0 L, pending ₹7.3 L, expenses ₹23.9 L, occupancy about 30% (estimated) — less what steps 5–8 moved.
15. **Reporter** → new report → **Birdwing stays** → group by _Who for_, sum _Pending_.
16. As the **probe** (it holds `/estimator` and `/inventory`): neither Birdwing tool appears, and `/birdwing` sends it home.

## The calendar shows the history (2026-10-13)

The founder, after the merge: "the calender in the birdwing tab dosent show the history as per our sheet etc please add that". The old sheet never named rooms, so its stays had nothing to sit in. Built by `[Opus]` on `feature/birdwing-calendar-history`; no migration; the rule is in `birdwing/PLAN.md`.

- [x] `[Opus]` Stays with no room drawn under the rooms (`packUnplaced`, `unnamedRoomsByDay`, four new tests), "+ not named" under "Taken", a month jump. Looked at with staging's real June and July 2026 through a throwaway probe (deleted) — that look caught day columns stretched by long names and the month cut at the 14th, fixed with a fixed-layout table; light, dark, and a week on a true 390px phone. Checks green.
- [x] ~~`[Fable]` Approval pass~~ — **skipped on the founder's explicit word for this merge** (2026-10-13: "Merge when CI is green"); `[Opus]` reviewed the diff: the one new read opens with the grant check, reads completely and checks every error; no database change; tokens only. Pull request #94 into `staging`; CI green; merged.
- [ ] Founder — **Stays → Calendar**, type **2026-06** in the month box → **Go**: June's stays from the sheet appear under the rooms as dashed bars with their names; "+ not named" counts their rooms each night. Hover a short bar for the whole name, or tap it to open the stay. **Week** shows one week with names in full.

## Open questions for the founder (from the build plan, §8)

1. **Cost centres** for internal stays — seeded Marketing, Sales, Projects, Directors, Kaadal (editable in Settings). Does a cross-charge need an approver, or is the person who records it enough? Built: the person who records it, named on the line.
2. **Rate card** — the laptop app's 13 heads are seeded **switched off**; read them in Birdwing → Settings and switch on the right ones before the first real charge.
3. **Pay rules** — only Sajna's is known (₹15,000, ₹80/hr OT, ₹80/room-day, shift 08:30–17:30). Amal ₹30,000 and Appu ₹40,000 look fixed; Bijeeth's basis is unknown. Needed before the first salary run.
4. **Grants** — Amal, Akshay on `/birdwing`; who on `/birdwing-books`?
5. **The 67 unpaid internal stays** — bulk-assign cost centres on the Review screen, or one by one?
6. **November 2026 salaries** already in the sheet — imported flagged "future", never confirmed, unless you say drop them.

# Sixth piece — From the model: a SketchUp takeoff becomes a villa's estimate (2026-10-14)

The founder: "i need to prepare a hand off system for this thing in one click to go the tool box as an estimate" — with `TOOLBOX-PLAN.md`, drafted by `[Opus]` beside the Goodearth QS SketchUp extension (`Documents\3Dqs_Sandbox\goodearth-qs`, built outside this repo). Reviewed against the code by `[Opus]` on the founder's word ("see if this plan works and then execute it"); the founder then chose, 2026-10-15: **Opus reviews and lands it** (the Fable review of `0118` is due before production), and **the plan's answers to its open questions 3–7**. Built on `feature/estimator-from-model`. The rules live in `estimator/PLAN.md` (decision 12, and its _Things that will bite_); this section holds only what is open.

**In SketchUp, Goodearth QS → Send to the toolbox** opens the Estimator's **From the model** page in SketchUp's own window, signed in as the person, holding the model's takeoff. Pick the villa (the model remembers it) → the preview says, work by work, _adds_, _replaces the model's rows_, _refused (why)_, _to measure_ or _comes off_ → **Import** → the villa's working estimate has the works and their measurement sheets. Send again after changing the model: the model's rows are replaced, rows typed by hand never touched. Without SketchUp the page takes the takeoff file.

## Where the plan was tweaked to the code

- **The copy function carries the model flags** (`estimator_copy_estimate_contents`, re-created) — without it Make official or a villa started from another villa's estimate would turn model rows into hand rows, and the next send would count them twice.
- **The works list keeps today's measuring rules.** The extension's bundled list marks works not to measure by area — FD.15 base and sides; FD.16, FD.22, FD.29–FD.32 and the Superstructure and MEP package works by hand. `0118` writes those into `model_measure` where blank (on staging: 1 base and sides, 27 by hand — staging's rate book has 21 package works in sqft where the bundled list had 20), and `scripts/import-masters-workbook.ts` does the same when it loads a rate book.
- **A typed quantity is named before it is replaced**: the preview says _Replaces the typed 12 cum._
- **A work the model stops measuring is shown coming off**, since the import replaces the model's rows whole.
- **An older extension leaves an unused box out instead of sending null**: both read as "not used".
- **`plan.md` gains this section rather than being replaced** — it still holds five founder checklists.

## Steps

- [x] `[Opus]` `0118` and `scripts/trials/estimator-from-model.sql`: dry-run on staging under RLS as the single-grant person (`/estimator` alone, then `/inventory` alone), and proved to bite four ways — with no delete of the old model rows it fails at TRIAL 3 (doubled), with no return to _to measure_ at TRIAL 3 (stale), with a copy that drops the flag at TRIAL 4, with no working-estimate check at TRIAL 5.
- [x] ~~`[Fable]` Review `0118`~~ — **skipped on the founder's explicit word for staging** (2026-10-15: "Opus reviews and lands it"). In its place `[Opus]` reviewed against `SECURITY.md` and `BUGCATCHER.md`: no table, view or policy added (the measurement table's four policies asserted); both functions security invoker, execute revoked from `public, anon` and granted to `authenticated`, asserted; the copy function diffed against `0098`'s — only the two columns differ, and the file asserts the copy carries `from_model`; no money column; nothing embeds `profiles` through `estimator_estimates`, so the new FK makes no select ambiguous. No findings. Applied to staging (`0001`–`0118`); types regenerated (additions only); `db:check` level, `db:check-views` 23 of 23; the migration re-run and the trial passed on the applied database. **The Fable review is due before production.**
- [x] `[Opus]` `measurement-rules.ts`, `model-takeoff.ts` (17 tests), `sheet-sync.ts`, the import reads and actions; edit, remove and duplicate refuse a model row.
- [x] `[Opus]` The From the model page; _Measured from …_ and the _Model_ rows on the estimate; **From a SketchUp model** on Estimates; **Download works list for SketchUp** on the Rate book; _Measured from the model as_ on a work's page; the importer's measuring rules.
- [x] `[Opus]` Checks: prettier, lint, typecheck, 1,115 tests, `next build`, `check:actions`. Every new `select` string at staging's PostgREST (all valid). The extension's real sample takeoff, read by `planImport` against staging's real rate book and imported by `import_model_rows` as the single-grant person in a rolled-back transaction: 18 works, 36 rows, every total as planned (FD.9 1.81845 cum, PF.8 365.542 sqft), three to measure. The page rendered through a throwaway probe (deleted) with a stand-in SketchUp bridge at SketchUp's 1180px, light and dark: the takeoff arrived over the bridge; the preview showed every kind. That look caught a spinner inside a paragraph (a hydration error) and two clumsy sentences, all fixed. **No screen has been opened signed in, and no real SketchUp send has reached the toolbox** — a model session can't sign in; the founder's vet is the first look.
- [x] ~~`[Fable]` Approval pass~~ — **skipped on the founder's explicit word for this merge** (2026-10-15: "Opus reviews and lands it"). In its place `[Opus]` reviewed the full diff against this plan, `SECURITY.md` and `BUGCATCHER.md`: every new read and action opens with `requireTool("/estimator")` (the works-list route through its read; signed out, both new routes answer 307 → `/login` on the preview); no admin or browser client; every read checks its error and lists read through `fetchAll`; actions answer in sentences and never throw; no `"use server"` re-export; tokens only, light and dark. Findings fixed before the merge: the spinner in a paragraph, two sentences. Pull request #95 into `staging`; CI green; merged.
- [ ] Founder — the checklist below, on staging. Then production: Fable's review of `0118`, then `0118` (before the masters workbook import — the importer now writes `model_measure`), the merge, and the extension's default address switched to `toolbox.goodearthkannur.org` (a new `.rbz` for the team).

## Verification — the founder, on staging (sixth piece)

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

## Still open (the plan's questions 1–2 — rate-book data, not this build)

1. **Superstructure materials.** SS and MEP works are shares of a package rate per sqft; their sub-works (SS.2a–SS.2g, SS.5a, SS.9b, SS.6a–SS.6e, SS.11a/b) have no unit. Give them physical units and recipes, so the model can drive blocks and cement for the superstructure?
2. **FD.16, FD.22, FD.29–FD.32** are sqft: shuttering area (base + sides) or plan area? Until answered they are measured by hand.

# Seventh piece — the Saarang tracker, inside Client Relations (2026-10-16)

The founder: "i need to add this module, with this kind of flow and ux for my CRM users on the tool box, it can either be in the client management tool or an additional tool, where it gets linked etc so make a build plan" — with `saarang-tracker-preview.standalone.html`, the self-hosted Saarang Tracker (`server.js` and `data.json`, exported 15 Oct, in Downloads). Drafted by `[Opus]` against the code and staging's real rows; the founder answered its questions the same day. Branch `feature/client-relations-actions`.

## Where it goes: Client Relations, not a new tool

- **Same people, same plots.** The tracker's users are the CRM team (Anu, Sayooj, Sebastina) and two managers (Saurav and Siddharth — both admins here). Its "deal" is Client Relations' engagement: one per plot, with a sales owner, sale deed and CA status, who holds the original, the acknowledgement, the bottleneck, the plot-amount due date and notes — every one already a column of `client_engagements` or its plot instalment.
- **A separate tool would copy those columns or read them across a boundary** — two registers of who bought which plot, the thing the toolbox exists to end. Inside Client Relations it is one new table, one grant, and no new row in STATUS.md's contract table.
- **What is genuinely new is the to-do list** — an owner, a date and a status on every promise to a client — and screens that make overdue impossible to miss.

## The founder's decisions (2026-10-16)

1. **"anyone with access can see is ok."** Everyone holding `/client-relations` sees every plot and every action. Each person opens on their own list and can switch to everyone's.
2. **"forget relay for this build do as needed."** The CRM team types how far a villa's build has got and the three design checks (client confirmed design, permit, working drawing). Client Relations' decision 4 ("design and site status come from Relay only") is amended for these.
3. **"construction stage lets make a masters table that lists it and then link it here."** Build progress is a Masters list; each plot points at one of its stages.
4. **"project is enough."** Projects are the only grouping — no phases. Phase 3 is a project of its own.
5. **"ill grant them access"** — Anu, Sayooj and Sebastina get `/client-relations` from the founder.
6. **"study this ui thats the flow they would love so integrate accordingly and edit the current tool to match the vibe as well."** The tracker's flow is the brief for the new screens, and every existing Client Relations screen is reworked to match (_The look_, below).

Unanswered, so the draft's recommendation stands: **plot payment stays worked out** from the plot instalment and its receipts (Collections), never typed — "Pending – registration" is already the registration stage, "Loan – awaiting bank" the _Bank / loan_ bottleneck.

## The look — the tracker's flow in the toolbox's materials

**The flow, layout and feel come across whole; the paint does not.** DESIGN.md binds every tool, so these screens are built in the toolbox's stone tones, Geist and its one green, and Client Relations stays part of one product. The tracker's blue and its typefaces would be a toolbox-wide skin — the founder's call, not this build's.

What carries the feel, read from the tracker:

- **One tap sets a value.** Chips, not dropdowns; a chip saves at once. Text saves when you leave the box.
- **Every row says what to do next.** The next action and its date on every plot card; the greeting's instruction ("Start with the 3 overdue items"); each section's hint ("Clear it, or tap the date and set a real one").
- **Urgency is colour and words, never colour alone** — "3 days overdue", "Tomorrow", "Fri 17 Oct".
- **People are faces** — the same coloured initials for a person everywhere.
- **Plot numbers read like surveyed lots** — large and monospaced.
- **Counts before tables**, and **undo instead of "are you sure"** for the everyday tick.

| In the tracker                                                   | In the toolbox                                                                                                                                                      |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Blue for "this week"; red overdue; amber no date, assumed, stale | `info`; `danger`; `warning`. `success` for on track and done. The action colour stays the green `accent`                                                            |
| Bricolage Grotesque headings, Onest body                         | Geist with range: `Figure` for the big numbers, the Section Label for small capitals                                                                                |
| JetBrains Mono plot numbers                                      | `font-mono` (DESIGN.md: references are mono)                                                                                                                        |
| A colour per person                                              | `Avatar` (`lib/color-hash`) — the same colour everywhere in the toolbox                                                                                             |
| Option chips in the drawer                                       | **`components/ui/choice-chips.tsx`, new and shared** — it would be the fourth hand-rolled copy (Birdwing attendance, Relay's department picker, Reporter's builder) |
| A pill that opens a popover (owner, due, status)                 | A chip-shaped trigger on `DropdownMenu` — Radix gives focus, Escape and the keyboard                                                                                |
| The dark "Needs you" card                                        | The one ink card on the screen (`bg-foreground text-background`)                                                                                                    |
| A load bar per person                                            | A bar of overdue (`danger`), waiting on management (ink), this week (`info`) and later, its numbers in the legend beside it                                         |
| The slide-in plot drawer                                         | The plot page — the same cards in the same order; Back returns to the grid                                                                                          |
| A toast with Undo                                                | A small Undo bar inside Client Relations (Relay holds the first copy; the third becomes shared)                                                                     |
| Sticky tabs and phase chips                                      | `ToolNav` and project chips as every tool has them — not sticky                                                                                                     |
| A ticked card sliding away                                       | No new motion: the tick fills, the card goes, the Undo bar appears                                                                                                  |
| Refreshing every 20 seconds                                      | None — a colleague's change shows on the next click, as in every tool                                                                                               |

## The screens

1. **Actions** — new, the first tab and the welcome's main door.
   - **Composer**: type the step, pick plot, owner, due date, Sales or Kaadal; Enter adds it.
   - Sections **Needs management · Overdue · Next 7 days · Later**, and _Show done_. No date counts as overdue (the tracker's rule — it forces a real date); an imported date the old sheet never had says _date assumed_ until someone sets one.
   - **A card**: a round tick (done, with Undo), the text edited in place, and chips for the plot, the **due** date (Today, Tomorrow, This Friday, Next Monday, In 2 weeks, or a date), the **owner** (with each person's open count), Kaadal, a non-open status, notes, and **•••** for status (Open, Waiting on client, Waiting on management, Done), track, notes, open the plot, move to another plot. "Edited 15 Oct by Saurav" on the right.
   - **Admins see the team strip**: _Needs you_ (everything waiting on management) and a card per team member — open count, overdue large, the load bar — and the sold / sale deeds / CAs / still-need-a-CA line beneath. Click a card to see only theirs.
   - **Everyone else sees the greeting** ("Good morning, Anu.", overdue / this week / later) over their own list, with a _Mine · Everyone_ switch.
   - Project chips and _Kaadal_ filter it.
2. **Plots** — the lot-card grid, grouped by project. Each card: the plot number large, the client, a health pill (Overdue · Needs management · No next step · Not updated in 2 weeks · On track · Handed over), the five-step rail (buyer → sale deed → CA → build → handed over, the build step filling with progress), the build stage, the next action and its date, the owner, the Kaadal stage. Health chips with counts filter it; the headline band stays on top; search sits on the shared `list-toolbar`.
3. **The plot page** — a header with the plot number large, the client's name editable in place, project, status and health; then cards in the tracker's order: **Next steps** (the plot's actions and a composer) · **Sales** (owner, bottleneck, the plot instalment from Collections) · **Sale deed** · **Construction agreement** (with the three design checks) · **Build progress** (◀ stage ▶ and a segment per Masters stage) · **Kaadal interiors** (stage, owner, note) · **Collections** (today's schedule and receipts) · **Context** (the notes, the values, when it last changed) · **Relay** (trails as filed, at the foot). Every dropdown becomes chips.
4. **Clients** — client cards instead of the table: avatar, name, stage, their plots as monospaced chips, who handles them, open and overdue actions, mobile. Search and filters on `list-toolbar`; the new-client dialog stays.
5. **A client's page** — avatar, name and stage on top; their plots as lot cards; their actions with a composer; contact details.
6. **Collections** — the same sections as Actions (Overdue · Due in 7 days · Later): plot chip, client, instalment, amount in monospace, a due pill; totals over every matched row.
7. **Welcome** — overdue, due this week and waiting on management (counts only, never rupees); Actions the main door.
8. **Masters → Stages** — build progress beside construction stages, each card saying what it is for: add, rename, reorder with arrows, deactivate. No delete: a stage a plot sits on cannot go.

## What it deliberately leaves out

- **Fix first** — the old sheets' conflicts list; all 11 are resolved. The import's difference list does that job for the move.
- **Combine plots** — combined plots are already one Masters plot (_Plot 22 & 23_); combining is a Masters edit.
- **Typed plot payment** (above), **phases** (decision 4), **refreshing every 20 seconds**.
- Reminders by email or Google Chat, a _Your next steps_ panel on the home page, a Reporter dataset of actions — each a later piece if wanted.

## The database

**`0119_progress_stages.sql` — Masters**

- **`progress_stages`**: `name` (unique), `sort_order` (steps of 10), `is_active`, who and when; read by every signed-in person, written by `/masters` (0053's shape), audited. Seeded with the tracker's nine: Agreement, Excavation & levelling, Ground floor brickwork, Ground floor slab, First floor slab, Internal plastering, Floor laying, Painting & polishing, Final handover. No stage means not started; **the last active stage means handed over**.
- **Not `construction_stages`.** That list now holds the workbook's cost packages (Engineering Consultation … Carpentry) that indents and budget lines are tagged with — what money is spent on, not how far a villa has got. Two lists, two meanings, and Masters' labels say which is which. The payment schedule's nine fixed stages (0050) are not linked to either in this build.

**`0120_client_actions.sql` — Client Relations**

- **`client_actions`**: `engagement_id` (null is a general action with no plot), `action` (1–500 characters), `owner_id`, `due_on`, `due_assumed`, `status` (`open`, `waiting_client`, `waiting_management`, `done`), `track` (`sales`, `kaadal`), `notes`, `done_on` (set exactly when done — a CHECK), who and when. RLS on; one SELECT, one INSERT and one UPDATE policy, each `has_app('/client-relations')`; **no DELETE policy — an action is marked done, never deleted** (the tracker's rule). A plot with actions refuses deletion.
- **`client_engagements` gains** `progress_stage_id` (→ `progress_stages`, delete refused), `design_confirmed_on`, `permit_on`, `working_drawing_on` (dates — the chip stamps today; Client Relations' "a date, not a boolean"), `kaadal_stage` (To pitch, Pitch done, Retainer pending, Retainer paid, In design, Execution, Closed – no interiors), `kaadal_owner_id`, `kaadal_note`.
- **Its lists widen to the tracker's** — each CHECK dropped and re-added wider, so nothing stored becomes invalid: deed and CA status + _Not started_, _Drafting_; original with + _Sreejayan_, _Tarana_; acknowledgement + _With Sreejayan_, _Requested from client_, _Pending_; bottlenecks + _Legal / documents_, _Bank / loan_. `stages.ts` mirrors each in the same commit.
- **`client_relations_team()`** — who an action can be given to: active, non-admin people holding `/client-relations` directly or through a role. A member cannot read anyone else's grants (`user_apps` is own-row), so it is a small `security definer` function checking `has_app('/client-relations')` in its body and returning id and name only; execute revoked from `public, anon`. It reads the shell's grant tables, so it gets a line in SECURITY.md's cross-tool section.
- **No view changes** — `crm_milestone_facts` and `crm_receipt_facts` keep their columns; actions are prose and never join a facts view (Client Relations' rule 6). `db:check-views` stays clean.
- Both files end asserting what they claim. `scripts/trials/client-actions.sql` runs as a single-grant person and is proved to bite: a delete refused, a no-grant person refused, `done_on` out of step refused, a stage in use refused deletion.

## The move from the self-hosted tracker — `scripts/import-saarang-tracker.ts`

`--project <ref> --json <data.json>`, a dry run unless `--commit`, matched on natural keys so a second run writes nothing.

- **Plots match by number** (_Plot 22-23_ → `P22-23`), people by email. **It fills blanks and never overwrites** what Client Relations already holds; every difference is printed instead.
- The tracker's stage → the Masters stage of the same name; _Not started_ → none. A "Yes" design check is stamped with the tracker's last-updated day, the only date it has. The payment word goes into the notes.
- **Actions**: all 42 (Anu 26, Sayooj 13, Sebastina 3; 22 Sales, 20 Kaadal), with owner, date, track and notes; the 30 with _date assumed_ keep the flag.
- **Masters is never written by the import.** Where the tracker and Masters disagree on who holds a plot it leaves the plot's fields alone and lists it; its actions still land on it. Today, six: Plots 3, 35 and 43 (the tracker names a buyer, Masters has none), 9 and 27 (Masters names a buyer, the tracker says available), and 33–34 (one combined deal in the tracker, two plots in Masters — its action lands with no plot). Plots 18–21 are in Masters and not in the tracker.
- **Phase 3's 27 units come in once their project has them in Masters.**
- Staging first. Production on cutover day from a fresh `/api/export`; the tracker stops taking changes that morning.

## The founder's second answers (2026-10-16)

"saarang west is the project, add that and do this, some buyers cancel some new buyers have come add them to masters and do this, put it on staging boss" — so **`scripts/update-saarang-register.ts` brings Masters in line with the tracker before the import runs**:

1. **Phase 3 is _Saarang West - Villas_.** Its 27 plots went into Masters as W1 … W29 (W21-22 and W23-24 combined, as the tracker sells them), named "Plot 1" …, one villa each, V1 …, named with its configuration — "Villa 3 (1BHK Study)" — because a unit's type is only villa, apartment or duplex. Masters' own placeholder there ("Unit 1", no villa) is left as it was.
2. **The tracker is right about the buyers.** Plots 9 and 27 are available again, and Plot 33 & 34's earlier buyer gave it up — each marked lost with the reason ("Booking cancelled — no longer holds Plot 9 …"), so Client Relations keeps the history. Plots 3, 35, 43 and 33 & 34 have new buyers. Plots 33 and 34 are one plot, "Plot 33 & 34" (P33-34, Villa 33) — the "Plot 22 & 23" precedent; Plot 34's empty villa and record were removed. Plot 9's draft design selection stays with its villa. Plots 18–21 are untouched.
3. **"put it on staging"** is the founder's word for this merge in place of Fable's review and approval pass; Opus reviewed instead (Steps). **Fable's review of `0119`/`0120` and the code is due before production.**
4. Plot payment was not raised again: it stays worked out from Collections.

## Steps

- [x] Founder — answered the draft's questions (2026-10-16).
- [x] `[Opus]` `0119`, `0120` and `scripts/trials/client-actions.sql`: dry-run on staging under RLS as the single-grant staff account, the probe and the admin, and proved to bite four ways — with a delete policy it fails at TRIAL 4, without the done-date CHECK at TRIAL 3, with the team function's grant check removed at TRIAL 7, without the stage foreign key at TRIAL 8.
- [x] ~~`[Fable]` Review `0119` and `0120`~~ — **skipped on the founder's word for staging** (2026-10-16: "put it on staging boss"). In its place `[Opus]` reviewed against `SECURITY.md` and `BUGCATCHER.md`: RLS on both tables, one SELECT policy each, writes gated (`/masters`, `/client-relations`), no anon policy, no DELETE policy on `client_actions` (all asserted); the one definer function checks `has_app('/client-relations')` in its body, execute revoked from `public, anon` (asserted), and is only ever called directly (#11); no view, so no write revokes owed (#3); `client_engagements`' CHECKs only widened and its three policies untouched; no money column. No findings. Applied to staging (`0001`–`0120`); `db:check` level, `db:check-views` clean; types regenerated — the hand-written ones, reordered; the trial re-run on the applied database. **The Fable review is due before production.**
- [x] `[Opus]` `lib/client-relations/next-steps.ts` — pure, `today` passed in, 11 tests: an action's section and due label, the due menu's picks, a plot's status, health, rail and number, each person's load. `stages.ts` gains the tracker's lists; `lib/format.ts` gains `formatDayDate`, `formatShortDate` and `hourInIndia`. Types for `0119`/`0120` written by hand until applied.
- [x] `[Opus]` `components/ui/choice-chips.tsx`, and its line in DESIGN.md; `Avatar` takes `letters={2}` (Sayooj and Sebastina read Sa and Se).
- [x] `[Opus]` Masters → Stages: build progress beside construction stages (`lib/masters/progress-stages.ts`, `progress-stages-actions.ts`); the stage forms now take their actions as props, so both cards share them.
- [x] `[Opus]` Reads and writes (`next-steps-queries.ts`, `next-steps-actions.ts`, and `queries.ts` carrying the new fields, plot numbers and each client's open actions) — each opening with `requireTool("/client-relations")`, returning `ActionState`, revalidating `("/client-relations", "layout")`, reading lists through `fetchAll` and checking every `error`; the owner checked against `client_relations_team()` on every write. The old save-all form, its tabs and the paged plot list are gone.
- [x] `[Opus]` The Actions tab.
- [x] `[Opus]` The Plots grid and the plot page.
- [x] `[Opus]` Clients, a client's page, Collections, the welcome, Actions first in the nav.
- [x] `[Opus]` Checks: prettier, lint, typecheck, 1,130 tests, `next build`, `check:actions` — all green. Rendered through a throwaway probe (deleted) with sample data from the export, on a desktop and a true 390px phone, light and dark — Actions as a manager and as a member, the Plots grid, the plot page's cards; nothing scrolls sideways. That look caught three things, fixed: a team card counted management items as overdue; a long date pill squeezed a lot card's action; the deed chips wrapped into narrow columns. Once applied, every new `select` string ran at staging's PostgREST — all valid. **No screen has been opened signed in.**
- [x] `[Opus]` `scripts/update-saarang-register.ts` (the second answers, above), then `scripts/import-saarang-tracker.ts` — both on staging, each run twice; the second run of each changes nothing. Saarang: 42 plots, 36 with a buyer, 30 sale deeds and 23 CAs signed, 23 with a build stage, 25 with Kaadal, all 42 actions on their plots. Saarang West: 27 plots, 6 with a buyer. Both read the export by `lib/client-relations/saarang-tracker.ts`, tested.
- [x] `[Opus]` Docs: Client Relations' `PLAN.md` (decisions 4–7), Masters' `PLAN.md`, `STATUS.md`, `TODO.md`, SECURITY.md's line for `client_relations_team()`, DESIGN.md's chips.
- [x] ~~`[Fable]` Approval pass~~ — **skipped on the founder's word for this merge** ("put it on staging boss"). In its place `[Opus]` re-reviewed the full diff against this plan, `SECURITY.md` and `BUGCATCHER.md`: no admin or browser client; no raw colour, hex or colour transition; every route has its `loading.tsx`; actions answer in sentences and never throw; no `"use server"` re-export; every list read through `fetchAll` with its `error` checked. One finding, fixed: three exported helpers relied on their callers for the grant check, and now check it themselves. Pull request #96 into `staging`; CI green; signed out, the new routes answer 307 → `/login` on the preview; merged.
- [ ] Founder — the checklist below, on staging; grant `/client-relations` to Anu, Sayooj and Sebastina there.
- [ ] Production: Fable's review of `0119`/`0120` and the code; then on cutover day the tracker stops taking changes, a fresh `/api/export` into `/data`, `0119` and `0120`, `scripts/update-saarang-register.ts` and `scripts/import-saarang-tracker.ts` (dry run first — the register script refuses a plot whose old buyer left money or signed papers on it), the merge, and the self-hosted tracker switched off.

## Verification — the founder, on staging (seventh piece)

1. **Masters → Stages**: the Build progress card lists the nine stages in order, the last marked Handover. Add "Waterproofing", move it up between the slabs with the arrows, then deactivate it.
2. **Client Relations** opens on its welcome: overdue, this week, waiting on management. **Actions** is the first door.
3. **Actions**: the team strip shows Anu, Sayooj and Sebastina with the imported counts (Anu 26 open). Click Anu — only hers. **Needs you** is empty.
4. Type "Share 3D with client", pick Plot 4, Sayooj, **Tomorrow** → **Add**: it appears under _Next 7 days_.
5. Tick it — it leaves the list; **Undo** brings it back. Tick an overdue one, then _Show done_.
6. On a _date assumed_ action pick **This Friday** — the flag goes and it moves to _Next 7 days_.
7. **••• → Waiting on management** — it moves to the top, and **Needs you** counts 1.
8. **Plots**: lot cards with health pills; the **No next step** chip lists sold plots with nothing open. Open Plot 10 → **Next steps** on top; add one there; tap a Kaadal stage; step the build forward with ▶ — the card's rail fills.
9. **Clients**: cards with faces and plot chips; open one — their plots and their actions. **Collections** reads like Actions: overdue first.
10. **Plots → Saarang West - Villas**: 27 cards, six with a buyer, each showing its configuration (1BHK Study …). In Saarang, **Plot 33 & 34** is one card; Plots 9 and 27 have no buyer; Plots 3, 35 and 43 have their new buyers. **Clients → Stage: Lost** lists the three who cancelled, each with its reason.
11. **Anu, signed in on her phone**: she opens on her own list with the greeting; the composer, the menus, the chips and the tick work with a thumb; nothing scrolls sideways.
12. As the **probe** (it holds `/estimator` and `/inventory`): Client Relations is not in the sidebar, and `/client-relations/actions` sends it home.

# Eighth piece — only whoever set an action closes it (2026-10-16)

The founder, after the seventh piece reached staging: "i would say you can only complete an action that you set, not everyone can". Asked, the founder chose all three recommendations: **whoever set it closes it, and so does a manager**; **the owner's tick marks it finished, waiting for the setter to confirm**; **an action brought in from the tracker counts its owner as the setter**. Built by `[Opus]` on `feature/client-relations-setter-closes`. The rule lives in Client Relations' `PLAN.md` (rule 13).

- [x] `[Opus]` `0121`: a fifth status, `awaiting_confirmation`; the `client_actions_guard` trigger — the setter pinned on insert (a script's insert pins the owner) and never changed, and closing or reopening only by the setter or `is_admin()`; the 42 imported actions' setter pinned to their owner (`set_updated_at` stepping aside so none reads "Edited today"). `scripts/trials/client-actions-setter.sql` runs as two single-grant people and the admin, and is proved to bite three ways — without the closing check it fails at TRIAL 3, without the insert pin at TRIAL 2, with the setter left changeable at TRIAL 3.
- [x] `[Opus]` `closeRight` and `setterOf` in `next-steps.ts` (13 tests): close, finish or none. A finished action is never overdue and never its owner's load; a plot's next action prefers real work to what waits to be confirmed.
- [x] `[Opus]` The tick: the setter or a manager closes and reopens; the owner marks finished, and can take that back; anyone else's is dashed and locked, its title saying who closes it. **Waiting to confirm** tops the list; a person's own list holds what they set that waits for them; the greeting counts it; ••• greys out what you may not choose. `updateNextStep` checks the same rule and answers in a sentence. Rendered through a throwaway probe (deleted) with every state.
- [x] ~~`[Fable]` Review `0121`~~ — **skipped on the founder's word for staging** (2026-10-16: "put it on staging"). In its place `[Opus]` reviewed against `SECURITY.md` and `BUGCATCHER.md`: no table, policy or view added (three policies and no DELETE, asserted); the status CHECK only widened; the guard runs as the caller and no client role may execute it (asserted), reaching `is_admin()`, which carries `session_is_verified()`; a session with no `auth.uid()` passes, and no client role reaches the table without one (no anon policy, `0120`); the backfill steps `set_updated_at` aside and the file asserts it is back on. No findings. Applied to staging (`0001`–`0121`); `db:check` level, `db:check-views` clean; the trial re-run on the applied database; all 42 actions' setter is their owner and none reads "Edited today"; the generated types do not change. Pull request #98; CI green; merged. **The Fable review is due before production.**
- [ ] Founder — the checklist below, on staging.
- [ ] Production: with `0119`/`0120`, Fable's review, then `0121` after `0120` and before the import (so the imported actions' setters are pinned as they land).

## Verification — the founder, on staging (eighth piece)

1. **Actions** → add "Trial: send the brochure" for **Anu**, Tomorrow. You set it.
2. Ask Anu (or sign in as her) to open **Actions**: her tick on it says _Mark finished — Siddharth confirms_. She ticks it → it moves to **Waiting to confirm**, "Waiting for Siddharth to confirm".
3. Back as you: it tops your list under **Waiting to confirm**, "Waiting for you to confirm". Tick it → closed. Undo works.
4. Anu cannot open it again; on Sayooj's own actions her tick is dashed and locked.
5. One of Anu's imported actions (from the tracker): she ticks it straight to done — she counts as its setter.

# Ninth piece — Toolbox by Kaadal (2026-10-16)

The founder: the app is "Toolbox by Kaadal" under the Kaadal K; Goodearth stays the company on each document's letterhead. Screens, the tab icon and PDF file details only, no migration; the rule is in `DESIGN.md` (the logo) and `PRODUCT.md`. Built by `[Opus]` on `feature/kaadal-brand` (#99).

- [x] `[Opus]` The K mark (`components/ui/logo.tsx`), the sidebar and sign-in names, the tab title and icon, the PDFs' creator and the report footer.
- [x] ~~`[Fable]` Review~~ — **skipped on the founder's explicit word for this merge** (2026-10-16: "merge"). In its place `[Opus]` re-reviewed the diff against `BUGCATCHER.md`: no database read, upload or permission touched; the logo's two hex fills are the one sanctioned exception (`DESIGN.md`), and its `dark:` follows `data-theme` as the tokens do (#4); the icon is a valid four-size `.ico`; no "Goodearth Toolbox" left on screen. The preview's sign-in page rendered light and dark — burgundy K, blush K. No findings. CI green.
- [ ] Founder — on staging: the sidebar's K and name, the tab icon (hard refresh), the sign-in page, and one PDF (Goodearth letterhead, "Toolbox by Kaadal" in its details or the report footer).
- [ ] At the switch to the new production: the practice banner's link (`lib/environment.ts`) and the sign-in emails' "Goodearth Toolbox (PRACTICE SITE)" change with the domain.

# Tenth piece — each person sees the work assigned to them (2026-10-17)

The founder: "in crm, and maybe other apps, there needs to be a assignment based visibility, so that only those who are assigned a task or own a deal get to see the work except for admins … can we do that for apps we decide that need that feature?" Asked who else sees everything: **"admin and team lead"**; every other recommendation taken ("rest whatever you said is fine"). Built by `[Opus]` on `feature/client-relations-scope`. The rules live in Client Relations' `PLAN.md` (decision 6, rules 14–15), Settings' `PLAN.md` (_Team leads_) and SECURITY.md (_Assigned work_).

- **Built once, for any tool:** `0122` — a **Team lead** tick per person per tool, beside the grant in Settings, offered for tools flagged `scoped` in `lib/tools.ts`; `is_lead()` in the database. Another tool joins with its own migration saying what "assigned" means for its rows — Supervisors would first need to record who supervises which villa.
- **Client Relations:** `0123` — a plot shows to its Sales and Kaadal owners and whoever owns or set an open action on it; an action to its owner, its setter and its plot's owners; payments follow the plot; unowned plots only to admins and leads. Handing a plot or action to a colleague still works, and takes it out of your sight. The two CRM payment views go back to Reporter and Financial Management only (they let any member read every plot's money). Assigning or releasing a plot stops at plots you can see; selling an unsold plot makes it the client's handler's, else the seller's.
- **On staging today nobody holds `/client-relations`** (checked 2026-10-17), and every sold Saarang plot already has a Sales owner — so nothing anyone should see disappears.

## Steps

- [x] `[Opus]` `0122`, `0123` and `scripts/trials/client-relations-scope.sql`: dry-run on staging under RLS as two single-grant members, one of them then a lead, and the admin — seven trials (a member sees only theirs and none of the money views; cannot hang an action, a receipt or a buyer change on a plot they cannot see; hands an action on and loses sight; a setter undoes a close; a plot handed on moves sight; an unsold plot sold becomes the seller's; a lead sees all, a lead row without the grant nothing). Proved to bite three ways: with plots left open it fails at TRIAL 1 (staff saw 71 of 3); with actions checked over their own columns only, the hand-over is refused (Postgres checks the updated row against the read policy — why `crm_sees_action` asks by id); without "the plot it is already on", Undo is refused.
- [x] `[Opus]` Settings: the Team lead tick under a scoped grant (`LeadCheckbox`, `setToolLead`), removed with the grant (`revokeApp`), in the person's access history (one test).
- [x] `[Opus]` Client Relations' screens: a lead or an admin gets the team view (`seesAll`, apart from `isManager`, which still alone closes anyone's action); a member's owner menu shows no counts; a member's Clients list and welcome count their own clients (`clientScope`); a plot or client that is not yours says so (`NotYours`) instead of "not found"; a closed action on a colleague's plot reads "A colleague's plot"; a new prospect is handled by whoever adds it; a refused write answers in a sentence.
- [x] `[Opus]` Checks: prettier, lint, typecheck, 1,134 tests, `next build`, `check:actions` — all green. The new PostgREST strings ran at staging (the plot-to-buyer embed, the scoped client list with and without search — two `or`s AND together). `NotYours`, the plot chip and the Settings tile rendered through a throwaway probe (deleted) at a true 390px phone, light and dark; nothing scrolls sideways. **No screen has been opened signed in.**
- [x] ~~`[Fable]` Review `0122` and `0123`~~ — **skipped on the founder's word for this merge** (2026-10-17: "merge to staging"). In its place `[Opus]` re-reviewed the full diff against `SECURITY.md` and `BUGCATCHER.md`: `tool_leads` has RLS on, one SELECT policy (own rows or admin), admin-only insert and delete, no update and no anon policy (asserted); `is_lead()` and the four `crm_*` helpers are definers answering only about the caller, through `has_app()`/`is_admin()`, execute revoked from `public, anon` (asserted); `has_app()`/`is_admin()` untouched; each CRM table keeps one policy per command, altered in place, still no DELETE on actions or plots (asserted); the two views keep their columns and lose only `/client-relations`, revokes restated, manifest row changed with its reason; the buyer doors keep their `has_app` check and are only ever called directly (#11); no trigger on the four tables reads another CRM row as the person (#19 — read on staging: `client_actions_guard` asks only `is_admin()`, the rest are `audit_row` and `set_updated_at`). Code: no admin or browser client; every new read and action behind `requireTool` or `requireAdmin`, every `error` checked; colours are tokens only, seen light and dark (#4). No findings. **The Fable review is due before production.**
- [x] `[Opus]` Applied to staging (`0001`–`0123`); regenerated types identical to the hand-written ones; `db:check` level, `db:check-views` clean; the trial re-run on the applied database, the migrations re-run inside it (both run twice cleanly); `is_lead` and `tool_leads` answer through the API.
- [x] `[Opus]` Pull request #100 to `staging`; CI green; signed out, the preview sent `/client-relations`, its plots and `/settings` to `/login`. Merged by the founder 2026-10-17.
- [ ] Founder — the checklist below, on staging.
- [ ] Production: with `0119`–`0121`, then `0122` and `0123`, before the tracker import.

## Verification — the founder, on staging (tenth piece)

With `/client-relations` given to Anu, Sayooj and Sebastina:

1. **Settings → People → Sayooj**: under Client Relations, a **Team lead** tick. Leave it off for now.
2. **As Anu** (on her phone if you can): **Plots** shows only her plots; **Actions** opens on her own list, and **All I see** adds what she set for others and others' steps on her plots; **Clients** lists only her clients; the owner menu shows names without counts.
3. Paste the link of one of Sayooj's plots (from your own view) into Anu's browser: "This plot is not one of yours".
4. As Anu, add a step on one of her plots for Sayooj. **As Sayooj**: that plot appears, with that one step — not Anu's other steps on it. He ticks it finished; Anu closes it; the plot leaves Sayooj's list.
5. As Anu, give one of her plots to Sebastina (Construction owner chip): the page turns into "This plot is not one of yours… it is with your colleague now". As Sebastina, it is in her Plots.
6. Tick **Sayooj as Team lead**: his Actions opens on everyone with the team strip, Plots shows all of them, the owner menu shows counts. His access history says "Made team lead in Client Relations". Untick: back to his own.
7. As yourself: everything as before. **Financial Management** and **Reporter** still show every plot's payments.
8. As the **probe**: Client Relations is still refused.

# Eleventh piece — transmittals the design team can use (2026-10-17)

The design team's first day on staging (2026-10-16: six transmittals issued on Villas 1, 26, 40 and 41, two drafts) came back as four points: the transmittal number cannot be changed; the revision number cannot be changed; "only Sheet 9 is being uploaded" — the founder: "in a drawing set only 9 sheets are getting uploaded when there are almost 30-40"; the transmittal sheet shows only the drawing set's name. The data shows the workaround: set names carrying the Excel number, revision and date ("Transmittal - 018 - Plot 26 - Plumbing Layout R0- 15102026"), and the team's own Excel cover sheet uploaded as one of the sheets (Villa 26 sheet 1, Villa 40 sheet 5). Planned by `[Opus]` at the founder's request — `MODELS.md` gives planning to Fable, so the migration still waits for a Fable review. Branch `feature/design-management`, migration `0124`.

## The founder's decisions (2026-10-17)

1. **The number stays the toolbox's, marked as the toolbox's.** "its ok if transmittal number can't be changed just make a tool box id addition, since we had an already ongoing series from excel … a tb or something with the rest of the transmittal number will make it unique anyway". So Issue mints **`TB-0003`** where it minted `TR-0003`: still counted per villa, each villa's counter carrying on, and never mistakable for the Excel series.
2. **No more file handling: a revision's drawings are a Zoho WorkDrive link.** Told the upload errors, the founder: "lets not get into file handling, new transmittal is created and they paste a link of our drive into it and that link can be shared with supervisors" — and the drive is **Zoho WorkDrive**. The drawings live there; the toolbox keeps the record — number, stage, set, revision, what changed, who, when — and the link. It also keeps the app inside Supabase's free file storage (about 1 GB), which 30–40 sheets a set, every revision, across the villas would outgrow.
3. **The link is "anyone can view"** (founder: "its a zohoworkdrive link with anyone can view"). Whoever holds the link sees the drawings, without signing in — a supervisor's phone needs no Zoho account, and a forwarded link works for anyone it reaches. The toolbox shows it only to the design team and supervisors; past that, the link is the team's to keep.

The team rule that comes with decision 2, which the toolbox cannot enforce: **one WorkDrive folder per revision, never touched once issued — the next revision is a new folder.** The toolbox freezes the link on Issue and keeps the folder's list (below); what is in the folder afterwards is the team's word.

## What it does

**1. TB numbers** (`0124`)

- `issue_transmittal()` restated whole from `0093`, one change: `'TB-'` for `'TR-'`. Its grants restated (`revoke … from public, anon`; `grant … to authenticated`).
- The six already issued keep `TR-0001`/`TR-0002` — an issued transmittal never changes (`0092`'s precedent). Villa 41's next is `TB-0003`.
- The cover sheet's file name gains the villa: `Goodearth-Transmittal-Villa41-TB-0003.pdf` — a per-villa number is unique only with it.
- `sheet-name.ts` (the names of sheets uploaded before) takes the number as given; its tests and comments move to TB.

**2. The revision number is the designer's to set, while draft** (`0124`)

- On a draft transmittal, beside _What changed_: **Revision R[ n ]**, saved on leaving the field like the note. Any number above every revision the set already has on this villa — a set the team had at R2 in Excel starts here at R3. A number that went to site is never re-used or undercut.
- `drawing_revisions_guard` restated whole from `0093`, one change: `revision_no` may move while the revision is a draft, and only above the set's other revisions on that villa; the refusal names the highest one ("Pick a number above R2 — R2 has already been used for this set."). Released or superseded, it stays frozen. The unique `(unit_id, drawing_set_id, revision_no)` still settles a race.
- `setDraftRevisionNumber(revisionId, n)` in `actions.ts`: `requireTool`, a whole number 0–99, the database's sentence on refusal, `revalidatePath("/design-management", "layout")`.
- R1 and above still need _What changed_ before Issue (`0093`): a set brought in at R3 says what changed since the Excel R2.

**3. The WorkDrive link replaces the upload** (`0124`)

- `drawing_revisions.drawings_url text` — a Zoho WorkDrive address only: a CHECK in the database on the shape (`^https://workdrive\.zohoexternal\.com/external/[0-9a-f]{64}$`), and a pure `parseWorkDriveLink` with tests on the screen's side, which trims it, finds the link's id, and says plainly what is wrong. A folder's own WorkDrive address (`workdrive.zoho.com/…`) is refused with "Paste the folder's share link — the one anyone can view": site could not open it without a Zoho login. The team's links are **`https://workdrive.zohoexternal.com/external/<64 hex>`** — an "anyone can view" link to a folder, on Zoho's `.com` servers (the founder's real one, 2026-10-17). Frozen with the note once the revision leaves draft (the guard's freeze list gains it).
- The release gate (`0093`'s "no drawing without a file", founder 2026-08-22) becomes **a WorkDrive link or an uploaded sheet**, in both places it lives: the guard's draft → released check and `issue_transmittal`'s pre-check, which names the set ("… has no WorkDrive link — paste the folder's link before issuing"). `readiness.ts` mirrors it; its tests follow.
- **The draft workspace**: _WorkDrive link_ (saves on leaving the field, like the note), an **Open** beside it to check it, and under it "Make a new folder for each revision, and never change it once issued." The upload control goes; `uploadDrawingRevisionFile` is deleted, and with it this tool's only use of `sharp`.
- **What was uploaded stays.** The six issued transmittals keep their sheets, opened and downloaded as today (the files route, `lib/drawings/sheet-name.ts`). The two drafts (Villas 1 and 41, ARCHITECTURE-GFC) keep theirs, each still removable; either can issue with its sheets, a link, or both.
- Every link out opens in a new tab with `rel="noreferrer"`.

**4. The toolbox reads the folder: the count and every sheet's name, automatically** (`0124`)

The founder: "is there a way that an uploaded link autocounts and extracts the name etc to make the transmittal list?" — and, Goodearth having no Zoho API access: "i can view the folder without zoho access … can u help me out?" Yes: **the toolbox reads the link exactly as a browser does, with no key and no Zoho account.** Everything in section 3 works without it.

Proved on the founder's real link (2026-10-17, plain Node, the way the server will run it — 1.6 s): the link's page names what is shared (`resourceId`, `resourceName` "11", `resourceType` `1001` = a folder) and hands the visitor the link's own viewing cookies; with those, `api/v1/files/<resourceId>/files` on the same host answers the folder's list — "Saarang - Plot 17 - Electrical SLD - R0 - 05022026.pdf" (224,691 bytes) and "Transmittal - 011 - Saarang - Plot 17 - Electrical Dwg - R0 - 05022026.pdf", each with its name, size and last-changed time. Without the cookies the same request is refused (`401`); a made-up link is refused at the page (`500`).

- **The honest risk**: this is Zoho's own page and the address its page calls — not a published promise. If Zoho changes either, the list stops and **the toolbox falls back to link only** (section 3), saying so in a sentence, with one log line naming which step failed. A broken read never stops a transmittal.
- **Reading**: `lib/design-management/workdrive.ts` (this tool's own — nothing else needs it): fetch the link's page, take `resourceId`/`resourceType` and the cookies, list the folder 50 at a time; five-second ceiling per call, never throws, never logs a cookie. No library: `fetch` and `getSetCookie()`. A link to a single file reads as that one sheet. A sub-folder is listed as skipped, not opened.
- **The server only ever calls Zoho.** The address fetched is **rebuilt from the link's id** — `https://workdrive.zohoexternal.com/external/<64 hex>` — never the pasted text, so a typed address can never make the server call anywhere else. A `SECURITY.md` line says so.
- **On the draft**, once a link is saved: "38 sheets" and the list of names, in name order (PLOT 01 FIRST FLOOR -R0, PLOT 01 GROUND FLOOR -R0 …), with **Read the folder again**. A sub-folder is named as skipped. A folder the toolbox cannot read says so in a sentence.
- **At Issue, the list is kept**: the action reads the folder once more and writes it — each file's WorkDrive id, name, size and last-changed time — to a new table, `drawing_revision_folder_sheets`, before `issue_transmittal`. RLS on, the same SELECT shape as `drawing_revision_files` (design team, or `/supervisors` once not draft), writes `/design-management` while draft only, through the same draft-only trigger, so once issued it never changes. **This puts back what the link alone gives up**: the toolbox again answers "what did site have on the 22nd", sheet by sheet, whatever later happens in the folder. If WorkDrive cannot be read at that moment, Issue still goes, with the link only and the reason on screen — Zoho being slow never stops a drawing reaching site.
- **The cover sheet**: set, revision, stage, issued, by whom, what changed, and **Drawings: the link** (printed in full, clickable in the PDF); then **one row per sheet** — # · Sheet name · Last changed. A transmittal with uploaded sheets lists those the same way, so the six already issued answer "only the drawing set name" too. A forty-sheet set runs onto a second page and is rendered and looked at that way (BUGCATCHER #8). The PDF's file name gains the villa.
- **Supervisors** (through `lib/drawings/`, which gains the link and the kept list on a released set): each set at its latest revision has **Open drawings** (the folder, in the browser or the WorkDrive app) and its sheets by name; the revision history as today. Sets from before keep their uploaded sheets.
- Not in this build, and easy after it: a line on an issued transmittal when its folder no longer matches what was kept ("3 sheets changed in WorkDrive since this was issued").

What was checked before the upload was dropped (2026-10-17): nothing in the toolbox stopped a set at 9 — the database took sheets 10–40 on Villa 1's draft from a single-grant designer (a rolled-back trial), no upload died half-way, and the error log is empty since 13 October; the 10th sheet was refused on screen (over 4 MB, wrong type, or a code used) or never tried.

**Worth knowing for the team**: folder "11" holds the Excel transmittal beside the drawing, so today it would be listed as a sheet. Once the toolbox makes the cover sheet, the Excel one need not go in the folder.

## Steps

- [x] Founder — one real link (2026-10-17).
- [x] Founder — approved: "build it" (2026-10-17).
- [x] `[Opus]` The spike: the founder's link read with plain Node, no key — the folder's name and both files (above).
- [x] `[Opus]` `0124` — the TB mint, the movable draft number, `drawings_url`, the gate "a link or a sheet", `drawing_revision_folder_sheets`, and `delete_draft_revision` clearing it — and `scripts/trials/design-links-as-designer.sql`, dry-run on staging (at `0123`) as a single-grant `/design-management` person and a single-grant `/supervisors` person under RLS: nine trials pass. Proved to bite: without the "above" check it fails at TRIAL 6, without the link freeze at TRIAL 5, without `0124` at all at TRIAL 1. Numbered `0122` while drafted; staging took `0122`/`0123` meanwhile, so it moved (never applied anywhere).
- [x] ~~`[Fable]` Review `0124`~~ — **skipped on the founder's explicit word for this merge** (2026-10-17: "merge this is my explicit order"). In its place `[Opus]` reviewed against `SECURITY.md` and `BUGCATCHER.md`: RLS on the new table, three policies, exactly one SELECT (site only off drafts), no UPDATE policy, no anon policy (all asserted); the draft-only trigger and audit on it; `drawing_revisions_guard`, `issue_transmittal` and `delete_draft_revision` restated whole from `0093`/`0091`, each invoker, the two functions' execute revoked from `public, anon` (asserted); the released_at freeze carried forward; no view, no money, no definer. One finding, fixed: the WorkDrive read followed redirects, which could take the server off Zoho's share host — every call now refuses one. **The Fable review of `0124` is due before production.**
- [x] `[Opus]` Applied to staging (`0001`–`0124`); `db:check` level, `db:check-views` clean; the regenerated types are the hand-written ones exactly; the trial re-run on the applied database passes.
- [x] `[Opus]` The draft workspace: the revision field, the WorkDrive link with `parseWorkDriveLink`, `readiness.ts` (tests follow); the upload goes, and with it `sharp` from this tool. Sheets uploaded before stay, viewable and removable on a draft.
- [x] `[Opus]` `workdrive.ts` and the folder read: the list when the link is used, **Read again**, and once more at Issue; a failed read keeps the last good list and never stops Issue; an empty folder or one holding only folders says so. Pure parts tested (7 tests); the server read run against the founder's real link — both files — and a dead one (a sentence). `SECURITY.md` has its section.
- [x] `[Opus]` (in `[Sonnet]`'s place, one session) The cover sheet — link and one row per sheet — rendered from staging's Villa 41 TR-0002 (nine uploaded sheets) and a forty-sheet WorkDrive list, and looked at: the list runs to a second page with its header repeated. The PDF's file name carries the villa; the issued transmittal page and Supervisors' **Open drawings** show the link and the sheets by name.
- [x] `[Opus]` prettier, lint, typecheck, 1,143 tests, `next build`, `check:actions` — green; every changed `select` answers 200 at staging's PostgREST. **No screen has been opened signed in** — a model session cannot sign in; the founder's vet is the first look.
- [x] `[Opus]` Docs: Design Management's `PLAN.md` (decisions 3, 6, 8–10; the WorkDrive folder; the guard table), `SECURITY.md`, `STATUS.md`, `TODO.md`; the new table on both wipe scripts' lists.
- [x] ~~`[Fable]` Approval pass~~ — **skipped on the founder's explicit word for this merge**, as above. Pull request #101 into `staging`; CI green; signed out, the new routes answer 307 → `/login` on the preview; merged.
- [ ] Founder — the checklist below, on staging.

## Verification — the founder, on staging (eleventh piece)

Staging is becoming the real database, so this checklist issues nothing — an issued transmittal can never be deleted. The TB mint and the kept list are proved by the trial; the team's next real issue shows them.

1. **Villa 41 → TR-0002 → Cover sheet (PDF)**: its nine uploaded sheets listed by name; the file is named `Goodearth-Transmittal-Villa41-TR-0002.pdf`.
2. **Villa 40 → New transmittal → Structural → Foundation Layout → Revise to R1.** On the draft, set Revision to **0** — refused, in a sentence. Set **3** — saved; it reads R3.
3. Paste a Google Drive or WhatsApp link as the WorkDrive link — refused, in a sentence.
4. Paste a real WorkDrive share link: in two seconds or so, "38 sheets" and their names. Paste the folder's own WorkDrive address instead — refused, asking for the share link. Add a file to the folder in WorkDrive, press **Read the folder again** — 39.
5. Type _What changed_ — the line under the title says it is ready. **Don't issue: delete the draft.**
6. After the team's next real issue: it reads **TB-000n**; its cover sheet carries the link and every sheet's name; on a supervisor's phone, **Supervisors → that villa → Open drawings** opens the folder.

# Twelfth piece — Construction and Interior, two sides of a plot (2026-10-17)

The founder: "in crm there are two tabs per plot kaadal and villas some people may get the interiors or construction, of the same plot so it needs to basically maybe be assigned twice and treated a bit differently … call it interior and construction kaadal can be avoided". Asked what each side's owner sees: **the whole plot** for an Interior owner, and **all of the Interior side** for the Construction owner — so `0123`'s visibility stands and this is screens only, no migration. Built by `[Opus]` on `feature/client-relations-sides`. The rule is Client Relations' `PLAN.md`, decision 8.

On staging, 11 of the 24 plots with both owners have a different person on each side; 23 of 24 sales actions belong to the plot's sales owner and 19 of 20 Kaadal actions to its Kaadal owner — the split was already in the data.

- [x] `[Opus]` The words: Sales is **Construction**, Kaadal is **Interior** on every Client Relations screen — the owners, the side chip (a hard hat and a sofa, always with the word), the cards, the menus, the errors. The stored values stay the tracker's (`stages.ts`, `trackForSide`; two tests).
- [x] `[Opus]` Assigned twice: the plot page's header and every lot card show both owners; a card's next action shows its side.
- [x] `[Opus]` Treated apart: the plot page's Next steps shows **Both sides · Construction · Interior** with their open counts, and a new step starts on that side with that side's owner (someone who holds only the Interior side starts there). Actions gets the same side chips in place of "Kaadal only" — the team strip's loads follow them. Plots gets a **Side** filter: Interior lists only plots with interior work, and a person matches a side by owning it or holding one of its open actions (`plotInList`, two tests).
- [x] `[Opus]` Checks: prettier, lint, typecheck, 1,138 tests. Rendered through a throwaway probe (deleted) at a true 390px phone, light and dark — the side chips, a plot's two owners, an Interior step, the composer on the Interior side picking the Interior owner by itself, lot cards with and without an Interior side; nothing scrolls sideways. **No screen has been opened signed in.**
- [x] `[Opus]` `next build` and `check:actions` green.
- [ ] `[Opus]` Pull request to `staging`; CI green; the founder merges.
- [ ] Founder — the checklist below, on staging.

## Verification — the founder, on staging (twelfth piece)

1. **Plots**: each card shows two owners — a hard hat for Construction, a sofa for Interior, with the interior stage beside it. The **Side** filter → Interior lists only plots with interior work; pick Interior + Sayooj — only plots where he owns the interiors or holds an interior step.
2. Open a plot with both owners: the header names both. **Next steps** → **Interior**: only interior steps; type a step — the owner chip already says the Interior owner, and the side chip says Interior. Switch it to Construction: the owner becomes the Construction owner.
3. On a step's **•••** → Side: move it to Construction; Undo brings it back.
4. **Actions** → **Interior**: only interior steps, and the team strip counts only interior work.
5. Nowhere in Client Relations says "Kaadal" or "Sales" any more (the plot record's **Construction** and **Interior** cards).

# Thirteenth piece — the design board: each villa passed from stage to stage (2026-10-17)

The founder: "in design management we need a setup with a similar ui like crm, where each plot can be passed from one stage to another and so to different people, like design, permit, wd, structure, interiors … there may be revisions here and its not a clean linear line it can go back and forth but the stage that a house is in is marked by the latest stage even tho revisions may happen backwards etc, each house will have multiple people working on it, and then you need actions". Drafted by `[Opus]` at the founder's request ("make a plan and then wel execute"), against the code and staging's real rows. `MODELS.md` gives planning to Fable, so the migration waits for a Fable review unless the founder waives it. Branch `feature/design-pipeline`; migration `0126` — drafted as `0125`, it moved because Client Relations' parallel `feature/client-relations-one-owner` pushed its own `0125` first (neither touches the other's tables, and the ledger check asks only that a branch's files are applied, not their order). This piece was drafted as the twelfth; Client Relations' sides landed first and took the number.

**The founder's answer (2026-10-17): "build it full forget relay".** Question 1 is answered in so many words; the other four take their recommendations, as the draft said "yes to all" would, and Concept and Approvals are renamed Design and Permit — the founder's own words for them. The Fable review was not waived, so `0126` reaches `db:apply` only after it, or the founder's word in its place.

## The founder's questions

Each has a recommendation; "yes to all" builds it as written.

1. **Relay or here?** Design Management's rule today is "Relay keeps who-has-the-baton; nothing here has a holder or a due date". On staging Relay has **no trails at all** (checked 2026-10-17). _Recommended:_ the hand-offs and to-dos live here, the boundary is amended, Relay is left as it is and nothing links the two — the call the founder made for Client Relations ("forget relay for this build").
2. **Where a villa sits = the furthest stage that has started**, even while an earlier one is being revised. A villa in Working Drawings whose design goes back for revision stays in the WD column, with "Revising Design" on its card. _Recommended:_ yes — this is our reading of "marked by the latest stage".
3. **Which stages are on the board.** The tool's Design stages list is Concept, Approvals, Working Drawings, Structural, MEP, Interiors, Typical Details, Landscape. _Recommended:_ the board shows Concept, Approvals, WD, Structural and Interiors; MEP, Typical Details and Landscape stay for filing transmittals only, and any of them can be switched onto the board later. Rename **Concept → Design** and **Approvals → Permit**? (Sheet file names use the stage code, CON and APP, so nothing already issued changes.)
4. **Who sees what.** CLAUDE.md says a tool whose work is assigned is _scoped_ (only your own, admins and team leads everything), and the founder said "for apps we decide". _Recommended:_ **open** — everyone holding Design Management sees every villa, as with the drawings today; each person opens on their own villas and actions, with a switch to everyone. A three-person team reviewing each other's drawings gains nothing from walls, and Supervisors already read the released drawings. If yes, CLAUDE.md's line becomes "a tool the founder makes scoped". If no, the board's tables get Client Relations' mechanism (`0122`/`0123`) and the drawings stay open to the team either way.
5. **Closing an action**: _Recommended:_ the Client Relations rule — whoever set it closes it, or an admin; its owner's tick marks it finished, waiting for the setter.

## Where it goes: Design Management, not a new tool

- **Same people, same villas, same stages.** Transmittals are already filed under these stages; a villa's page already holds its drawings. One grant, no new tool, no new CHECK, no new row in STATUS.md's contract table (villas, plots, projects and clients are Masters' shared surface).
- **What is new** is a status and people per villa per stage, a history of every move, and the design team's to-do list.

## How a villa moves

- **A step per villa per board stage** (`design_steps`): **Not started · Working · With the client · Waiting on others · Revising · Done**, a one-line note ("Permit office asked for the setback drawing"), started and done dates. One tap on a status chip saves it (Client Relations' rule 11).
- **Several people on each step** (`design_step_people`). A villa's people are everyone on any of its steps. "So to different people" is choosing who takes the next stage.
- **Pass on**: on the current step, **Pass to Permit →** asks who takes it and an optional note, then marks this step Done and starts Permit with those people. The next board stage is offered first; any later one can be picked.
- **Start early**: any stage can be started at any time — Structural alongside WD, Interiors before Permit comes back. Stages run side by side.
- **Send back for revision**: on any started step, with a reason the database insists on ("Client changed the staircase"). That step goes to Revising; later steps carry on unless someone changes them. The card says "Revising Design · 2nd time".
- **Where it sits**: the furthest board stage whose step has started. Every board stage Done reads **Design complete**.
- **Bringing a villa in**: work already under way on 71 villas cannot start from zero. On a villa with nothing started, **Set where it is** picks its stage and people: earlier board stages are marked Done in the same move, this one Working.
- **History** (`design_step_events`): every status change, pass, send-back and person added or removed is written **by the database**, never by the screen, into an append-only log. The villa page shows it as a timeline ("17 Oct · Anu sent Design back for revision — client changed the staircase"); revision counts come from it.
- **No drag-and-drop.** A move that needs a reason or people goes through its dialog; a drag would skip both.

## Actions

Client Relations' Actions, for the design team (`design_actions`): the step, the villa (or none, for a general to-do), the stage it belongs to (optional, shown as a chip), owner, due date, notes; **Open · Waiting on client · Waiting on management · Finished, to confirm · Done**. The tracker's rules come with it: no date counts as overdue, waiting on management tops the list, never deleted (Done, with Undo), the closing rule of question 5.

## The screens — Client Relations' flow, in the toolbox's materials

1. **Welcome**: villas in design, revising now, with the client, actions overdue (counts only). Doors: the **Board** (main), **Actions**, **Design stages**.
2. **The Board** — the Villas screen becomes it. One column per board stage on a desktop, stacked sections on a phone; villas not started are a closed line beneath ("33 not started"), with search. A **lot card** per villa: the plot number large and monospaced, the client, a health pill (Overdue action · Revising · Nobody on it · Not updated in 2 weeks · On track · Design complete), a rail with a segment per board stage coloured by its status (words beside, never colour alone), the faces of the people on its current stage, the next action and its date. Project chips, health chips with counts, and _Mine · Everyone_ filter it.
3. **A villa's page** — the plot number large, client, project, where it sits; then cards: **Stages** (one per board stage: status chips, people, dates, revisions, note, Pass on / Send back / Start), **Next steps** (its actions and a composer), **Transmittals** (exactly today's list and New transmittal), **History**. Back goes to the Board; a transmittal still goes back to its villa.
4. **Actions** — the composer; sections Waiting to confirm · Needs management · Overdue · Next 7 days · Later; _Show done_. Admins see the team strip (a card per person: open, overdue, the load bar); everyone else the greeting over their own list.
5. **Design stages** — each stage gains an **On the board** switch; the board's columns follow the list's order.

Indents-style phone use is not the brief here (designers sit at desks), but every screen is checked at a true 390px phone with nothing scrolling sideways.

## The database — `0126_design_board.sql` (Design Management)

- `design_stages.on_board boolean not null default false`, switched on by code for CON, APP, WD, STR, INT where present (renames only if question 3 says so).
- `design_steps`: `unit_id`, `design_stage_id`, `status` (CHECK of the six), `note`, `reason` (the latest send-back's), `started_on`, `done_on` (set exactly when Done — a CHECK), who and when; unique `(unit_id, design_stage_id)`; FKs restrict. A guard trigger refuses Revising without a reason. No DELETE policy: a step started by mistake goes back to Not started, and the log says so.
- `design_step_people`: `(step_id, profile_id)`, who added and when; insert and delete, no update.
- `design_step_events`: append-only, **written only by triggers** on the two tables above — a trigger-only `security definer` with execute revoked from every client role, and **no insert, update or delete policy**, so nobody writes history by hand.
- `design_actions`: `client_actions`' shape after `0121` — `unit_id` (null allowed), `design_stage_id` (null allowed), `action` (1–500), `owner_id`, `due_on`, `status`, `notes`, `done_on` (CHECK), the setter pinned by a guard (`client_actions_guard`'s rule, its own copy), no DELETE policy.
- `design_team()`: active people holding `/design-management` directly or through a role — an admin only if they hold it too — id and name only; `security definer` with `has_app('/design-management')` in its body, execute revoked from `public, anon`. The second function reading other people's grants after `client_relations_team()`: SECURITY.md's line changes from "one" to "two". Every write that names a person checks them against it.
- RLS on every table, one SELECT policy each, `has_app('/design-management')` (narrowed in place if question 4 says scoped). No view, no money, no anon policy. The file ends asserting all of it.
- `scripts/trials/design-board.sql` under RLS as a single-grant designer, a single-grant supervisor and a no-grant person, proved to bite: a send-back without a reason, a hand-written history row, a delete, a closed action by someone who did not set it, an owner off the team — each refused, and each check removed makes its trial fail.

## Shared code

- **`lib/next-steps/`** (new, shared): the action rules from `lib/client-relations/next-steps.ts` — sections, date words, the due menu's picks, who may close, a person's load, the greeting — with their tests. Design Management reads it from the start.
- **`components/ui/pill.tsx`** and **`components/ui/undo-bar.tsx`**: the Undo bar is the third copy (Relay, Client Relations, this), so DESIGN.md's rule makes it shared now; the Pill comes with it.
- **Client Relations moves onto all three last**, once its own work in flight has landed (`feature/client-relations-sides` merged 2026-10-17; `feature/client-relations-one-owner` still open) — those branches edit its composer, action card and rules, and this build does not touch them until then. Its behaviour and tests do not change.
- Design Management's own: `lib/design-management/board.ts` (pure, tested: where a villa sits, its rail, its health, revision counts from the log, what Pass on offers), `board-queries.ts`, `board-actions.ts`, and the screens.

## Deliberately left out

- **Dates per stage or a plan per villa** (the founder: "I don't like Gantt") — the actions carry the dates; a card shows days in its stage.
- Reminders by email or Google Chat; a Reporter dataset; a link to Relay.
- **Client Relations' three design checks** (client confirmed design, permit, working drawing — typed by the CRM team on 19, 13 and 12 plots) **filled from the board**: the obvious next piece, a cross-tool read with its contract-table row.
- **Outside consultants as people** — a structural consultant with no toolbox account is named in the step's note.

## Steps

- [x] Founder — "build it full forget relay" (2026-10-17).
- [x] `[Opus]` `0126` and `scripts/trials/design-board.sql`: dry-run on staging (at `0124`) under RLS as a single-grant `/design-management` person, a colleague on the design team, a single-grant `/supervisors` person and the admin — ten trials pass, and the migration runs twice cleanly. Proved to bite five ways: without the people guard's team check it fails at TRIAL 7, without the close check at TRIAL 8 (the owner closed it), without the owner check at TRIAL 8 (an owner off the team), without the board check at TRIAL 6; without the guard's reason sentence the table's own CHECK still refuses the send-back (two layers), so the run fails.
- [x] ~~`[Fable]` Review `0126`~~ — **skipped on the founder's explicit word** (2026-10-17: "you can ship it its my explicit command, but see that it dosnet interrupt the other agents working on other branches"). A ship instruction covers only what the founder has seen, so this is staging; production waits for the founder's vet. In its place `[Opus]` reviewed against `SECURITY.md` and `BUGCATCHER.md`: RLS on all four tables, exactly one SELECT policy each, every policy `has_app('/design-management')`, no anon policy, no DELETE on steps or actions and nothing but SELECT on the history (all asserted); `design_team()` a definer whose body checks the grant, execute revoked from `public, anon`; the two logs trigger-only definers no client role may execute, the three guards invokers (asserted); the two moves invokers, revoked from `public, anon`; no view (no write revokes owed), no money, `has_app()`/`is_admin()` untouched; the guards call `design_team()` as the caller and no other tool's trigger reaches these tables (#11, #19); names through Maps, the one embed naming its key (#2). No findings. **Not interrupting the parallel work:** Client Relations' open `feature/client-relations-one-owner` holds `0125`, so this is `0126`; both rehearsed together on staging in both orders (each passes), and this applies with `--only`, leaving their `0125` for them.
- [x] `[Opus]` Applied to staging with `--only 0126_design_board.sql` (`0001`–`0124` and `0126`; Client Relations' `0125` is theirs to apply); the regenerated types are the hand-written ones exactly; `db:check` level, `db:check-views` clean; the trial re-run on the applied database passes; every `select` string the board sends answers at staging's PostgREST, and the villa embed `units → plots!units_plot_id_fkey, clients, projects` too. Staging's stages read Design, Permit, Working Drawings, Structural, Interiors on the board; MEP, Typical Details, Landscape off.
- [x] `[Opus]` `lib/next-steps/rules.ts` (shared, 9 tests), `lib/masters/plot-number.ts` (shared, 1 test), `lib/design-management/board.ts` (7 tests); `board-queries.ts` and `board-actions.ts` — every export behind `requireTool("/design-management")`, writes returning `ActionState` and revalidating `("/design-management", "layout")`, lists through `fetchAll`, every `error` checked, names through Maps (no `profiles` embed).
- [x] `[Opus]` (in `[Sonnet]`'s place, one session) `components/ui/pill.tsx` and `undo-bar.tsx`; the Board (the Villas screen, at its address), the villa page, Actions, the welcome, the tab strip, Design stages' On the board switch. The old villa grid and two unused reads are gone.
- [x] `[Opus]` prettier, lint, typecheck, 1,160 tests, `next build`, `check:actions` — green. The Board, a villa's stages and history, and Actions rendered through a throwaway probe (deleted) with sample villas — desktop light and dark, a true 390px phone light and dark; nothing scrolls sideways. That look caught a Pass on offered on a stage under revision behind the villa (now only the stage it sits at offers it, done or not — `passTargets`, tested) and "12 d" (now "12 days"). **No screen has been opened signed in, and none has met real rows** — the founder's vet is the first look.
- [x] `[Opus]` Docs: Design Management's `PLAN.md` (the Relay boundary amended, decisions 11–15, the board, the guard table), `STATUS.md`, `SECURITY.md` (`design_team()`; scoped is the founder's choice), CLAUDE.md's scoped line, Settings' `PLAN.md`, `DESIGN.md` (pill, undo bar), `TODO.md`, `lib/tools.ts`'s description; the four tables on `scripts/wipe-staging-records.ts`'s list.
- [x] ~~`[Fable]` Approval pass~~ — **skipped on the founder's explicit word for this merge**, as above; `[Opus]` re-reviewed the full diff against this plan, `SECURITY.md` and `BUGCATCHER.md` (no admin or browser client; every read and action behind `requireTool`; every `error` checked, lists through `fetchAll`; actions answer in sentences and never throw; no `"use server"` re-export; tokens only, seen light and dark). Pull request #103 into `staging`; CI green; merged 2026-10-17; Vercel deployed the merge commit; signed out, the four Design Management routes answer 307 → `/login` on staging.
- [ ] `[Opus]` Once Client Relations' work in flight has landed: Client Relations onto `lib/next-steps/`, the plot number, the Pill and the Undo bar (`TODO.md`).
- [ ] Founder — the checklist below, on staging.
- [ ] Production, after the founder's vet: Fable's review of `0126` (skipped for staging), then `0126` — after Client Relations' `0125` if that has shipped, though neither needs the other.

## Verification — the founder, on staging (thirteenth piece)

Staging is becoming the real database, so use villas the team is really working on — what goes in is real from day one, and an action is never deleted. You are admin: you see everything, but you are offered as a person on a stage or an action's owner only if you hold `/design-management` yourself (Settings → People).

1. **Design management** opens on its welcome: villas in design, revising, with the client, actions overdue. The tabs are **Board · Actions · Design stages**.
2. **Design stages**: Design, Permit, Working Drawings, Structural and Interiors are ticked **On the board**; MEP, Typical Details and Landscape are not. Tick MEP, open the Board — it has an MEP column; untick it.
3. **Board**: "No villa has started yet", and **Not started** lists every villa. Open **Villa 41** → **Set where it is** → Working Drawings, with Jiljith and Navarang → the Board shows it in the Working Drawings column; on its page Design and Permit read Done.
4. On Villa 41's Working Drawings, tap **With the client** — the card says so; **Undo** puts it back. **Pass to Structural →** pick Vaishnav → Working Drawings Done, Structural Working with Vaishnav; Villa 41 moves to the Structural column.
5. On its **Design** card, **Send back for revision** — the button waits until you say why. "Client changed the staircase" → Villa 41 stays in Structural; its card reads **Revising Design**, red; the villa's **History** has the line with the reason. Tap **Done** on Design — the revision is over.
6. On Villa 40, **Set where it is** → Design; then **Start Interiors** beside it — both Working; Villa 40 sits in the Interiors column.
7. On a stage, **+ Add** puts someone on; the cross takes them off, with Undo. **•••** → Take back the start returns a stage started by mistake to Not started.
8. **Actions**: the team strip (you are admin). Type "Send the revised plan to the client", pick Villa 41, **Design**, Jiljith, **Tomorrow** → **Add**: under _Next 7 days_, and on Villa 41's page under Next steps. As Jiljith (or ask him), tick it — "Waiting for Siddharth to confirm"; as you, tick it closed; Undo works.
9. Villa 41's page still lists its transmittals, and **New transmittal** works as before.
10. On a phone: the Board stacks a stage at a time; a lot card opens its villa; nothing scrolls sideways.
11. As the **probe** (`/estimator`, `/inventory`): Design Management is not in the sidebar, and `/design-management/actions` sends it home.

# Fourteenth piece — one owner per side (2026-10-17)

The founder, trying the twelfth piece on staging: "for the same track i did 2 actions for 2 different owners, that shoudnt work right? the plot for different tracks different owner is ok, but 1 track 1 owner get it?" Asked: a side with no owner **refuses a step** until one is set ("Refuse until an owner is set"), and a step's owner is **locked to its side's owner** — to hand over, change the side's owner on the plot and its open steps move with it. Built by `[Opus]` on `feature/client-relations-one-owner`, migration `0125`. The rule is Client Relations' `PLAN.md`, decision 9.

On staging two open steps were already off the rule, both on sides with no owner: Plot 17's interior step ("Share interior design with budget?", Anu's) and W14's construction step ("Booking amount follow up - David", Sayooj's). `0125` gives each side its step's person as owner.

- [x] `[Opus]` `0125`: `client_actions_follow_side` (a step on a side must be its owner's; none without an owner; moved or reopened, it takes the side's owner) and `client_engagements_hand_over` (a side's open steps follow its owner; never left with nobody) — definers reached only by their triggers, execute revoked from every client role; a script (no `auth.uid()`) fills a blank side and is never refused, so the tracker import still lands; the two steps settled; asserts that no open step is off its side's owner. `scripts/trials/client-actions-one-owner-per-side.sql`, dry-run on staging under RLS as a single-grant member — nine trials pass; proved to bite three ways (a step to anyone fails TRIAL 1; no hand-over fails at setup; a side left with nobody fails TRIAL 7).
- [x] `[Opus]` The screens: once a plot is chosen the composer shows the side's owner instead of a picker (amber "No interior owner" when there is none, and Add says to set one); a plot step's owner chip is no longer a menu; moving a step to the other side says whose it is now ("Moved to Interior · Sayooj's now"); the plot's owner chips say they own every step on their side. The database's sentences reach the screen as written. `ownerOfSide` (one test).
- [x] ~~`[Fable]` Review `0125`~~ — **skipped on the founder's word for this merge** (2026-10-17: "ship it boss you do it"). In its place `[Opus]` reviewed against `SECURITY.md` and `BUGCATCHER.md`: both functions `security definer` with `search_path` set, reached only by their triggers, execute revoked from `public, anon, authenticated` (asserted); no table, policy or view changed, so no revokes owed (#3); `auth.uid()` read only to tell a script from a person (#11); every writer of a plot's owners or its steps checked — `updatePlot`, `addNextStep`/`updateNextStep`, `crm_assign_unit` (fills a blank Construction owner, so it only ever cascades), and the scripts (no session: never refused); `0126`'s design board keeps its own actions table and touches neither; the backfill switches `set_updated_at` off and back on (asserted), and the file ends asserting no open step is off its side's owner. Re-dry-run on staging at `0126` with the trial. No findings. **The Fable review is due before production.**
- [x] `[Opus]` Applied to staging (`--only`; `0001`–`0126`); regenerated types unchanged; `db:check` level, `db:check-views` clean; the trial re-run on the applied database, `0125` re-run inside it; no open step off its side's owner; Plot 17's Interior owner is Anu, W14's Construction owner Sayooj.
- [x] `[Opus]` Pull request #104 to `staging`; CI green; signed out, the preview sent Client Relations and Settings to `/login`; merged on the founder's word ("you do it"); staging deployed, no errors logged.
- [ ] Founder — the checklist below, on staging.

## Verification — the founder, on staging (fourteenth piece)

1. Open **Plot 17**: its Interior owner now reads **Anu** (from her step). **W14**'s Construction owner reads **Sayooj**.
2. On a plot with no Interior owner: **Next steps → Interior** — the owner chip reads "No interior owner" in amber; type a step and Add — it asks you to give the plot an Interior owner first.
3. Give that plot an Interior owner (the Interior card). Add the step — it is theirs; the owner chip on it is not a menu.
4. Change the plot's **Interior owner** to someone else: every open interior step on it moves to them; a done one keeps who did it.
5. Try to set the Interior owner to nobody while it has open steps — refused, in a sentence.
6. On a step's **•••** → Side → Construction: "Moved to Construction · (the Construction owner)'s now".
7. On **Actions**, a step with **no plot** still lets you pick any owner.
