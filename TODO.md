# TODO — next tasks, in priority order

Read `STATUS.md` first. Anything finished moves to `STATUS.md`, not struck through here. Audit findings are in `AUDIT.md` with full reasoning.

## 1. Done — the live hole is closed

**`AUDIT.md` SEC-01 is fixed.** `0059_views_are_read_only.sql` was applied on 2026-08-14 and verified independently: zero INSERT/UPDATE/DELETE/TRUNCATE privileges remain on any of the fourteen views, for `anon` or `authenticated`.

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

## 4. Today — two Marathon agents may still be on the published PIN

The admin PIN was rotated and verified on 2026-08-11. What the same check turned up and nobody has closed:

1. **Ravi and yema were on PIN `1234`** — the seeded test PIN, in plaintext in a **public** repo. `/marathon/admin` → Members → **Reset PIN** on both.
2. **"Test Agent" is still on the list.** Its PIN has been reset, but the migration's own instruction was to delete the row once real agents existed.

**Not re-verified in the 2026-08-14 audit** — the PIN-hash check was blocked by the environment, so there is no fresh evidence either way. Two minutes in the running app settles it. Rewriting the migration would fix nothing: the PIN is in public git history permanently, so rotation is the only remedy.

## 4. The rest of the audit's security findings

- **`create_client_engagement` has no permission check** (`AUDIT.md` SEC-02). It is `SECURITY DEFINER`, executable by any signed-in user, and writes CRM engagement records plus a nine-rung payment schedule for any plot. Its two siblings check `has_app('/client-relations')`; this one doesn't. One `if` in the function body.
- **Two definer functions are callable with the public anon key** (`AUDIT.md` SEC-03) — `stock_qty_on_hand` reads stock, `seed_default_project_stages` **writes** eight rows. `revoke execute … from anon` on both, plus `profile_is_active`. Can ride along with `0059`.
- **`bill_approval_cap(uid)` returns anyone's approval ceiling to any signed-in user** (`AUDIT.md` SEC-04). Scope it to `auth.uid()` unless the caller is an admin.
- **CI check pinning the money-free views' column lists** (`AUDIT.md` SEC-06). Those views bypass RLS by design; their column list _is_ the boundary and a comment is currently the only guard. ~30 lines. Needs a decision on where the authoritative list lives.

## 5. The slow first load is cold starts

**`AUDIT.md` PERF-01.** Re-measured 2026-08-14: warm TTFB ~0.20s, cold ~1.01s — a 5× gap landing on the reported 1.3s. Not queries, not the region (both Mumbai), not the bundle, not waterfalls, not missing `loading.tsx` — all re-verified fine.

Enable Fluid compute / keep-warm on Vercel and re-measure. This is a billing decision, so it needs the founder. **Unchanged since the August 11 audit, which means it hasn't been turned on.** If it doesn't move the number, the next step is Speed Insights split by cold vs warm — not more code changes.

## 6. Untangle the two cross-tool imports

Both break the toolbox principle in the same way, and neither is more than an hour.

- **`lib/charts/series.ts` → `lib/reporter/*`** (`AUDIT.md` MOD-02). Shared code importing a tool, so deleting Reporter would stop Financial Management _and the whole chart design system_ compiling. `buildChartModel` is the only function involved and has one real caller. Move it into `lib/reporter/`, leave `series.ts` holding the model types. ~40 lines plus its test.
- **`lib/budgets/quote.ts` → `lib/selections/views`** (`AUDIT.md` MOD-01, carried from August). Either move the space-view helpers to a shared surface or have Budgets read the bucket itself. ~20 lines.

## 7. Relay — what is left, in order

The relay, departments, project schedule, trail types and house screen are built; see `app/(dashboard)/relay/PLAN.md`.

- **Unit-level stages.** Each unit stage maps to one project stage so a villa's progress rolls up into the project picture; plus quests (a current stage with nothing running) and clearing a finished stage. Additive on `project_stages`. **Build into the existing house screen**, don't add a page.
- **The game.** Leaderboard, podium, ranks, the clean streak and active days. `lib/relay/points.ts` is written and tested — this is mostly screens plus two scoring views.
- **The seams.** `pusher_chain_links` surfaced both ways, Google Chat notifications (fire-and-forget, never block a write), and `getRelayPulse()` grown into what the collated Dashboard reads.

Two small known gaps: no inline editor for a queued trail's activities in the waiting list (the write path `replaceFutureLegs` exists, just unwired), and no "Open a trail" button on the Projects landing page.

## 8. Grants and real data — done in the running app, not in code

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

## 9. Lower priority, from the audit

- **Index the dozen genuinely-filtered foreign keys** (`AUDIT.md` PERF-04) — `indents.plot_id`, `goods_receipts.plot_id`/`unit_id`, `stock_issues.plot_id`, `business_plans.project_id` and friends. Preventative; changes nothing measurable at today's row counts.
- **Marathon per-run counts are N+1** (`AUDIT.md` PERF-05). Needs a database function to fix properly. Trivial at 11 rows.
- **Line pulls could be atomic** (`AUDIT.md` QUAL-03) using the pattern Marathon's bib numbering already uses — a server-side loop in one function, keeping the per-row refusal messages. A real design change to a working, reasoned trade-off.
- **`todayInIndia()` now exists three times** — `lib/client-relations/dues.ts`, `lib/financial-management/interest.ts` and `lib/directory/birthdays.ts`. Each is a verbatim copy because one tool never imports another's code, and three is the point at which it earns a shared `lib/date.ts`. ~10 lines plus moving three imports.
- **~35 remaining `{ data }` destructures with no `error` check** (`AUDIT.md` QUAL-04). The six that mattered are fixed; the rest are display-only lookups. A slow tidy, not a project.
- **PO-anchor picker in the Bills record form** — move to server-side search (the `/api/catalogue` pattern) once the PO list makes the form payload noticeable.

## 10. Not yet planned

- **Phase 9** — Overview fully real, plus one real project run end to end.
- **Backups.** Supabase managed backups only, with no independent export.
- **Staging environment.** Preview URLs cover most of it today.
- **Downtime mode.**
- **A dashboard composer** — several charts on one page; the true multi-dataset project scorecard waits on it.
- **Business Planning follow-ups**: a one-page PDF of a plan, itemised charge and running-cost lines on a HOLD line, a cash curve. Also carry the peak-funding finding into how plans are discussed — the workbook's "peak funding ₹5.91 Cr" is headroom at the worst month, not money to raise.
