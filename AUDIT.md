# Toolbox audit — open findings

The standing record of what is **still wrong**. When you ask for "an audit", this is the document read first and rewritten at the end (CLAUDE.md says so).

_Findings from the full audit of 14 August 2026 — a re-read of the codebase, the migrations, the live database and the deployment against the founding rule that each tool is an independent instrument. Trimmed on 17 August to the thirteen still open; the resolved ones are listed at the foot with one line each, because code comments cite them by name. Their full reasoning is in git._

**Nothing here is a regression.** The architecture has held through every audit: every server action and route handler gates first, every table has row-level security, no screen touches the database from the browser, the line chain is anchored on real foreign keys, and the money boundary widened by hand in `0055`–`0058` is intact.

**The one to fix first is SEC-02** — a `SECURITY DEFINER` function any signed-in person can call to write CRM records for any plot. One `if` in the function body. It has been open since 14 August and now sits on a database holding real client money.

---

## 1. Modularity & independence

### MOD-01 · HIGH · Budgets imports Selections' code

`lib/budgets/quote.ts:3`

```ts
import { downloadSpaceView, listSpaceViews } from "@/lib/selections/views";
```

Used at `quote.ts:71` and `:91` to put the client-facing space photos on the quote PDF. Carried unchanged since the 11 August audit. Two consequences:

- Delete or break Selections and the Budgets quote PDF stops compiling.
- `getQuote()` only ever checks `/budgets`, and `lib/selections/views.ts` has no gate of its own — so someone holding `/budgets` and not `/selections` runs Selections' storage-download code. Nothing they shouldn't see (the photos belong on the quote), but the boundary is crossed by import rather than by a shared surface.

### MOD-02 · HIGH · Shared charting depends on Reporter

`lib/charts/series.ts:20-21`

```ts
import type { GroupRow, ReportResult } from "@/lib/reporter/aggregate";
import { measureId, type ReportSpec } from "@/lib/reporter/spec";
```

`measureId` is a **value** import, not a type, used at `series.ts:181` and `:215`.

CLAUDE.md lists `lib/charts/` among the shared utilities — the third thread. But the dependency points the wrong way: shared code imports a tool, and everything downstream inherits it.

```
lib/reporter/spec.ts, aggregate.ts
        ↑
lib/charts/series.ts        (shared)
        ↑
components/ui/chart/*       (shared UI — 5 components)
        ↑
Financial Management's Cash, Forward and Facility pages
```

So **delete `lib/reporter/` and Financial Management stops compiling**, along with every chart wrapper in the design system. Worse than MOD-01 because it runs through shared UI rather than between two tools.

Easy to undo: `buildChartModel` — the only function in `series.ts` touching Reporter's types — has exactly one real caller, `lib/reporter/chart-model.ts:1`. Move it into `lib/reporter/` and `series.ts` is left holding the chart model types, which is what the shared UI actually consumes. ~40 lines plus relocating `series.test.ts`.

---

## 2. Security

### SEC-02 · HIGH · A security-definer function with no permission check

`create_client_engagement(p_unit_id uuid, p_owner_id uuid)` is `SECURITY DEFINER`, `EXECUTE` is granted to `authenticated`, and its body checks nothing. Declared in `0050`.

CLAUDE.md states the rule flatly: every `security definer` function checks `has_app(...)` in its own body — that check is its entire permission boundary. Its two siblings, `crm_assign_unit` and `crm_release_unit`, do exactly that. This one does not.

**Effect:** any signed-in person — a store-keeper holding only `/inventory`, say — can call it over the REST API and create a CRM engagement plus a nine-rung payment schedule against any plot id, writing into a tool they have no grant for. It returns only an id, so it is a write hole rather than a read leak, but the rows then appear on Client Relations' screens as real records.

It is reached legitimately two ways: by the `units_seed_engagement` trigger (where the definer rights are the point) and from `lib/client-relations/actions.ts`, which already calls `requireTool` first. Adding `if not has_app('/client-relations') then raise ...` breaks neither — the trigger path runs as the definer, and the app path already holds the grant.

### SEC-03 · MEDIUM · Two definer functions are callable with the public anon key

`revoke execute ... from public` does not remove `anon`. Supabase grants `anon` and `authenticated` explicitly through default privileges, so a revoke aimed at `PUBLIC` leaves both untouched. `0023:331` does exactly this for `stock_qty_on_hand` and believes it has locked the function down.

Two `SECURITY DEFINER` functions currently carry `anon=X` in `proacl`:

| Function                               | What it does                                | Reachable by                    |
| -------------------------------------- | ------------------------------------------- | ------------------------------- |
| `stock_qty_on_hand(store, item)`       | Reads stock on hand, bypassing RLS          | Anyone with the public anon key |
| `seed_default_project_stages(project)` | **Writes** eight rows into `project_stages` | Anyone with the public anon key |

Exploitability is low — both need a uuid that is not guessable, and `seed_default_project_stages` no-ops if the project already has stages (which every project does, from the `0045` trigger). But an anonymous caller should not reach a definer function at all, and the anon key is public by design.

`profile_is_active(uid)` is in the same position and is genuinely harmless — it answers a boolean about a uuid you would already have to know.

**Fix:** `revoke execute on function … from anon;` for all three, and use `revoke execute … from public, anon` as the pattern from here on.

### SEC-04 · LOW · An approval limit is readable by anyone signed in

`bill_approval_cap(uid)` is `SECURITY DEFINER`, granted to `authenticated`, and returns the rupee ceiling on a person's bill approvals for **any** user id. `profiles` is readable by every authenticated user, so the ids are trivially enumerable.

It is one number per person and not a bill amount, so this is a boundary smell rather than a leak of the ledger. `can_approve_bills(uid)` and `can_approve_indents(uid)` are the same shape and return only booleans. The straightforward fix is to make each answer only for `auth.uid()` unless the caller is an admin.

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

## 3. Performance

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

## 4. Code quality & consistency

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

| ID          | Verdict                                                                                                                                                                                                                                        |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **BUG-01**  | HIGH · **fixed 2026-08-14.** Every binary upload was silently corrupted — Storage was handed a `Buffer`, which Next's patched fetch text-decodes. Hand it a `Blob`. BUGCATCHER #6.                                                             |
| **SEC-01**  | CRITICAL · **fixed 2026-08-14** by `0059`. Three money-free fact views were writable by any signed-in person — a Postgres privilege default the migrations never revoked. Verified: zero write privileges remain on any of the fourteen views. |
| **QUAL-01** | HIGH · **fixed.** Four reads treated a failed query as an empty result — silently destroying priced budget lines and clearing drift warnings. They throw now.                                                                                  |
| **QUAL-02** | LOW · **fixed.** The one lint warning.                                                                                                                                                                                                         |
| **MOD-03**  | PASS · Overview reads Marathon's query layer — sanctioned; it is the shell, not a tool.                                                                                                                                                        |
| **MOD-04**  | PASS · Settings writes two other tools' tables — one of the four documented exceptions.                                                                                                                                                        |
| **MOD-05**  | PASS · No tool imports another tool's components.                                                                                                                                                                                              |
| **MOD-06**  | PASS · The line chain is still anchored in the database, on real foreign keys.                                                                                                                                                                 |
| **MOD-07**  | PASS · Deletion is refused, not cascaded.                                                                                                                                                                                                      |
| **MOD-08**  | PASS · Failure-ripple test — one tool failing does not take the others down.                                                                                                                                                                   |
| **SEC-08**  | PASS · Everything else in the security brief.                                                                                                                                                                                                  |
| **PERF-02** | PASS · The bundle is fine and Recharts is properly code-split.                                                                                                                                                                                 |
| **PERF-03** | PASS · No waterfalls; streaming is wired everywhere.                                                                                                                                                                                           |
| **QUAL-05** | PASS · The access model is what you decided.                                                                                                                                                                                                   |
| **QUAL-06** | PASS · CI is green.                                                                                                                                                                                                                            |
