# Toolbox audit — 14 August 2026

A full re-read of the codebase, the 58 applied migrations, the live
database and the production deployment, against the founding rule: **each
tool is an independent instrument, connected only through the shell, the
shared database, and shared UI.**

This supersedes the audit of 11 August. Four tools have shipped since
(Reporter, Client Relations, Business Planning, Financial Management) plus
the welcome-screen pass, so most of this is new ground rather than a
re-check.

**The headline is one hole nobody has looked for before: three of the
"money-free" database views can be written to and deleted from by any
signed-in person, with no app grant at all.** It is not a code bug — it
is a Postgres privilege default that the migrations never revoked. Fix is
four lines of SQL and changes nothing about how the app behaves. See
SEC-01.

The architecture held again. Every server action and route handler gates
first, all 71 tables have row-level security, no screen touches the
database from the browser, the line chain is still anchored on real
foreign keys, and the money boundary that `0055`–`0058` widened by hand is
intact — exactly one SELECT policy per gated table, no doubles.

**How to use this file:** it is the standing record of open findings. When
you ask for "an audit", this is the document that gets read first and
rewritten at the end — CLAUDE.md says so.

---

## 1. Modularity & independence

### MOD-01 · HIGH · Budgets imports Selections' code — still open

`lib/budgets/quote.ts:3`

```ts
import { downloadSpaceView, listSpaceViews } from "@/lib/selections/views";
```

Used at `quote.ts:71` and `:91` to put the client-facing space photos on
the quote PDF. Carried forward unchanged from the August 11 audit, where
it was listed as item 3 for your decision. Two consequences:

- Delete or break Selections and the Budgets quote PDF stops compiling.
- `getQuote()` only ever checks `/budgets`, and `lib/selections/views.ts`
  has no gate of its own — so someone holding `/budgets` and not
  `/selections` runs Selections' storage-download code. Nothing they
  shouldn't see (the photos belong on the quote), but the boundary is
  crossed by import rather than by a shared surface.

### MOD-02 · HIGH · NEW · Shared charting depends on Reporter

`lib/charts/series.ts:20-21`

```ts
import type { GroupRow, ReportResult } from "@/lib/reporter/aggregate";
import { measureId, type ReportSpec } from "@/lib/reporter/spec";
```

`measureId` is a **value** import, not a type, used at `series.ts:181`
and `:215`.

CLAUDE.md lists `lib/charts/` among the shared utilities — the third
thread. But the dependency points the wrong way: shared code now imports a
tool. Everything downstream inherits it:

```
lib/reporter/spec.ts, aggregate.ts
        ↑
lib/charts/series.ts        (shared)
        ↑
components/ui/chart/*       (shared UI — 5 components)
        ↑
Financial Management's Cash, Forward and Facility pages
```

So **delete `lib/reporter/` and Financial Management stops compiling**,
along with every chart wrapper in the design system. That is a straight
violation of "stays functional when a neighbour is down", and it is worse
than MOD-01 because it runs through shared UI rather than between two
tools.

It is also easy to undo. `buildChartModel` — the only function in
`series.ts` that touches Reporter's types — has exactly one real caller,
`lib/reporter/chart-model.ts:1`. Moving that one function into
`lib/reporter/` leaves `series.ts` holding only the chart model types,
which is what the shared UI actually consumes. Roughly a 40-line move plus
relocating `series.test.ts`. Listed for your decision because it moves
code between modules; I did not do it unasked.

### MOD-03 · PASS · Overview reads Marathon's query layer

`lib/overview/queries.ts:3` imports `getMarathonHome`. Sanctioned and
documented — Overview is the shell's home, not a tool, and is the one
module allowed to read other tools' queries. Still defensive:
`getMarathonPulse` wraps the call in try/catch so a missing Marathon
environment variable cannot take down the signed-in home page.

### MOD-04 · PASS · Settings writes two other tools' tables

`indent_approvers` and `bill_approvers` are written from
`lib/settings/actions.ts`. Confirmed as Settings-owned in CLAUDE.md after
the last audit; both are `is_admin()`-gated in the database. No change.

### MOD-05 · PASS · No tool imports another tool's components

Checked every `@/app/...` and every relative import that escapes a tool
folder. All 26 hits stay inside their own tool. Marathon's are all
`@/app/marathon/...`. Clean.

### MOD-06 · PASS · The line chain is still anchored in the database

Re-traced end to end against the live schema:

| Hop                          | Anchor                                | Kind                     |
| ---------------------------- | ------------------------------------- | ------------------------ |
| selection line → budget line | `(selection_id, line_key)`            | composite FK, `0011:120` |
| budget line → indent line    | `(budget_id, line_key)`               | composite FK, `0019:268` |
| indent line → PO line        | `purchase_order_lines.indent_line_id` | FK, not null, `0021` §5  |
| PO line → receipt line       | `goods_receipt_lines.po_line_id`      | FK, not null, `0023:151` |
| PO → bill                    | `bills.po_id`                         | FK, header level only    |

Not one is a bare string key. `lib/budgets/carry-forward.ts` and
`lib/indents/pull-rules.ts` still import nothing at all. The coupling
lives in the schema, as designed.

### MOD-07 · PASS · Deletion is refused, not cascaded

Re-verified. `selection_lines_draft_only` raises unless the parent
selection is still `draft`, so an issued revision is immutable; the
composite FKs carry no `ON DELETE` clause, so Postgres refuses to orphan a
budget line even in draft. Drift is surfaced instead —
`classifyDesignDrift` marks lines changed/removed and `getDownstreamImpact`
shows which indents and POs already exist before a designer touches a
line. Nothing can cascade, so nothing needs to.

Two of the reads feeding that drift display were trusting a failed query;
fixed this session (QUAL-01).

### MOD-08 · Failure-ripple test

What breaks in **other** tools if one tool's tables empty, routes die, or
code is deleted:

| If this tool goes    | What else notices                                                                                |
| -------------------- | ------------------------------------------------------------------------------------------------ |
| Marathon             | Home page live card only, already caught in try/catch. Nothing else.                             |
| Selections           | **Budgets quote PDF stops compiling** (MOD-01). Budgets/Indents degrade to empty states.         |
| Budgets              | Indents' interiors pull goes empty. Reporter's budget dataset empties. Nothing crashes.          |
| Indents              | POs cannot be raised (by design). Selections' impact panel goes quiet.                           |
| Purchase Orders      | Inventory has nothing to receive; Bills cannot anchor to a PO; both still load.                  |
| Inventory            | POs show no receipts. Reporter's stock dataset empties.                                          |
| Bills                | Financial Management's spend side goes to zero. Nothing crashes.                                 |
| Relay                | Reporter's `relay_chains` dataset empties. Nothing else.                                         |
| **Reporter**         | **Financial Management stops compiling** (MOD-02), and so does every chart in the design system. |
| Client Relations     | Financial Management's receivables go to zero; Reporter's CRM datasets empty. Both still load.   |
| Business Planning    | Financial Management's Forward page loses its plan line; Reporter's plan-vs-actual empties.      |
| Financial Management | Nothing. Fully leaf — no other tool reads it.                                                    |
| Masters              | Everything degrades — but Masters is a shared surface, not a peer tool. Expected.                |

**Two violations of "stays functional when a neighbour is down": MOD-01
and MOD-02.** Everything else is data-empty degradation, which is the
design working. Note that all four tools built since the last audit
degrade correctly — the new coupling came in through the chart helper, not
through the tools.

---

## 2. Security

### BUG-01 · HIGH · **FIXED 2026-08-14** · Every binary upload was silently corrupted

A raw `Buffer` handed to Supabase Storage was text-decoded under Next's patched fetch, so a 40KB JPEG stored as 124KB of rubbish that storage still reported as `image/jpeg`. Nothing errored. Found by the Directory's first-ever photo upload; the identical defect was sitting unexercised in `lib/selections/views-actions.ts`, where the `design-views` bucket was completely empty. Both fixed by passing a `Blob`; `uploadMyPhoto` also verifies the stored size against what it sent.

**The full write-up, the rule and the check now live in `BUGCATCHER.md` — that is its permanent home.** It is repeated here only because this is where the finding was raised.

---

### SEC-01 · CRITICAL · **FIXED 2026-08-14** · Three fact views were writable, and writing through them bypassed RLS

> **Closed.** `0059_views_are_read_only.sql` was applied on 2026-08-14 and verified independently against the live database: zero INSERT/UPDATE/DELETE/TRUNCATE privileges remain on any of the fourteen views for `anon` or `authenticated`. The finding is kept in full below because the _rule_ it established — a view is a read surface, and every new one ships its revokes in the same migration — is the thing worth not relearning.

**Any signed-in person — including one with zero app grants — can update
and delete production purchase orders, bills and budgets through the REST
API.**

Three of the fourteen views are simple enough for Postgres to treat as
auto-updatable, which means a write to the view is a write to the table
underneath:

| View               | Base table        | `is_updatable` |
| ------------------ | ----------------- | -------------- |
| `po_facts`         | `purchase_orders` | YES            |
| `bill_facts`       | `bills`           | YES            |
| `approved_budgets` | `budgets`         | YES            |

Two things combine:

1. **The views bypass RLS by design.** They are owned by `postgres`, which
   owns the base tables too, and none of those tables is `FORCE ROW LEVEL
SECURITY`. That is deliberate and load-bearing for reads — it is how
   `/indents` sees budget quantities without seeing budget costs. It
   applies to writes just the same.
2. **Supabase's default privileges grant `INSERT`, `UPDATE` and `DELETE`
   on every new relation in `public` to `authenticated`.** The migrations
   say `grant select on po_facts to authenticated` — but a `grant` adds;
   it does not replace. `0022:42` revokes from `public` and `anon`, and
   never from `authenticated`. So the write privileges the platform
   handed out are still sitting there.

Verified against production, read-only:

- `information_schema.views` reports `is_updatable = YES` for all three.
- `role_table_grants` shows `authenticated` holding `INSERT`, `UPDATE`,
  `DELETE` on all fourteen views.
- `pg_class` confirms `relowner = postgres` and `relforcerowsecurity =
false` on `purchase_orders`, `bills` and `budgets`.
- Running `select count(*) from po_facts` as a bare `authenticated` role
  with no JWT and no grants returned **10 rows** — the RLS bypass,
  demonstrated. The same ownership rule governs `DELETE`.

I deliberately did **not** fire the destructive half of that test at
production. The read result plus the privilege table is proof enough.

**What it takes to exploit:** a valid session and one HTTP request. The
guard triggers do not help — they are all `BEFORE UPDATE`, and none exists
for `DELETE`. `audit_row` would record the damage after the fact.

**The fix is four lines and changes no behaviour**, because nothing in the
app has ever written through a view:

```sql
revoke insert, update, delete, truncate on
  po_facts, po_line_facts, bill_facts, bill_money_facts, po_billing_totals,
  approved_budgets, approved_budget_lines, budget_report_lines,
  crm_milestone_facts, crm_receipt_facts, business_plan_target_facts,
  pusher_chain_state, stock_by_location, stock_on_hand
from authenticated, anon;
```

Written as a migration but **not applied** — it is a production privilege
change and the rules of engagement say those are yours. It is the first
thing I would do today. Going forward, every new view needs the revoke in
the same migration that creates it; CLAUDE.md now says so.

### SEC-02 · HIGH · NEW · A security-definer function with no permission check

`create_client_engagement(p_unit_id uuid, p_owner_id uuid)` is `SECURITY
DEFINER`, `EXECUTE` is granted to `authenticated`, and its body checks
nothing. Declared in `0050`.

CLAUDE.md states the rule flatly: "Each `security definer` function checks
`has_app('/client-relations')` in its own body — that check is the entire
permission boundary." Its two siblings, `crm_assign_unit` and
`crm_release_unit`, do exactly that. This one does not.

**Effect:** any signed-in person — a store-keeper holding only
`/inventory`, say — can call it over the REST API and create a CRM
engagement plus a nine-rung payment schedule against any plot id, writing
into a tool they have no grant for. It returns only an id, so it is a
write hole rather than a read leak, but the rows then show up on Client
Relations' screens as real records.

It is reached legitimately two ways: by the `units_seed_engagement` trigger
(where the definer rights are the point) and from
`lib/client-relations/actions.ts`, which already calls `requireTool`
first. Adding `if not has_app('/client-relations') then raise ...` breaks
neither — the trigger path runs as the definer, and the app path already
holds the grant. **Recommended, not applied:** it changes a database
function's behaviour for callers who should never have been calling it.

### SEC-03 · MEDIUM · NEW · Two definer functions are callable with the public anon key

`revoke execute ... from public` does not remove `anon`. Supabase grants
`anon` and `authenticated` explicitly through default privileges, so a
revoke aimed at `PUBLIC` leaves both untouched. `0023:331` does exactly
this for `stock_qty_on_hand` and believes it has locked the function down.

Two `SECURITY DEFINER` functions currently carry `anon=X` in `proacl`:

| Function                               | What it does                                | Reachable by                    |
| -------------------------------------- | ------------------------------------------- | ------------------------------- |
| `stock_qty_on_hand(store, item)`       | Reads stock on hand, bypassing RLS          | Anyone with the public anon key |
| `seed_default_project_stages(project)` | **Writes** eight rows into `project_stages` | Anyone with the public anon key |

Real-world exploitability is low — both need a uuid that is not
guessable, and `seed_default_project_stages` no-ops if the project already
has stages (which every project does, from the `0045` trigger). But an
anonymous caller should not be able to reach a definer function at all,
and the anon key is public by design.

`profile_is_active(uid)` is in the same position and is genuinely
harmless — it answers a boolean about a uuid you would already have to
know.

**Fix:** `revoke execute on function … from anon;` for all three, and use
`revoke execute … from public, anon` as the pattern from here on. Not
applied — same reason as SEC-01.

### SEC-04 · LOW · NEW · An approval limit is readable by anyone signed in

`bill_approval_cap(uid)` is `SECURITY DEFINER`, granted to
`authenticated`, and returns the rupee ceiling on a person's bill
approvals for **any** user id. `profiles` is readable by every
authenticated user, so the ids are trivially enumerable.

It is one number per person and not a bill amount, so this is a boundary
smell rather than a leak of the ledger. `can_approve_bills(uid)` and
`can_approve_indents(uid)` are the same shape and return only booleans.
The straightforward fix is to make each answer only for `auth.uid()`
unless the caller is an admin. Listed, not applied.

### SEC-05 · MEDIUM · CARRIED · Marathon agent PINs — could not re-verify

The August 11 audit found two real agents (Ravi, yema) still on the
published test PIN `1234`, and the "Test Agent" row still present. The
admin PIN was rotated that evening and verified.

**I could not re-check this today** — the PIN-hash comparison was blocked
by this environment's command policy, so I have no fresh evidence either
way. It stays open in TODO.md until you confirm it in the running app.
Two minutes on `/marathon/admin`: reset both agents' PINs, delete "Test
Agent".

The mechanism around the PIN remains sound: scrypt with a per-row salt,
`timingSafeEqual`, an HMAC-signed httpOnly cookie scoped to `/marathon`
with an 8-hour expiry, and DB-backed rate limiting (10 failures → 10
minute lockout) checked _before_ the PIN is examined. The kiosk sits
outside Supabase Auth on purpose, so the PIN is the only thing in the way
— which is why a published default matters more here than anywhere else.

### SEC-06 · MEDIUM · CARRIED · The fact views' column lists have no automated guard

Eleven views bypass RLS by ownership. Their security is entirely their own
`WHERE` clause, their explicit column list, `security_barrier`, and a
`revoke`/`grant` pair. This is deliberate and heavily commented — but one
carelessly added column silently crosses the money boundary, with no
policy and no linter to catch it. The comments say "NEVER add a money
column" because a comment is currently the only guard.

I re-checked every column list this session and all eleven are correct.
`budget_report_lines` is still the one `security_invoker` view, so it
inherits RLS rather than bypassing it — right, because it carries rupees.
`bill_money_facts` correctly omits `payment_ref`, `rejection_note` and
`note`.

Still worth roughly thirty lines of CI that pins the exact column list of
each money-adjacent view. Unchanged recommendation from the last audit.

### SEC-07 · LOW · Catalogue search builds a PostgREST filter from user input

`app/api/catalogue/route.ts:48` strips `,` `(` `)` from the search term
before interpolating it into an `or(...)` string at `:88`. Stripping the
comma is what stops a second clause being injected, so the sanitiser is
doing real work — but it is the only thing standing there, and it is
three characters wide. No SQL injection is possible (PostgREST
parameterises underneath), and the worst case is a malformed filter.
Worth knowing it exists; not worth changing today.

### SEC-08 · PASS · Everything else in the brief

Went looking for each and did not find it:

- **Secrets in the repo.** None. `.env*` is gitignored except the blank
  `.env.local.example`. The repo is public; the two `NEXT_PUBLIC_*` vars
  are meant to be.
- **Client-side database access.** None. All 135 `"use client"` files
  reach the database through server actions only. No browser Supabase
  client exists.
- **RLS coverage.** All 71 tables have it enabled. The seven `marathon_*`
  tables have RLS on and **zero policies**, which is deny-all — correct,
  since Marathon reaches them through the service-role key and has no
  Supabase Auth session at all.
- **Auth on actions.** Complete. Every exported server action across 22
  action files calls `requireTool` / `requireAdmin` / `requireAgentSession`
  first. The two that appear not to — `createClientForm` and
  `updateClientForm` (`lib/client-relations/actions.ts:165,172`) — are
  thin `FormData` wrappers that delegate to guarded functions.
- **Auth on routes.** All 11 route handlers gate before touching data,
  either directly (`app/api/catalogue`, the private-bucket streamer at
  `selections/views/[viewId]`) or through a `requireTool`-gated query.
- **Double SELECT policies.** None. Every one of the twelve money-gated
  tables has exactly one, so `0055`'s widened-qual approach held through
  three subsequent migrations.
- **The three-way WHERE.** Intact. `crm_milestone_facts`,
  `crm_receipt_facts` and `business_plan_target_facts` all still admit
  `/financial-management`, and `bill_money_facts` exists as `0058` wrote
  it. Nobody re-ran `0056`/`0057` over the top.
- **IDOR.** The model is role-based, not owner-based — any `/budgets`
  holder may open any budget, deliberately. Where per-caller scoping is
  genuinely needed it exists, e.g. `getSavedEntry` filters on `agent_id`
  so no agent can walk bib numbers.
- **SQL injection.** No raw SQL interpolation anywhere; everything goes
  through PostgREST builders or parameterised RPCs.
- **Service-role usage.** Confined to Marathon plus the single sanctioned
  `inviteUser`, which touches the auth-admin API and never a table.
- **Storage.** Two buckets: `catalogue` public (thumbnails, by design) and
  `design-views` private, streamed through a gated route handler.

---

## 3. Performance

**Reported: LCP ~5.5s, FCP 2.6s, TTFB 1.3s.** Re-measured today; the
answer is the same as August 11, and nothing shipped since has made it
worse.

### PERF-01 · HIGH · Cold starts, and essentially nothing else

Timed against `goodearth-toolbox.vercel.app` this session:

| Path                          | First hit (cold) | Warm          |
| ----------------------------- | ---------------- | ------------- |
| `/login` (prerendered static) | **1.01s**        | 0.20s / 0.22s |
| `/` (proxy + redirect)        | 0.25s            | 0.17s         |

Warm TTFB is ~0.2s and indistinguishable from a static asset — so the
proxy costs nothing measurable, and neither do the queries. Cold TTFB is
5× that and lands near the reported 1.3s. With ~70 staff spread thinly
across sixteen tools all day, a large share of loads hit a cold function.

**This is unchanged from the last audit, which means Fluid compute /
keep-warm has not been turned on.** It remains the single biggest lever
and it is a Vercel setting, not a code change.

Two structural reasons it bites here:

- Every route is dynamic (`ƒ` in the build output — 108 of 110), because
  `getCurrentUser` reads `headers()`. Correct for per-user grants, but it
  means no route can be served from cache.
- The dashboard `<h1>` — almost certainly the LCP element — renders only
  after `await requireUser()`, so it inherits the whole cold-start cost.

**The honest limit:** TTFB being cold-start-dominated is measured. That
LCP follows it is inference — strong, because the remaining time has no
other candidate I could find, but inference. Confirm in Vercel Speed
Insights (already wired into the root layout) filtered to cold vs warm
before spending money on it.

### PERF-02 · PASS · The bundle is still fine, and Recharts is properly split

Re-measured from the production build, because Recharts landed since the
last audit:

| Thing                     | Size                                                       |
| ------------------------- | ---------------------------------------------------------- |
| Shared first-load JS      | 556 KB raw / **168 KB gzipped**                            |
| Stylesheet                | 72 KB raw / 12 KB gzipped                                  |
| All route chunks together | 2.7 MB raw                                                 |
| Recharts                  | 360 KB + 83 KB, **two chunks, neither in `rootMainFiles`** |

So Recharts is genuinely code-split to the routes that chart, exactly as
CLAUDE.md claims. 168 KB gzipped shared is up from ~145 KB but still well
inside reasonable. Fonts are `next/font/google` and self-hosted; images go
through `next/image`. None of this is the LCP problem.

### PERF-03 · PASS · No waterfalls, and streaming is wired everywhere

- **All 96 routes have a `loading.tsx`** in their own segment or an
  ancestor. Checked programmatically, not by eye. The rule in CLAUDE.md
  holds without exception.
- **Every welcome screen's counts run in `Promise.all`** — I checked all
  eight `getWelcomeCounts` implementations. The new tool-root screens
  added a query to the most-visited pages in each tool and did it the
  cheap way.
- **The sequential awaits I flagged automatically were all false
  positives** — every one turned out to be `await params` (which resolves
  instantly) followed by a query, or already inside a `Promise.all`. The
  home page's thirteen counts still run in batches.

### PERF-04 · LOW · 106 foreign keys have no index — preventative, not the cause

Most are `created_by`/`updated_by` audit columns that are never filtered,
only resolved in bulk against the `profiles` primary key. About a dozen
are genuinely filtered: `indents.plot_id`, `goods_receipts.plot_id`,
`goods_receipts.unit_id`, `stock_issues.plot_id`,
`labour_contracts.plot_id`, `business_plans.project_id`,
`stock_adjustments.item_id`, `purchase_orders.deliver_store_id`,
`item_requests.category_id`.

At today's row counts — tens of rows in most of these tables — Postgres
sequential-scans regardless and an index changes nothing measurable. The
same was true of the five indexes added in `0049`, which is why they
changed nothing. Worth doing before the data grows, not worth doing this
week.

### PERF-05 · LOW · CARRIED · Marathon per-run counts are N+1

`lib/marathon/queries.ts` issues one count per run inside `.map`. It is
parallelised, behind Suspense, and running against 11 rows. Doing it
properly needs a `GROUP BY`, which PostgREST cannot express, so it needs a
database function. Not urgent.

---

## 4. Code quality & consistency

### QUAL-01 · HIGH · Four reads that treated failure as good news — **fixed**

The August audit fixed two of these. Four more of the same shape were
still live, all in the indent path, all in code whose own comments explain
why the empty case is dangerous:

| Where                        | What an empty result meant                                                    |
| ---------------------------- | ----------------------------------------------------------------------------- |
| `lib/indents/queries.ts:322` | Anchor revision lookup — failure marks **every** budget superseded            |
| `lib/indents/queries.ts:343` | Latest issued revision — failure leaves every changed line **unflagged**      |
| `lib/indents/queries.ts:771` | Sibling budgets — failure hides everything already ordered                    |
| `lib/indents/actions.ts:350` | Sibling budgets, write path — failure lets the same quantity be ordered twice |

The last two are the documented "double-buy bug" reachable through a
database blip instead of through the code path that was fixed. All four
now speak up: the queries throw to the error boundary, the action returns
a plain message. Nothing changes on the happy path.

### QUAL-02 · LOW · The one lint warning — **fixed**

`DetailTable` in `lib/reporter/report-document.tsx` took the report spec
and never read it. Removed. `npm run lint` is now silent, which matters
more than it sounds: CI stops at the first failure, so noise in the lint
step is noise in front of every gate after it.

### QUAL-03 · MEDIUM · CARRIED · Line pulls are not atomic — deliberate

`addDirectLines`, `addConstructionPullLines`, `addConstructionLines`,
`addPoolLines` and the receipt/issue loops insert row-by-row with no
transaction, so a failure part-way leaves some lines added and some not.
Every site says why: the quantity guard raises per line with that item's
remaining figure, and a batch insert would fail wholesale on the first
refusal. Each reports partial success honestly.

Marathon's bib numbering shows the shape that gives you both — one
`marathon_create_entry` function that loops server-side and returns a
per-row summary, atomic and one round trip. The brief asked whether that
pattern is used everywhere it should be. It isn't, but the gap is reasoned
rather than forgotten.

### QUAL-04 · LOW · Structural drift

- **All sixteen tools follow the pattern.** Every entry in `lib/tools.ts`
  has a matching route and vice versa, including the two Coming Soon
  stubs. No orphans, no unregistered routes.
- `lib/masters/` still uses one `<entity>.ts` / `<entity>-actions.ts` pair
  per entity (18 files) rather than `queries.ts` / `actions.ts`. Sensible
  for nine entities; just not the stated convention. Documented in
  CLAUDE.md rather than changed.
- `replaceFutureLegs`, `editableFromLeg` and `scoreAll` in `lib/relay/`
  are unused **on purpose** — tested write paths not yet wired to a
  screen. Don't let a cleanup delete them by accident.
- ~35 further call sites destructure `{ data }` without checking `error`.
  The six that mattered are now fixed; the rest are display-only lookups
  (an editor's name, a label) where an empty result is genuinely harmless.
- **2026-08-17:** five more found and fixed in the Indents pull path,
  where the swallowed error did not merely hide a label but stated
  something untrue. `addBudgetPullLines` reported "that budget belongs to
  a superseded design revision" for any failed read of `selections`;
  `getBudgetPull` (the budget, spaces and selection reads),
  `getConstructionPull` and `getIndentHeader` each turned a failed read
  into `notFound()` — a "page not found" for a plan that exists. All now
  throw, matching the four drift reads beside them.

### QUAL-05 · PASS · The access model is already what you decided

The brief asks about "profiles storing one team string" versus per-user
per-app grants, and to assess the migration effort.

**There is nothing to migrate — it shipped.** `user_apps` (`0003`) plus
role bundles `role_apps` (`0034`) are live, unioned per request in
`lib/auth/dal.ts`, and enforced _in the database_ by `has_app()`.
`profiles.team` is a vestigial free-text column, null on every row.
Effort is a dead-column cleanup, not a migration, and even that is
optional under the additive-only rule.

### QUAL-06 · CI is green

`prettier → lint → typecheck → test → build → check:actions`, all
passing. 392 tests, 0 failures. 145 action export lists clean.

---

## 5. Documentation

Reduced to three living documents at root plus this one:

| File          | What it is                                                            |
| ------------- | --------------------------------------------------------------------- |
| **CLAUDE.md** | The rulebook. Rules only, no history, no tasks. Rewritten, 148 lines. |
| **STATUS.md** | What exists and works, per tool, plus platform facts. A snapshot.     |
| **TODO.md**   | Next tasks in priority order. Anything done moves to STATUS.md.       |
| **AUDIT.md**  | This file — the standing record of open findings.                     |

**Kept, against the brief's letter:** `DESIGN.md` (Warm Minimalism) and
`PRODUCT.md`. Both are read by the `impeccable` design skill, and
CLAUDE.md is required to _reference_ the design language rather than
contain it — a 312-line design system does not fit in a 150-line rulebook.
Deleting them would break tooling, so I did not. Say the word if you want
them gone anyway.

**Per-tool `PLAN.md` files: kept in place and trimmed** (your call this
session). They were 2,437 lines across 14 files; the stage-by-stage
delivery logs and dated session notes are gone, the rules and the "things
that will bite" sections stay. Eight applied migrations cite these files
by name and migrations can never be edited, so deleting them would have
left permanent dangling references.

---

## Fixed in this session

| #   | Commit    | What                                                                           |
| --- | --------- | ------------------------------------------------------------------------------ |
| 1   | `d9d9279` | Two drift reads throw instead of silently clearing design-change flags         |
| 2   | `07ea8d1` | Both sides of the budget pull refuse a failed dedupe read (double-buy)         |
| 3   | `fbd2f26` | Report PDF's detail table drops the prop it never read — lint now silent       |
| 4   | —         | Documentation: this file, CLAUDE.md, STATUS.md, TODO.md, PLAN.md files trimmed |

Nothing above changes behaviour, except that four previously-silent
failures now speak up.

## Needs your decision

Ranked by what I would do first.

| #   | Item                                                                                                                                 | Why it's yours                                                                                    |
| --- | ------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------- |
| 1   | ~~**SEC-01 — revoke write privileges on all 14 views.**~~ **Done 2026-08-14.**                                                       | Applied and verified: zero write privileges left on any view.                                     |
| 2   | **SEC-05 — Marathon agent PINs.** Reset Ravi's and yema's, delete "Test Agent".                                                      | Live credentials in the running app. I could not verify them this session and cannot change them. |
| 3   | **SEC-02 — add the `has_app` check to `create_client_engagement`.**                                                                  | Changes a database function's behaviour for callers who should never have reached it.             |
| 4   | **PERF-01 — cold starts.** Enable Fluid compute / keep-warm on Vercel, then re-measure.                                              | A billing and platform decision. Biggest single lever on the slow first load, still untouched.    |
| 5   | **SEC-03 — revoke `execute` from `anon` on the three definer functions.**                                                            | Same category as #1; smaller blast radius, so it can ride along.                                  |
| 6   | **MOD-02 — move `buildChartModel` into `lib/reporter/`,** leaving `lib/charts/series.ts` holding only types.                         | Moves code between modules. ~40 lines, and it un-breaks the design system's independence.         |
| 7   | **MOD-01 — untangle the Budgets → Selections import.** Move the space-view helpers to a shared surface, or read the bucket directly. | Same class as #6, carried from August. First option is cleaner and ~20 lines.                     |
| 8   | **SEC-06 — CI check pinning the money-free views' column lists.**                                                                    | Needs a decision on where the authoritative list lives.                                           |
| 9   | **SEC-04 — scope `bill_approval_cap` to the caller unless admin.**                                                                   | Small, but it is a behaviour change to a shared helper.                                           |
| 10  | **PERF-04 — index the dozen genuinely-filtered foreign keys.**                                                                       | Preventative. Changes nothing measurable today.                                                   |
| 11  | **QUAL-03 — line pulls atomic via server-side loop functions.**                                                                      | A real design change to a working, reasoned trade-off.                                            |

## Already true — things this audit was asked to find and didn't

Recorded so the next pass doesn't re-litigate them:

1. **Per-user per-app grants are live** and enforced in the database. No
   migration pending. (QUAL-05)
2. **No client component can reach the database.** Not one, across 135.
3. **Every table has RLS enabled** — all 71, including the seven Marathon
   tables where zero policies is the correct answer.
4. **Deleting a linked design line is impossible, not cascading.** (MOD-07)
5. **Every server action and route handler gates first.** (SEC-08)
6. **Vercel `bom1` and Supabase `ap-south-1` are both Mumbai.** Not a TTFB
   cause.
7. **The bundle, fonts, CSS, images, `loading.tsx` coverage and query
   parallelism are all already correct.** (PERF-02, PERF-03)
8. **The money boundary widened by hand in `0055`–`0058` is intact** — one
   SELECT policy per gated table, three-way WHERE preserved. (SEC-08)
