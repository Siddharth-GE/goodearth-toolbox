# The refactor before production (approved 2026-10-17)

The founder, 2026-10-17: **"the refactor must happen"**, and "since we're moving to production, cut the fat in all code". Built from the audit of `staging` at `053c329`. The report, with every finding's file and line, is the Claude doc _Toolbox code report and refactor plan_ (https://claude.ai/code/artifact/4abfd7b7-9c57-43dd-9d1f-7932f56b3f80). `[Opus]` wrote this plan in place of Fable's planning session, on the founder's word. MODELS.md's hard rules still stand: every migration below reaches `db:apply` only after a Fable review, and each merge to `staging` waits for Fable's pass unless the founder waives it for that merge.

How it runs:

- Work on branch `feature/refactor`, in its own worktree, because another session may share the main folder (the worktree recipe is in memory).
- Each step is one commit with a plain-English message, ticked here as it lands.
- Each phase, or sooner, goes to `staging` as a pull request, and the founder vets it before the next phase starts.
- No step adds a library.
- Feature work pauses or rebases while a phase is in flight, because the thinning touches every file.

## Phase 0: before staging becomes production

Switch day is the founder's to run. Before it, three things must be done:

1. This phase, landed and vetted.
2. TODO.md's vet list, tried or accepted as is.
3. One `[Fable]` pass over what staging has that Fable never saw. That is most of `0096`–`0126` and PR #81; each piece's section below marks its skip. Any fix to an applied migration is a new migration.

- [x] `[Opus]` **H1: Dexter.** The deck route (`app/deck/[token]/[[...path]]/route.ts:263`) sandboxes only HTML and SVG, so an uploaded `.xml` runs script on our origin.
  - Sandbox every response.
  - Move the header choice into a pure function in `lib/dexter/`, with a test.
  - _Check:_ a deck still plays, and its "visit our website" button opens.
  - Done: `lib/dexter/headers.ts` (tested). Locally against staging, the "Experience_Sample" deck played under the sandbox, with its preview tags, picture and answers intact. Staging's four decks are single HTML files, so none changes. The website button is the founder's check.
- [x] `[Opus]` **Make the sign-in cookies unreadable by script.** Set `httpOnly` through `cookieOptions` in `lib/supabase/server.ts` and `proxy.ts`. The `@supabase/ssr` default is readable by script, and no browser client needs it.
  - _Check, as the probe:_ password and code, Google, sign-out, and the theme switch.
  - Done: one `AUTH_COOKIE_OPTIONS` in `lib/supabase/cookie-options.ts`. A real probe session on staging (an admin sign-in link, its password untouched) wrote its session cookie `httpOnly`, and sign-out cleared it; Google's three verifier cookies came out `httpOnly` too. The theme cookie is the app's own and stays readable. Signing in through the screens is the founder's check.
- [ ] `[Fable]` **H2: `user_apps`.** Its grant, revoke and admin-read policies (`0003:20–39`, confirmed live) check `profiles.role` directly. That skips `session_is_verified()` and `is_active`.
  - New migration: `is_admin()` in each, and one SELECT policy, `user_id = auth.uid() or is_admin()`.
  - Trial: an admin session with no verified-session row is refused.
  - _Check:_ in Settings, grant `/indents` to the probe, then take it away.
  - [x] `[Opus]` Drafted as `0127_user_apps_is_admin.sql` on branch `feature/refactor-user-apps`, with `scripts/trials/user-apps-is-admin.sql`. Dry-run on staging: it passes, and without `0127` the trial fails at step 1 (an admin without the emailed code grants a tool today). **Waiting for Fable's review before `db:apply`.**
- [x] `[Opus]` **H3: one place names the databases.** After the switch, the real site would wear the practice banner, and the "staging only" wipe script would accept the real database.
  - `lib/environment.ts` exports each ref with its role (production, practice).
  - `scripts/wipe-staging-records.ts`, `dry-run-migrations.ts`, `google-chat-usage-test.ts` and the practice banner's link import it.
  - `lib/environment.test.ts` reads `.github/workflows/ci.yml` and `package.json` (`db:types`) and fails if their refs disagree.
  - Switch day then changes one constant.
  - Done: `DATABASES` and `PRODUCTION_SITE`, also read by `check-migrations.ts`; no other file in code names a ref. `dry-run-migrations` now runs on the practice database only, instead of refusing only production. The test was proven to bite with a wrong ref in `ci.yml`.
- [x] `[Opus]` **H4: Budgets.** `lib/budgets/queries.ts:241` (margins) and `:220` (spaces) must check `error`. A failed read is the error screen, never blank margins saved at cost.
  - Done through the shared `assertRead`. Budgets' other unchecked reads are Phase 2's.
- [x] `[Opus]` **M1: lockouts fail closed.** `lib/auth/rate-limit.ts:52, 61, 78` and `lib/marathon/rate-limit.ts:57, 70, 88`.
  - _Check:_ 10 wrong passwords still lock the account for 10 minutes.
  - Done: each function returns a refusal ready to show; a count it cannot read or write refuses ("Could not check…"), and a failed clear is logged. Run against staging with a made-up address: the 10th wrong password and the 10th wrong PIN lock for 10 minutes, a correct one clears it, and with the database unreachable every check refuses.
- [x] `[Sonnet]` **M7: rotate the Marathon admin PIN.** `0002` seeds "2026" in this public repo. `scripts/rotate-marathon-pins.ts` must also rotate `marathon_config`'s admin PIN, and SHIPPING.md runs it on every new database.
  - Done by `[Opus]` in Sonnet's place, on the founder's "keep going". The script checks and rotates the admin PIN (to six random digits), with `2026` added to the published list; checked against `0002`'s own seed. Staging's admin PIN is already off it (dry run: nothing to do).
- [x] `[Opus]` **BUGCATCHER #21 and #22.**
  - [x] #21: a sandbox that lists the types it covers leaves every other type open.
  - [x] #22: a policy written before the second factor existed never learned it (with `0127`).

## Phase 1: cut the fat

The founder wants the code thinned massively, and every note and TODO that will never get done, or has lost relevance, cut. Measured at `053c329`:

- about 19,000 comment lines in app code, 12,500 of them in `lib/` (one line in five);
- 641 lines of this file;
- 1,016 lines across 22 tool `PLAN.md` files.

Applied migrations are never edited, so their comments stay.

- [x] `[Opus]` **The rule comes first, so the fat doesn't grow back.** Add to CLAUDE.md, _Structure_: "A comment says why in a line or two, never the story, the date or the incident: history is git, incidents are BUGCATCHER. Delete what the code already says."
- [x] `[Opus]` **Thin the docs.** Done except the switch-day changes to STATUS.md and SHIPPING.md, which wait for the switch. This file is 363 lines; seven tool plans lost their history; the four stale facts are fixed; each commit lists its cuts.
  - This file: each finished piece's story goes. Its vet checklist stays only while the founder hasn't tried it, and git keeps the rest (`git show 88749ab:plan.md`).
  - Tool `PLAN.md` files: the rules and the founder's decisions only, no build history.
  - At the switch, STATUS.md and SHIPPING.md change: the "(on staging)" qualifiers go, and the two-database protocol becomes one production database and one practice database.
  - Fix the stale facts the audit found:
    - the CI comment says 14 views; there are 23;
    - SECURITY.md says three views carry money; 11 do;
    - DESIGN.md's colour-transition line means the theme switch, not hover fades;
    - STATUS.md's contract table: Budgets reads Selections' `space_views`, and the Chat door's row needs fixing.
  - List every cut in the commit message, so the founder can veto any of them.
- [x] `[Haiku]` **Dead code.** Done by `[Opus]`.
  - Remove 5 unused exports: `getTeam`, `OPEN_BUCKETS`, `DECK_PATH_PREFIX`, `DOCUMENT_TYPES`, `DOCUMENT_UPLOAD_LIMIT`.
  - Remove Design Management's own `confirm-dialog.tsx`.
  - Delete 7 superseded scripts (git keeps them): `import-material-master`, `import-vendors`, `import-contractors`, `import-works`, `import-catalogue`, `import-saarang`, `import-staff`.
  - Drop `csv-parse` once nothing needs it. **Kept:** `lib/csv.ts` reads Birdwing's expense uploads with it.
  - `[Opus]` decides the three rules only tests call (`canEditDetails`, `isContractBillable`, `canApproveEffective`): wire each where it belongs, or delete the rule and its test. **`canEditDetails` wired** into the stay page (it hand-wrote the same check); **`isContractBillable` deleted** (`0106` refuses a bill on an unapproved or inactive work order); **`canApproveEffective` deleted** (a bare OR nothing called; the database decides approvers).
- [x] `[Sonnet]` **Thin the comments, one tool per commit** (`lib/<tool>` with `app/(dashboard)/<tool>`), shared code last.
  - Keep a comment only where it says a non-obvious why or rule, in two lines at most.
  - Cut history, dates, incident stories (point at BUGCATCHER #n instead), restated code, banners and commented-out code.
  - Security reasoning keeps its why, shortened: the deck sandbox, act-as, the proxy, rate limits, the environment.
  - **Proof each commit is comment-only:** every changed file transpiles to the same output before and after (`ts.transpileModule` with `removeComments: true`). Write it as a short `scripts/check-comment-only.ts` and run it on every commit.
  - Target: under 6,000 comment lines.
  - Done: 19,631 comment lines to 5,089. Twelve Sonnet helpers each thinned a group of tools; `[Opus]` thinned the security code itself, then checked and committed each tool's result. `check:comments` compares each changed file's compiled code and also its types: compiled code alone missed seven type lines cut in Client Relations, which the typecheck caught and which are restored.
- [x] Founder: **the cuts only you can make.** TODO.md, _Open questions_, has three: is Marathon finished, are the construction budget screens retired, does the Training stub stay. Each yes becomes its own step here.
  - Answered 2026-10-18: "remove the marathon, construction things happen in estimate indent po. only interiors happens in selection and budget." Training stays ("let it be for now").
  - [x] `[Opus]` Marathon's code and docs removed.
  - [x] `[Opus]` Budgets' construction screens and code removed; Budgets is interiors only.
  - [x] `[Opus]` `0128` drops Marathon's seven tables and two functions and the two construction budget tables; `indent_lines.construction_line_id` stays, locked empty, because two indent guards still name it. Staging's rows backed up first (`data/backups/…-before-0128-drop-marathon-construction`, 16 race entries). Dry-run on staging alone and with the `erp-chain` and `indent-estimator-gate` trials: all pass (`erp-chain` step 11 needed its work-order number check loosened for the project code SAAVILLA; it failed without `0128` too). **Fable's review waived by the founder for this migration** (2026-10-18: "no fable review you are allowed to do it"); `[Opus]` reviewed it in its place. Applied to staging when Phase 1's pull request opens.
- [ ] Founder: **delete the 15 feature branches** on GitHub that are already merged into `staging`.

## Phase 2: make failures visible

- [x] `[Opus]` **One way to read.** `pagedList` (`lib/masters/paged.ts:39`, and its last-page retry) and the head counts go through the existing `readFailed` instead of returning empty. BUGCATCHER #9's retry then covers them.
- [x] `[Sonnet]` **M2: the 151 results that never read `error`**, one tool per commit, worst first:
  1. PO billed (`purchase-orders/queries.ts:478`);
  2. the Selections export (`selections/queries.ts:202`);
  3. Masters lists and items;
  4. the home page and welcome counts (46);
  5. single-row reads (35);
  6. writes and storage removes (18).
- [x] `[Sonnet]` **M6: six actions return `ActionState` instead of throwing.** They are `birdwing/actions.ts:776`, `birdwing-books/actions.ts:167, 177, 323`, `purchase-orders/actions.ts:487` and `relay/actions.ts:652`.
- [x] `[Sonnet]` **M9: one "today".** The 12 copies of `new Date().toISOString().slice(0, 10)` become `todayInIndia()`. Before 05:30 they give yesterday's date.
- [x] `[Opus]` **Unknown stays unknown.**
  - M4: Client Relations dues are `null` when a step has no amount (`dues.ts:134`).
  - M5: the Estimator's in-use check goes through `fetchAll` (`works-actions.ts:222`).
  - M8: Birdwing checks its booking rollback (`birdwing/actions.ts:214, 278`).
  - Inventory's over-issued flag survives a failed read.
- [x] `[Sonnet]` **Lists refresh after line edits.**
  - `revalidatePath(…, "layout")` in `indents/actions.ts:259, 413, 511`, `purchase-orders/actions.ts:170, 182, 272, 312` and `selections/actions.ts:333, 377`.
  - The spinner moves out of the paragraph in `budgets/_components/margins-browser.tsx:102`.
- Done 2026-10-18, on the founder's word to build the rest in one go. `check:errors` (Phase 3's first check, built first to find them) counted 120 unread errors, not 151, and they are at zero, enforced in CI. Beyond its reach: a read that logged and returned null or an empty list, which reads as "not found" or "nothing"; those found (Relay's five, the plan, the report, a facility, the over-issue check, four Selections reads) now throw too. The home page's cards each catch their own failure and say they could not load. Helpers did the bulk under `[Opus]`'s rules; `[Opus]` reviewed each diff, the security paths and the Chat door.

## Phase 3: checks that keep it fixed

Keep `npm test` pure. Its 103 files (16,900 lines, `node:test`) are the right kind of test, and there are enough of them. Every high finding passed all of them by nature: a missing header type, a policy, a hard-coded ref, an unread `error`. What's missing is checks: small `tsx` scripts in CI beside `check:actions`, with no new library.

- [x] `[Opus]` **`check:errors`.** No Supabase result leaves `error` unread. Base it on the audit's scanner; after Phase 2 the count is zero, and it can only stay zero.
- [x] `[Opus]` **`check:selects`.** Every literal `select` string's columns and embeds must exist in `database.types.ts`, and a table with two keys to one target must name the key. Four dead screens shipped through this gap (BUGCATCHER #2).
- [x] `[Sonnet]` **`check:boundaries`.** No tool imports another tool, and shared code imports no tool; only `lib/overview/` may.
- [x] `[Sonnet]` **Two ESLint `no-restricted-syntax` rules** (core ESLint, no plugin): no `toISOString().slice(0, 10)` outside `lib/format.ts`, and no raw palette classes in `app/(dashboard)/**` or `components/**`.
- [x] `[Fable]` **`db:check-policies`**, run on every pull request beside `db:check-views`:
  - row-level security on every table;
  - no policy checks `profiles.role` directly;
  - one permissive SELECT policy per table;
  - every definer sets `search_path`, and either checks a grant or is trigger-only with execute revoked;
  - after Phase 4, nothing callable by `anon`.
- [x] `[Fable]` **Keep the trials running after the switch.** The 19 in `scripts/trials/` need the staff and probe accounts and Saarang's plots, which today only staging has. Decide whether the practice database gets built with them (`scripts/clone-data.ts`, whose table list is out of date), and whether CI runs a migration's own trial there.
- Done 2026-10-18. `check:errors`, `check:boundaries` and `check:selects` run in CI beside the static checks, and `db:check-policies` beside `db:check-views`; each was proven against planted mistakes. The trials, decided by `[Opus]` on the founder's word: after the switch the practice database is built by `db:apply` from zero, then `scripts/clone-data.ts` (its table list brought up to date then) copies the masters and accounts the trials need. Trials stay a by-hand rehearsal before a migration is applied, not a CI step, since CI has no seeded database. Five are stale today (TODO.md).
- Not added, on purpose: a browser test. Sign-in needs an emailed code, so CI would need a real login. The founder's vet and the probe cover it.

## Phase 4: database hardening

Fable designs this as one migration. Done as `0129` by `[Opus]` on the founder's word ("do what you think is best"): the 61 open read policies ask `session_is_verified()`, `profiles` also admits a person's own row for the sign-in flow, anon loses every function and view, and SECURITY.md names the definers that check no grant on purpose. Rehearsed with a trial that fails without it.

- [x] `[Fable]` **M3: the 63 `using (true)` read policies ignore the second factor.** A stolen password alone reads every profile, clients' contact details and notes, indents, stock and Relay trails. Decide whether they ask for `session_is_verified()`.
- [x] `[Opus]` **Tidy-up.**
  - Revoke execute from `anon` on the 81 functions from before `0109`.
  - Revoke SELECT from `anon` on the four Birdwing views (`0116:408`; `0117:115, 140, 215`).
  - Document `pusher_current_stage`, `stock_qty_on_hand`, `profile_is_active` and `session_is_verified` in SECURITY.md as definer functions that skip the grant check.

## Phase 5: one home for each helper

- [ ] `[Sonnet]` **`lib/dates.ts`**, with a test: add days, days between, shift month, month label. The Birdwing calendar, Books, Financial Management's cash flow, Relay and `lib/next-steps` move onto it.
- [ ] `[Sonnet]` **`roundPaise` in `lib/line-money.ts`.** 22 copies disagree on half a paisa. `[Fable]` picks the rule, and a test pins 1.005.
- [ ] `[Sonnet]` **`pdfResponse()` in `lib/pdf/`** for 10 routes, and one stored-file route helper in `lib/uploads/` for 3.
- [ ] `[Sonnet]` **Form and number reading through `lib/form-data.ts`**: 118 inline reads, and 10 client-side number parsers moved onto `parseNumber`.
- [ ] `[Sonnet]` **`lib/hooks/use-action-runner.ts`** replaces the 15 local runners. That also fixes Indents, POs and Bills never clearing an old error.
- [ ] `[Opus]` **Shared pieces.**
  - Client Relations moves onto `lib/next-steps/`, `lib/masters/plot-number.ts`, `components/ui/pill.tsx` and `undo-bar.tsx`.
  - Relay's `celebrate.tsx` toast moves onto the Undo bar.
  - The chip styling hand-written in six files moves onto `choice-chips`.

## Phase 6: split the big files

These are pure moves.

- [ ] `[Sonnet]` `lib/indents/queries.ts` (1,314 lines) splits into list, indent detail and pull queries.
- [ ] `[Sonnet]` `lib/purchase-orders/queries.ts` (1,150): ordering from indents moves out.
- [ ] `[Sonnet]` `lib/design-management/actions.ts` (964) splits into stages, revisions and transmittals.
- [ ] `[Opus]` `estimator/estimates/[estimateId]/page.tsx` (878) becomes a pure, tested view model plus section components.
- [ ] `[Sonnet]` `reporter/_components/report-builder.tsx` (one 554-line function) splits into its five sections.

**Leave alone:**

- Business Planning's model and the Chat door's cards. They are long, but pure and well tested; their comments thin like everywhere else.
- Each tool's `workflow.ts`.
- The Chat door's copy of Relay's refusal wording.
- Applied migrations.
- Indexes, until a table nears 100,000 rows.

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
11. **Attendance** on your phone: today at the top — mark Sajna _Present_, tap her name, in 07:30, out 18:30, Save.
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

## Verification — the founder, on staging (eighth piece)

_Only whoever set an action closes it._

1. **Actions** → add "Trial: send the brochure" for **Anu**, Tomorrow. You set it.
2. Ask Anu (or sign in as her) to open **Actions**: her tick on it says _Mark finished — Siddharth confirms_. She ticks it → it moves to **Waiting to confirm**, "Waiting for Siddharth to confirm".
3. Back as you: it tops your list under **Waiting to confirm**, "Waiting for you to confirm". Tick it → closed. Undo works.
4. Anu cannot open it again; on Sayooj's own actions her tick is dashed and locked.
5. One of Anu's imported actions (from the tracker): she ticks it straight to done — she counts as its setter.

## Verification — the founder, on staging (tenth piece)

_Each person sees the work assigned to them._

With `/client-relations` given to Anu, Sayooj and Sebastina:

1. **Settings → People → Sayooj**: under Client Relations, a **Team lead** tick. Leave it off for now.
2. **As Anu** (on her phone if you can): **Plots** shows only her plots; **Actions** opens on her own list, and **All I see** adds what she set for others and others' steps on her plots; **Clients** lists only her clients; the owner menu shows names without counts.
3. Paste the link of one of Sayooj's plots (from your own view) into Anu's browser: "This plot is not one of yours".
4. As Anu, add a step on one of her plots for Sayooj. **As Sayooj**: that plot appears, with that one step — not Anu's other steps on it. He ticks it finished; Anu closes it; the plot leaves Sayooj's list.
5. As Anu, give one of her plots to Sebastina (Construction owner chip): the page turns into "This plot is not one of yours… it is with your colleague now". As Sebastina, it is in her Plots.
6. Tick **Sayooj as Team lead**: his Actions opens on everyone with the team strip, Plots shows all of them, the owner menu shows counts. His access history says "Made team lead in Client Relations". Untick: back to his own.
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

1. **Plots**: each card shows two owners — a hard hat for Construction, a sofa for Interior, with the interior stage beside it. The **Side** filter → Interior lists only plots with interior work; pick Interior + Sayooj — only plots where he owns the interiors or holds an interior step.
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
8. **Actions**: the team strip (you are admin). Type "Send the revised plan to the client", pick Villa 41, **Design**, Jiljith, **Tomorrow** → **Add**: under _Next 7 days_, and on Villa 41's page under Next steps. As Jiljith (or ask him), tick it — "Waiting for Siddharth to confirm"; as you, tick it closed; Undo works.
9. Villa 41's page still lists its transmittals, and **New transmittal** works as before.
10. On a phone: the Board stacks a stage at a time; a lot card opens its villa; nothing scrolls sideways.
11. As the **probe** (`/estimator`, `/inventory`): Design Management is not in the sidebar, and `/design-management/actions` sends it home.

## Verification — the founder, on staging (fourteenth piece)

_One owner per side._

1. Open **Plot 17**: its Interior owner now reads **Anu** (from her step). **W14**'s Construction owner reads **Sayooj**.
2. On a plot with no Interior owner: **Next steps → Interior** — the owner chip reads "No interior owner" in amber; type a step and Add — it asks you to give the plot an Interior owner first.
3. Give that plot an Interior owner (the Interior card). Add the step — it is theirs; the owner chip on it is not a menu.
4. Change the plot's **Interior owner** to someone else: every open interior step on it moves to them; a done one keeps who did it.
5. Try to set the Interior owner to nobody while it has open steps — refused, in a sentence.
6. On a step's **•••** → Side → Construction: "Moved to Construction · (the Construction owner)'s now".
7. On **Actions**, a step with **no plot** still lets you pick any owner.
