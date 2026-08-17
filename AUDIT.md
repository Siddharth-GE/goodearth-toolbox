# Toolbox audit — open findings

The standing record of what is **still wrong**. When you ask for "an audit", this is the document read first and rewritten at the end (CLAUDE.md says so).

_Findings from the full audit of 14 August 2026 — a re-read of the codebase, the migrations, the live database and the deployment against the founding rule that each tool is an independent instrument. Trimmed on 17 August to the thirteen still open, then to the eight below when SEC-02/03/04 and MOD-01/02 were fixed the same day. The resolved ones are listed at the foot with one line each, because code comments cite them by name. Their full reasoning is in git._

**Nothing here is a regression.** The architecture has held through every audit: every server action and route handler gates first, every table has row-level security, no screen touches the database from the browser, the line chain is anchored on real foreign keys, and the money boundary widened by hand in `0055`–`0058` is intact. **As of 17 August no tool imports another tool's code, and no shared module imports a tool's** — the two long-standing violations are gone.

**The one to fix first is now PERF-01**, and it is not a code change: cold starts are the whole of the toolbox's slowness, and Fluid compute / keep-warm is a Vercel setting nobody has turned on across three audits. Everything still open below is either deliberate, preventative, or waiting on a decision.

---

## 1. Security

### SEC-05 · MEDIUM · Marathon agent PINs — confirmed, and now confined to staging

**Re-checked properly on 17 August 2026** by recomputing scrypt against each agent's own salt, which the previous two audits could not do. No longer speculation:

- **Ravi and yema are on PIN `1234`** — the seeded test PIN, in plaintext in a public repo. `/marathon/admin` → Members → **Reset PIN** on both.
- **"Test Agent" on staging has had its PIN rotated**; it is not on the published value.
- The Marathon **admin** PIN is fine on both databases.

**What changed the urgency:** no Marathon agent exists on the production database at all — none were carried across on 17 August — and staging sits behind the app's own sign-in. This is now staging hygiene, not a live hole. It becomes live again the moment Marathon runs a real event and these agents are recreated.

`0070` deletes any agent still on the published hash, and caught one: replaying the migrations onto the fresh database **recreated** `0002`'s Test Agent. The general lesson is in CLAUDE.md — a seed is a fixture in development and a credential in production.

The mechanism around the PIN remains sound: scrypt with a per-row salt, `timingSafeEqual`, an HMAC-signed httpOnly cookie scoped to `/marathon` with an 8-hour expiry, and DB-backed rate limiting (10 failures → 10 minute lockout) checked _before_ the PIN is examined. The kiosk sits outside Supabase Auth on purpose, so the PIN is the only thing in the way — which is why a published default matters more here than anywhere else.

### SEC-06 · MEDIUM · The fact views' column lists have no automated guard

Eleven views bypass RLS by ownership. Their security is entirely their own `WHERE` clause, their explicit column list, `security_barrier`, and a `revoke`/`grant` pair. This is deliberate and heavily commented — but one carelessly added column silently crosses the money boundary, with no policy and no linter to catch it. The comments say "NEVER add a money column" because a comment is currently the only guard.

Every column list was re-checked on 14 August and all eleven were correct. `budget_report_lines` is still the one `security_invoker` view, so it inherits RLS rather than bypassing it — right, because it carries rupees. `bill_money_facts` correctly omits `payment_ref`, `rejection_note` and `note`.

Still worth roughly thirty lines of CI pinning the exact column list of each money-adjacent view.

### SEC-07 · LOW · Catalogue search builds a PostgREST filter from user input

`app/api/catalogue/route.ts:48` strips `,` `(` `)` from the search term before interpolating it into an `or(...)` string at `:88`. Stripping the comma is what stops a second clause being injected, so the sanitiser is doing real work — but it is the only thing standing there, and it is three characters wide. No SQL injection is possible (PostgREST parameterises underneath), and the worst case is a malformed filter. Worth knowing it exists; not worth changing today.

---

## 2. Performance

### PERF-01 · HIGH · Cold starts, and essentially nothing else

Timed on 14 August:

| Path                          | First hit (cold) | Warm          |
| ----------------------------- | ---------------- | ------------- |
| `/login` (prerendered static) | **1.01s**        | 0.20s / 0.22s |
| `/` (proxy + redirect)        | 0.25s            | 0.17s         |

Warm TTFB is ~0.2s and indistinguishable from a static asset — so the proxy costs nothing measurable, and neither do the queries. Cold TTFB is 5× that and lands near the reported 1.3s. With ~70 staff spread thinly across sixteen tools all day, a large share of loads hit a cold function.

**Unchanged across two audits, which means Fluid compute / keep-warm has still not been turned on.** It remains the single biggest lever and it is a Vercel setting, not a code change.

Two structural reasons it bites here:

- Every route is dynamic (`ƒ` in the build output — 108 of 110), because `getCurrentUser` reads `headers()`. Correct for per-user grants, but it means no route can be served from cache.
- The dashboard `<h1>` — almost certainly the LCP element — renders only after `await requireUser()`, so it inherits the whole cold-start cost.

**The honest limit:** TTFB being cold-start-dominated is measured. That LCP follows it is inference — strong, because the remaining time has no other candidate I could find, but inference. Confirm in Vercel Speed Insights (already wired into the root layout) filtered to cold vs warm before spending money on it.

### PERF-04 · LOW · 106 foreign keys have no index — preventative, not the cause

Most are `created_by`/`updated_by` audit columns that are never filtered, only resolved in bulk against the `profiles` primary key. About a dozen are genuinely filtered: `indents.plot_id`, `goods_receipts.plot_id`, `goods_receipts.unit_id`, `stock_issues.plot_id`, `labour_contracts.plot_id`, `business_plans.project_id`, `stock_adjustments.item_id`, `purchase_orders.deliver_store_id`, `item_requests.category_id`.

At today's row counts Postgres sequential-scans regardless and an index changes nothing measurable. The same was true of the five indexes added in `0049`. Worth doing before the data grows, not this week.

### PERF-05 · LOW · Marathon per-run counts are N+1

`lib/marathon/queries.ts` issues one count per run inside `.map`. It is parallelised, behind Suspense, and running against 11 rows. Doing it properly needs a `GROUP BY`, which PostgREST cannot express, so it needs a database function. Not urgent.

---

## 3. Code quality & consistency

### QUAL-03 · MEDIUM · Line pulls are not atomic — deliberate

`addDirectLines`, `addConstructionPullLines`, `addConstructionLines`, `addPoolLines` and the receipt/issue loops insert row-by-row with no transaction, so a failure part-way leaves some lines added and some not. Every site says why: the quantity guard raises per line with that item's remaining figure, and a batch insert would fail wholesale on the first refusal. Each reports partial success honestly.

Marathon's bib numbering shows the shape that gives you both — one `marathon_create_entry` function that loops server-side and returns a per-row summary, atomic and one round trip. The gap is reasoned rather than forgotten.

### QUAL-04 · LOW · Structural drift

- **All sixteen tools follow the pattern.** Every entry in `lib/tools.ts` has a matching route and vice versa, including the two Coming Soon stubs. No orphans, no unregistered routes.
- `lib/masters/` still uses one `<entity>.ts` / `<entity>-actions.ts` pair per entity (18 files) rather than `queries.ts` / `actions.ts`. Sensible for nine entities; just not the stated convention. Documented in CLAUDE.md rather than changed.
- `replaceFutureLegs`, `editableFromLeg` and `scoreAll` in `lib/relay/` are unused **on purpose** — tested write paths not yet wired to a screen. Don't let a cleanup delete them by accident.
- ~35 further call sites destructure `{ data }` without checking `error`. The six that mattered are fixed; the rest are display-only lookups (an editor's name, a label) where an empty result is genuinely harmless.
- **2026-08-17:** five more found and fixed in the Indents pull path, where the swallowed error did not merely hide a label but stated something untrue. `addBudgetPullLines` reported "that budget belongs to a superseded design revision" for any failed read of `selections`; `getBudgetPull`, `getConstructionPull` and `getIndentHeader` each turned a failed read into `notFound()` — a "page not found" for a plan that exists. All now throw.

---

## Closed findings

Kept as one-liners because code comments and tool plans cite them by name. Full reasoning is in git history.

| ID          | Verdict                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **BUG-01**  | HIGH · **fixed 2026-08-14.** Every binary upload was silently corrupted — Storage was handed a `Buffer`, which Next's patched fetch text-decodes. Hand it a `Blob`. BUGCATCHER #6.                                                                                                                                                                                                                                                                                                                                                                       |
| **MOD-01**  | HIGH · **fixed 2026-08-17.** Budgets imported `lib/selections/views` for the quote photos. The reads moved to shared `lib/design-views/queries.ts`; Selections kept the writes. `listSpaceViews` now throws — it was printing quotes with every photo silently missing.                                                                                                                                                                                                                                                                                  |
| **MOD-02**  | HIGH · **fixed 2026-08-17.** `lib/charts/series.ts` imported Reporter's spec and aggregate, so the whole chart design system and Financial Management inherited a dependency on one tool. `buildChartModel` moved to `lib/reporter/chart-model.ts`; `series.ts` is types only.                                                                                                                                                                                                                                                                           |
| **SEC-01**  | CRITICAL · **fixed 2026-08-14** by `0059`. Three money-free fact views were writable by any signed-in person — a Postgres privilege default the migrations never revoked. Verified: zero write privileges remain on any of the fourteen views.                                                                                                                                                                                                                                                                                                           |
| **SEC-02**  | HIGH · **fixed 2026-08-17** by `0071`. `create_client_engagement` was `SECURITY DEFINER`, executable by `authenticated`, and checked nothing — any signed-in person could write CRM records against any plot. Now revoked from every client role _and_ carrying a body check. **Note the trap:** the fix this file originally proposed was wrong — `SECURITY DEFINER` changes the role, not `auth.uid()`, so a bare `has_app` check would have broken the Masters trigger. `pg_trigger_depth() = 0` is what tells the two callers apart. BUGCATCHER #11. |
| **SEC-03**  | MEDIUM · **fixed 2026-08-17** by `0071`. `stock_qty_on_hand`, `profile_is_active` and `seed_default_project_stages` were reachable with the public anon key, because `revoke … from public` never touched `anon`. All three revoked; `seed_default_project_stages` closed to `authenticated` too, being trigger-only.                                                                                                                                                                                                                                    |
| **SEC-04**  | LOW · **fixed 2026-08-17** by `0071`. `bill_approval_cap`, `can_approve_bills` and `can_approve_indents` answered about any user id. Now self-or-admin — the cap **raises** rather than returning null, because in that function null means _unlimited_.                                                                                                                                                                                                                                                                                                 |
| **QUAL-01** | HIGH · **fixed.** Four reads treated a failed query as an empty result — silently destroying priced budget lines and clearing drift warnings. They throw now.                                                                                                                                                                                                                                                                                                                                                                                            |
| **QUAL-02** | LOW · **fixed.** The one lint warning.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| **MOD-03**  | PASS · Overview reads Marathon's query layer — sanctioned; it is the shell, not a tool.                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| **MOD-04**  | PASS · Settings writes two other tools' tables — one of the four documented exceptions.                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| **MOD-05**  | PASS · No tool imports another tool's components.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| **MOD-06**  | PASS · The line chain is still anchored in the database, on real foreign keys.                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| **MOD-07**  | PASS · Deletion is refused, not cascaded.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| **MOD-08**  | PASS · Failure-ripple test — one tool failing does not take the others down.                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| **SEC-08**  | PASS · Everything else in the security brief.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| **PERF-02** | PASS · The bundle is fine and Recharts is properly code-split.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| **PERF-03** | PASS · No waterfalls; streaming is wired everywhere.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| **QUAL-05** | PASS · The access model is what you decided.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| **QUAL-06** | PASS · CI is green.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
