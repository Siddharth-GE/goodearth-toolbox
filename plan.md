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

# Seventh piece — the Saarang tracker, inside Client Relations (DRAFT, 2026-10-16)

The founder: "i need to add this module, with this kind of flow and ux for my CRM users on the tool box, it can either be in the client management tool or an additional tool, where it gets linked etc so make a build plan" — with `saarang-tracker-preview.standalone.html`, the self-hosted Saarang Tracker (`server.js` and `data.json`, exported 15 Oct, in Downloads). Drafted by `[Opus]` against the code and staging's real rows. **Not approved yet**: the founder answers _Questions before the build_ and approves; Fable reviews `0119` before it reaches `db:apply` (MODELS.md). Branch `feature/client-relations-actions`.

## Where it goes: Client Relations, not a new tool

- **Same people, same plots.** The tracker's users are the CRM team (Anu, Sayooj, Sebastina) and two managers (Saurav and Siddharth — both admins here). Its "deal" is Client Relations' engagement: one per plot, with a sales owner, sale deed and CA status, who holds the original, the acknowledgement, the bottleneck, the plot-amount due date and notes — every one already a column of `client_engagements` or its plot instalment.
- **A separate tool would have to copy those columns or read them across a boundary** — two registers of who bought which plot, the thing the toolbox exists to end. Inside Client Relations it is one new table, one grant, and no new row in STATUS.md's contract table.
- **What is genuinely new is the to-do list** — an owner, a date and a status on every promise to a client — and screens that make overdue impossible to miss.

## What the team gets

1. **Actions** — a new first tab and the welcome's main door; the tracker's main screen.
   - A one-line **composer**: type the step, pick plot, owner, due date, Sales or Kaadal; Enter adds it.
   - Sections **Needs management · Overdue · Next 7 days · Later**, and _Show done_. No date counts as overdue (the tracker's rule — it forces a real date). An imported date the old sheet never had says _date assumed_ until someone sets one.
   - Each card: a round **tick** (done — it leaves the list, with **Undo** for five seconds), the text edited in place, and chips that open a menu — **due** (Today, Tomorrow, This Friday, Next Monday, In 2 weeks, or a date), **owner**, **status** (Open, Waiting on client, Waiting on management, Done), the track, notes, move to another plot.
   - **Admins see the team strip**: a _Needs you_ card (everything waiting on management) and a card per team member with overdue / this week / later; click one to see only theirs. **Everyone else opens on their own list** under a greeting ("Start with the 3 overdue items"), and Question 1 decides whether they can switch to everyone's.
   - Filters: project, and _Kaadal only_.
2. **Plots** becomes the lot-card grid: the plot number large, the client, a health pill (Overdue · Needs management · No next step · Not updated in 2 weeks · On track · Handed over), the five-step rail (buyer → sale deed → CA → construction → handover), the next action and its date, the owner and the Kaadal stage. Health chips filter it; today's search and project and owner filters stay on the toolbar.
3. **The plot page** (`plots/[engagementId]`, also reached from a client) opens with **Next steps** — the plot's actions and its own composer — then today's cards with the wider lists, a **Kaadal interiors** card (stage, owner, note) and, if Question 2 says so, a **Construction** stepper and a permit date. A page, not the tracker's slide-in drawer: the toolbox has no drawer, a page works on a phone, and Back returns to the grid.
4. **The welcome** counts overdue, due this week and waiting on management — counts only, never rupees.

Clients and Collections are unchanged.

## What it deliberately leaves out

- **Fix first** — the old sheets' conflicts list; all 11 are resolved. The import's difference list (below) does that job for the move.
- **Combine plots** — combined plots are already one Masters plot (_Plot 22 & 23_); combining is a Masters edit, not a CRM button.
- **Refreshing every 20 seconds** — a colleague's change shows on the next page load or click, as in every other tool.
- Reminders by email or Google Chat, a _Your next steps_ panel on the home page, a Reporter dataset of actions — each a later piece if wanted.

## The database — `0119_client_actions.sql`

- **`client_actions`**: `engagement_id` (null is a general action with no plot), `action` (1–500 characters), `owner_id`, `due_on`, `due_assumed`, `status` (`open`, `waiting_client`, `waiting_management`, `done`), `track` (`sales`, `kaadal`), `notes`, `done_on` (set exactly when done — a CHECK), who and when. RLS on; one SELECT, one INSERT and one UPDATE policy, each `has_app('/client-relations')`; **no DELETE policy — an action is marked done, never deleted** (the tracker's rule). A plot with actions refuses deletion (a plain FK).
- **`client_engagements` gains** `kaadal_stage` (To pitch, Pitch done, Retainer pending, Retainer paid, In design, Execution, Closed – no interiors), `kaadal_owner_id`, `kaadal_note` — and, by Question 2, `construction_stage` and `permit_on`.
- **Its lists widen to the tracker's** — each CHECK dropped and re-added wider, so nothing stored becomes invalid: deed and CA status + _Not started_, _Drafting_; original with + _Sreejayan_, _Tarana_; acknowledgement + _With Sreejayan_, _Requested from client_, _Pending_; bottlenecks + _Legal / documents_, _Bank / loan_. `stages.ts` mirrors each in the same commit.
- **`client_relations_team()`** — who an action can be given to: active, non-admin people holding `/client-relations` directly or through a role. A member cannot read anyone else's grants (`user_apps` is own-row), so this is a small `security definer` function that checks `has_app('/client-relations')` in its body and returns id and name only; execute revoked from `public, anon`. It reads the shell's grant tables, so it gets a line in SECURITY.md's cross-tool section.
- **No view changes.** `crm_milestone_facts` and `crm_receipt_facts` stay as they are; actions are prose and never join a facts view (Client Relations' rule 6).
- It ends asserting all of the above. `scripts/trials/client-actions.sql` runs as a single-grant person and is proved to bite (a delete refused, a no-grant person refused, `done_on` out of step refused).

## The move from the self-hosted tracker — `scripts/import-saarang-tracker.ts`

`--project <ref> --json <data.json>`, a dry run unless `--commit`, matched on natural keys so a second run writes nothing.

- **Plots match by number** (_Plot 22-23_ → `P22-23`), people by email. **It fills blanks and never overwrites** what Client Relations already holds; every difference is printed instead.
- **Actions**: all 42 (Anu 26, Sayooj 13, Sebastina 3; 22 Sales, 20 Kaadal), with owner, date, track and notes; the 30 with _date assumed_ keep the flag.
- **Masters is never written by the import.** Where the tracker and Masters disagree on who holds a plot, it skips that plot and lists it for the founder (Question 5). Today: Plot 9 (Masters _Rashmi_, tracker _Available_), 27 (_Vidyakanth_ / _Available_), 33 and 34 (_Harman & Aman Pal_ on 33 / one combined deal for _Deepak Shah_), 35 (no client / _Nagaraja Prakasham_), 43 (no client / _Aravind Reddy_). Plots 18–21 are in Masters and not in the tracker.
- **Phase 3's 27 units are not in Masters** — they come in once Masters has them (Question 4).
- Staging first, after the answers. Production on cutover day from a fresh `/api/export`; the tracker stops taking changes that morning, so nothing is typed into it after the export.

## Questions before the build — the founder

1. **Who sees what?** The tracker sends a team member only their own actions and plots. In the toolbox the grant is the boundary, and anyone with Client Relations sees every plot today. _Recommended:_ everyone with the grant sees everything; each person opens on their own list with a _Mine · Everyone_ switch. The alternative — a wall in the database so Anu cannot see Sayooj's work — is a new kind of rule here, would hide plots in Clients and Collections too, and is a bigger build.
2. **Construction stage and the design checks.** Client Relations was told "design and site status come from Relay only, never typed here" (its decision 4). But Relay knows only whether a whole trail is done, never "ground floor slab", so today the toolbox holds no construction stage at all. _Recommended:_ amend decision 4 narrowly — the CRM types the **construction stage** (the tracker's ten steps, as the team last heard it, until the site records it) and the **permit date** (a document, like the deed). _Client confirmed design_ and _Working drawing_ stay out — they belong to Relay and Design Management — and the import writes them into the plot's notes so nothing is lost.
3. **Plot payment.** The tracker types _Completed / Pending – registration / Partly paid / Loan – awaiting bank_; Client Relations works it out from the plot instalment and its receipts (Collections). _Recommended:_ keep it worked out. "Pending – registration" is already the registration stage, "Loan – awaiting bank" the _Bank / loan_ bottleneck, and the tracker's word goes into the notes until the receipts are entered. A typed column could disagree with the receipts.
4. **Phase 3.** Are P3 01–29 the project _Saarang West - Villas_ (one plot in Masters today) or a phase of _Saarang - Villas_? Someone with Masters adds the 27 plots and units (type from the tracker: 1BHK G+1 and so on) before the import; the six with buyers become clients, and the "Prospects:" names stay in notes.
5. **The register differences** above — which is right for Plots 9, 27, 33/34, 35 and 43, and are 18–21 still held?
6. **Phases 1 and 2.** The tracker filters by phase; Masters has projects, not phases. Are project filters enough, or should a Masters plot carry its phase?

## Steps

- [ ] Founder — answer the six questions; approve this plan.
- [ ] `[Opus]` `0119` and its trial; dry run on staging as a single-grant person.
- [ ] `[Fable]` Review `0119` (RLS and a definer function) before `db:apply`. Then `[Opus]` applies it to staging and regenerates the types.
- [ ] `[Sonnet]` `lib/client-relations/next-steps.ts` — pure, `today` passed in, tested: an action's section and due label, a plot's health and rail, its next action. `stages.ts` gains the new lists.
- [ ] `[Opus]` Reads and writes: `listActions`, `getActionCounts`, `listPlotCards`, `getTeam`; `addAction`, `updateAction`, `setActionStatus` and the new plot fields — each opening with `requireTool("/client-relations")`, returning `ActionState`, revalidating `("/client-relations", "layout")`, reading lists through `fetchAll` and checking every `error`. The owner is checked against `client_relations_team()` on every write.
- [ ] `[Sonnet]` The Actions tab: composer, sections, card, the due / owner / status menus on `DropdownMenu`, the team strip, the greeting, the done-with-Undo bar (the tool's own — Relay holds the first copy; the third becomes shared). `[Opus]` reviews.
- [ ] `[Sonnet]` The Plots grid; the plot page's Next steps, Kaadal and Construction cards; the welcome's counts; Actions first in the nav. `[Opus]` reviews.
- [ ] `[Opus]` Rendered through a throwaway probe on a true 390px phone and a desktop, light and dark; prettier, lint, typecheck, test, build, `check:actions`; every new `select` string run at staging's PostgREST.
- [ ] `[Opus]` The import: dry run on staging, its differences to the founder, then `--commit`.
- [ ] `[Opus]` Docs: Client Relations' `PLAN.md` (the new rules, and decision 4's amendment if made), `STATUS.md`, SECURITY.md's line for `client_relations_team()`.
- [ ] `[Fable]` Approval pass on the full diff; pull request into `staging`; CI green.
- [ ] Founder — the checklist below, on staging; grant `/client-relations` to Anu, Sayooj and Sebastina there.
- [ ] Production: Fable's sign-off, `0119`, the merge, the import from a fresh export, the self-hosted tracker switched off.

## Verification — the founder, on staging (seventh piece)

1. **Client Relations** opens on its welcome: overdue, this week, waiting on management. **Actions** is the first door.
2. **Actions**: the team strip shows Anu, Sayooj and Sebastina with the imported counts (Anu 26 open). Click Anu — only hers. **Needs you** is empty.
3. Type "Share 3D with client", pick Plot 4, Sayooj, **Tomorrow** → **Add**: it appears under _Next 7 days_.
4. Tick it — it leaves the list; **Undo** brings it back. Tick an overdue one, then _Show done_.
5. On a _date assumed_ action pick **This Friday** — the flag goes and it moves to _Next 7 days_.
6. **••• → Waiting on management** — it moves to the top, and **Needs you** counts 1.
7. **Plots**: lot cards with health pills; the **No next step** chip lists sold plots with nothing open. Open Plot 10 → **Next steps** at the top; add one there; set the Kaadal stage; step the construction stage.
8. **Anu, signed in on her phone**: she opens on her own list with the greeting; the composer, the menus and the tick work with a thumb; nothing scrolls sideways.
9. As the **probe** (it holds `/estimator` and `/inventory`): Client Relations is not in the sidebar, and `/client-relations/actions` sends it home.
