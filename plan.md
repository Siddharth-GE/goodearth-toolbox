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
