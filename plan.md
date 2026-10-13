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
- [ ] `[Opus]` Pull request to `staging`; CI green; merged.
- [ ] Founder — the checklist below, on staging.

## Verification — the founder, on staging (fourth piece)

1. Any page: the sidebar shows Overview, then **Management, Operations, Events, People, Admin** as closed rows with a count. Click one — its tools open under it; click again — it closes. Open a tool: its team stays open on the next page.
2. **Settings → Teams** → **New team** "Design". Move it to the top with the arrows. Under _Tools_, set Design Management and Selections to Design — the sidebar moves them at once.
3. Rename a team; delete one — its tools move to **Other** at the bottom of the sidebar, and nobody loses access to anything.
4. The home page's tool cards and a person's apps in **Settings → People** are grouped the same way.
5. On a phone: the menu shows the same closed teams.
6. As the **probe** (it holds `/estimator` and `/inventory`): only the teams holding those two appear, and **Settings → Teams** is refused.
