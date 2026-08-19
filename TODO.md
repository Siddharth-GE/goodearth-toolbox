# TODO — next tasks, in priority order

Read `STATUS.md` first. Anything finished moves to `STATUS.md`, not struck through here.

**There is no separate findings document.** The August 2026 audits are fully worked through: everything they found is fixed, enforced by a check that runs on every pull request, or written down as a decision in the `PLAN.md` of the tool it concerns. What is left of them is on this page, stated on its own terms rather than as a reference — and the failures a green build cannot see live in `BUGCATCHER.md`.

## 0. Backups — the biggest open risk, and it is now bigger

**Production is a free-tier Supabase project, which has no backups of any kind.** Not daily, not point-in-time, none. Chosen deliberately on 2026-08-17 ("free for now, decide later"), which is a fair call to make — but from the day staff enter real indents and bills, a bad delete or a bad migration has **no undo**.

Two ways out, either is fine:

1. **Supabase Pro** (~$25/month) — daily backups and point-in-time recovery, nothing to build or remember.
2. **A nightly export script** — cheaper, more moving parts, and only as good as the last time it ran.

This sits above everything else on this page because everything else is recoverable and this is the thing that makes that true.

## 0b. The cutover is done — what it left behind

Cut over on 2026-08-17, checked in the browser, staging wired up and its emails scrambled. The step-by-step guide has served its purpose and is deleted; how the two environments work now lives in `CLAUDE.md`'s staging protocol and `STATUS.md`'s Environments section. What remains:

- **~~Delete `data/staff-passwords-2026-08-14.csv`~~** and **~~`vercel-env-values.txt`~~** — both confirmed gone on 2026-08-17. The oldest item on this page for a week, now closed.
- **Enter one real vendor and one real store** in Masters. Neither was carried across, and Purchase Orders and Inventory each need one before first use.
- **Document counters** — only where a real series already runs on paper. `po_counters`, `bill_counters`, `indent_counters`, `grn_counters`, `iss_counters` are `(project_id, scope, last_no)` rows. Tell the assistant the last number used and it is one update each. **Before the first real document, not after.**
- **Deployment Protection** back on in Vercel if it is still off.

## 1. Done — the live hole is closed

**The writable fact views are fixed.** Three of them were writable by any signed-in person — a Postgres privilege default the migrations never revoked, and a view bypasses row-level security, so it was an RLS bypass with a `DELETE` on the end. `0059_views_are_read_only.sql` was applied on 2026-08-14 and verified independently: zero INSERT/UPDATE/DELETE/TRUNCATE privileges remain on any of the fourteen views, for `anon` or `authenticated`. Since 2026-08-17 `npm run db:check-views` re-checks it on every pull request, because `drop view` hands those grants straight back.

**Still worth one browser check on production:** press a real write button in Purchase Orders and Bills. Nothing should have changed — nothing in the app has ever written through a view — but that is the claim being tested.

## 2. Sign-in hardening — LIVE. Three loose ends

Shipped end to end on 2026-08-14 (PR #20, `0062` + `0063` applied, browser pass done and trace-verified — see `STATUS.md` and `BUGCATCHER.md` #7). What remains:

1. **Tell the staff**, if not already done: next visit signs them out; password + emailed code once, then their browser is trusted 30 days. Forgot-password and Google sign-in now exist.
2. **Vercel: re-enable Deployment Protection** (Settings → Deployment Protection → Vercel Authentication on) — it was switched off for the private-window tests. And delete `vercel-env-values.txt` if it still exists.
3. **Press one real write-button on production** while signed in through the new flow — `0063` rewrote `has_app()`/`is_admin()`, and a write is the claim being tested. Doubles as the §1 check below.

Also worth knowing: the Preview environment's `SITE_URL` no longer steers auth (return URLs come from the request origin), so its value can be ignored or deleted.

## 3. Relay waves — LIVE. Two things to try on production

Merged 2026-08-14 (PR #21, `0064` + `0065` applied). Villa waves on Projects, a project and a house; the lists turned into cards; "with client" as a real trackable state; trails file themselves under a stage on creation. What is worth doing once on the live app:

1. **Press "With client" on a real trail**, then push it — the amber label should appear and then clear on its own. This is the one real write the release added, and CLAUDE.md's rule is to press one after any deploy touching server actions.
2. **Open a trail whose stage the auto-filing guessed wrong** and move it with the Stage picker on the trail's own page. If it guesses wrong often, the fallback (the stage the plan says today is in) is the thing to revisit — possibly by giving each activity a home stage in Masters.

## 4. Marathon PINs — closed

**Done 2026-08-17.** Ravi and yema were both on the seeded PIN `1234`, which is in plaintext in this public repo. Both now have fresh random PINs, handed over in the session that set them; change either in `/marathon/admin` → Members → **Reset PIN** whenever you like. The Marathon admin PIN was always fine, and no Marathon agent exists on production at all.

`npm run rotate-marathon-pins -- --project <ref>` reports any agent sitting on a PIN that has ever appeared in the repo, by recomputing scrypt against that agent's own salt — which is the only way to find them, and the reason a migration could not. `0070` deletes anything still matching the published hash.

## 5. The audit's security findings — all closed

**`0071`, applied 2026-08-17.** `create_client_engagement` was a `SECURITY DEFINER` function any signed-in person could call to write Client Relations records against any plot; three more definer functions were reachable with the public browser key, because `revoke … from public` never touched `anon`; and the bill-approval helpers answered about anybody's user id rather than the caller's. Verified against staging: both trigger paths still seed what they should, and a direct call is refused. The trap that fix nearly fell into is `BUGCATCHER.md` #11 — `security definer` changes the role, not `auth.uid()`.

**The fourteen views are now guarded.** They bypass row-level security by design, so each one's column list and `WHERE` clause _are_ its permission boundary, and a comment saying "never add a money column" was the only thing standing there. `scripts/view-manifest.ts` pins every view's exact columns, its `has_app` guards, its barrier and invoker flags, and the absence of write grants; `npm run db:check-views` runs on every pull request. It caught a real mistake within a minute of being written.

**Catalogue search no longer strips characters out of what you typed.** The term used to have `,` `(` `)` removed before being spliced into a PostgREST `or` filter, and removing the comma was the only thing stopping a typed clause of its own. It is quoted now, so searching for "basin, wall" searches for that.

## 6. The slow first load — Fluid compute is on

**Done 2026-08-17.** Fluid compute / keep-warm was turned on in the Vercel project, and production was redeployed after it, so the setting is live on the build people are using.

That was the last thing the August audits left open, and it was never a code change. The finding, for the record: warm time-to-first-byte is ~0.20s and a cold one ~1.01s, and that 5× gap was the whole of the reported slowness. Not the queries, not the region (both Mumbai), not the bundle, not waterfalls, not a missing `loading.tsx` — each was checked and is fine. Two things made it bite harder here: every route is dynamic (108 of 110) because per-user grants are read from the request, so nothing can be served from cache; and the dashboard heading renders only after the user is resolved, so it inherits the whole cold start.

**Whether it helped is a judgement to make by using the app**, not by timing it from one machine — a single measurement catches an edge-cached page or a stale build and proves nothing. If a real number is ever wanted, Vercel Speed Insights is already wired into the root layout and splits cold from warm across all ~70 people.

## 7. The two cross-tool imports — done

**Both closed 2026-08-17.** `buildChartModel` moved out of shared `lib/charts/series.ts` into `lib/reporter/chart-model.ts`, leaving the shared file holding only the chart shapes; and the design-view reads moved out of Selections into shared `lib/design-views/queries.ts`, which Budgets and Selections both use. **No tool imports another tool's code and no shared module imports a tool's** — `CLAUDE.md` now says so without exceptions.

One bug fell out of MOD-01: `listSpaceViews` treated a failed read as "no photographs", so a client quotation could print with every picture missing and report success. It throws now, and both PDF routes answer in plain English.

## 8. Relay — what is left, in order

The relay, departments, project schedule, trail types and house screen are built; see `app/(dashboard)/relay/PLAN.md`.

- **Unit-level stages.** Each unit stage maps to one project stage so a villa's progress rolls up into the project picture; plus quests (a current stage with nothing running) and clearing a finished stage. Additive on `project_stages`. **Build into the existing house screen**, don't add a page.
- **The game.** Leaderboard, podium, ranks, the clean streak and active days. `lib/relay/points.ts` is written and tested — this is mostly screens plus two scoring views.
- **The seams.** `pusher_chain_links` surfaced both ways, Google Chat notifications (fire-and-forget, never block a write), and `getRelayPulse()` grown into what the collated Dashboard reads.

Two small known gaps: no inline editor for a queued trail's activities in the waiting list (the write path `replaceFutureLegs` exists, just unwired), and no "Open a trail" button on the Projects landing page.

## 9. Grants and real data — done in the running app, not in code

Every tool below is built and gated; until someone is granted it, only admins see it.

**The staff import ran on 2026-08-14** — 47 people, 45 new logins, everyone granted `/directory` and nothing else. `scripts/import-staff.ts` is re-runnable and a re-run is a no-op, so it is the way to add the next joiner.

- **Delete `data/staff-passwords-2026-08-14.csv` once the passwords are handed over.** 45 plaintext starting passwords sitting on the founder's machine. Git-ignored, never pushed — but it should not outlive its purpose. **This is the oldest open item on this page.**
- **Sign in as one imported person, in a private window.** The check nobody has done: an admin passes every permission test in the app and never sees a grant bug. Confirm they land on the Directory, can edit their own phone, and cannot reach anything else.
- **Set a department for the eight the sheet left blank** — Admin, Designer, Jitha TA, Kavin kumar Senthil, Saurav, Siddharth, Team, Varghese George. On each person's page in the Directory, five minutes.
- **Decide the role templates.** Everybody currently holds `/directory` and nothing more, so the whole company can see a phone list and do no work. `/settings/roles` is built and empty; naming the jobs — Site Engineer, Purchase, Accounts — turns granting somebody their tools into one click instead of sixteen. **This is the next real piece of work and it needs the founder, not code.**
- **`admin@`, `designer@` and `team@` are people now**, by decision. If that turns out wrong, deactivating them in Settings is the undo — nothing they have done will name a person.

- **`/reporter`** — the amber warning beside the checkbox says what it means: every vendor rate, bill amount and margin.
- **`/financial-management`** — every client's dues, every bill amount, every loan and its terms.
- **`/client-relations`** — to Anu, Sayooj and Sebastina (deferred by the founder).
- **`/business-planning`** — carries land cost, profit and peak funding, so the grant is the whole boundary.
- **Enter the real funding facilities**: each bank loan and investor with its real rate and drawdown history, then check the accrued-interest column against the bank's own statement once before trusting it.
- **Link a real plan to its project** in Business Planning's Rename dialog, or Reporter's plan-vs-actual starter stays an empty page.
- **Reconcile Sales & collections against one villa** once Client Relations records its first real receipt.
- **Press one real write-button on Purchase Orders, Bills and Budgets on production** — `0055` rewrote the read policies their screens run under, and `0059` will touch view privileges.
- **The Saarang sheet's "Blocked" plots (34, 35, 43) are `reserved`** — the schema has no blocked status and `import-saarang.ts` mapped them across. Nobody has confirmed that reads right on screen.

## 10. Lower priority

- **`todayInIndia()` now exists three times** — `lib/client-relations/dues.ts`, `lib/financial-management/interest.ts` and `lib/directory/birthdays.ts`. Each is a verbatim copy because one tool never imports another's code, and three is the point at which it earns a shared `lib/date.ts`. ~10 lines plus moving three imports.
- **~35 remaining `{ data }` destructures with no `error` check.** Every one that mattered has been fixed — eleven of them, across the budget pricing path, the design-drift warnings and the Indents pull screens, where a swallowed error was not hiding a label but stating something untrue. The rest are display-only lookups (an editor's name, a label) where an empty result and a failed read look the same to the person reading the page. A slow tidy, not a project. **The rule for anything new is unchanged: check `error`, not just `data`.**
- **PO-anchor picker in the Bills record form** — move to server-side search (the `/api/catalogue` pattern) once the PO list makes the form payload noticeable.

## 11. Not yet planned

- **The Estimator tool** (Operations) — construction estimation and progress tracking, replacing the site team's Excel workbook. Its masters shipped first (`0073`: works vocabulary in Masters, contractor flag on vendors, loaded 2026-08-19 by `scripts/import-works.ts` and `import-contractors.ts`). The tool itself still needs: a new `/estimator` slug (both grant CHECKs + `lib/tools.ts` + welcome screen), rates and quantities against `work_items`, per-plot schedules (the workbook's "Shedule & Progress track" sheet), and — later — the materials linkage.
- **Phase 9** — Overview fully real, plus one real project run end to end.
- **Downtime mode.**
- **Opening state, per tool, as each one goes live** (established 2026-08-17 by reading the schema, not built). Already possible with no code: client dues (`client_receipts` exists, milestones carry `invoice_no`/`invoiced_on`), bills received before go-live (`bills.po_id` is nullable), POs already open (entered as indent → PO, since `indent_lines.budget_id` is nullable), and funding drawdown history. **The one real gap is opening stock** — `goods_receipt_lines.po_line_id` is `NOT NULL`, so there is no way to record that 40 bags of cement are already in the store without inventing a PO. A migration making it nullable for an opening-balance receipt plus a small entry screen, ~half a day, **due the week Inventory goes live**. Indents needs none of this, which is why it goes first.
- **A dashboard composer** — several charts on one page; the true multi-dataset project scorecard waits on it.
- **Business Planning follow-ups**: a one-page PDF of a plan, itemised charge and running-cost lines on a HOLD line, a cash curve. Also carry the peak-funding finding into how plans are discussed — the workbook's "peak funding ₹5.91 Cr" is headroom at the worst month, not money to raise.
