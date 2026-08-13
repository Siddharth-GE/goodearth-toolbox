# goodearth-toolbox — the rulebook

Internal tools for Goodearth, a design-led real estate company in Kerala
(~70 staff, sized for ~200 max). One self-hosted Next.js 16 + React 19 +
Tailwind 4 + Supabase app replacing spreadsheet/AppSheet workflows: many
tools, one per business function, one shared database. **Simple beats clever
at this scale** — no over-engineering, no new libraries without proven need.

**This Next.js is not the one you know.** v16 has breaking changes to APIs,
conventions and file structure. Read `node_modules/next/dist/docs/` before
writing code. Note `proxy.ts`, not `middleware.ts`.

`STATUS.md` = what exists. `TODO.md` = what's next. `DESIGN.md` before styling.
A tool's own `PLAN.md` before touching that tool. `AUDIT.md` = open findings.

## The one principle

**It's a toolbox.** Each tool is a self-contained instrument. Adding one
touches only its own folders plus a registry entry; breaking one must not
take the others down. Tools connect through exactly three threads: the
**shell** (auth, `lib/tools.ts`, per-user grants), the **shared database**
(including the line chain), and **shared UI/utilities** (`components/ui/*`,
`components/masters/*`, `lib/masters/`, `lib/hooks/`, `lib/format.ts`,
`lib/pdf/`).

**One tool never imports another tool's code.** When in doubt, choose the
design that keeps tools independent. _(One known violation exists —
`lib/budgets/quote.ts` importing `lib/selections/views`. Don't copy it; see
AUDIT.md MOD-01.)_

## Structure

- A tool = `app/(dashboard)/<tool>/` (screens) + `lib/<tool>/` (`queries.ts`
  reads, `actions.ts` writes).
- Kiosk tools with their own auth live top-level: `app/marathon/` is the only
  one and **not the pattern to copy**.
- `lib/overview/` is the shell's home, not a tool — the **one** module allowed
  to import other tools' queries (reads only, each call wrapped so a tool's
  failure can't take down the home page).
- New tool → register in `lib/tools.ts`; building a stub means flipping
  `built: true` and replacing its `page.tsx`.

## Security

- **The app grant IS the permission boundary.** Every query and action calls
  `requireTool("<href>")` (`lib/auth/access.ts`) **first**. Sidebar visibility
  is cosmetic. Admins get everything.
- Grants are per-user (`user_apps`) + role bundles (`role_apps`), unioned per
  request, enforced in the database by `has_app()`.
- **All database access is server-side.** No browser Supabase client exists —
  do not add one. Screens reach data through server actions only.
- Tools use the RLS-scoped client (`lib/supabase/server.ts`), never the admin
  client. Sole exception: `inviteUser` in `lib/settings/actions.ts` (auth-admin
  API only, never a table). Marathon uses service-role throughout — it has no
  Supabase Auth session at all.
- **RLS on for every table, always.** A new table without policies is a bug.
- Actions return `ActionState` (`lib/action-state.ts`), never throw. Queries
  may throw — a failed read has no partial answer worth showing.
- **Never seed a real default credential** (see AUDIT.md SEC-01).

## The line chain

Design flows to payment through the database, never through shared code. The
two files deciding what carries forward (`lib/budgets/carry-forward.ts`,
`lib/indents/pull-rules.ts`) are pure functions importing nothing.

| Hop                | Anchor                                             |
| ------------------ | -------------------------------------------------- |
| selection → budget | composite FK `(selection_id, line_key)`            |
| budget → indent    | composite FK `(budget_id, line_key)`               |
| indent → PO        | FK `purchase_order_lines.indent_line_id`, not null |
| PO → receipt       | FK `goods_receipt_lines.po_line_id`, not null      |
| PO → bill          | FK `bills.po_id`, header level only                |

**Anchor on stable ids or the composite FK — never a bare `line_key`.**

**Deletion is refused, not cascaded.** Issued revisions are immutable
(`selection_lines_draft_only`) and FKs are RESTRICT, so a linked design line
can't be deleted at all. Drift is _flagged_ instead: `classifyDesignDrift`
marks changed/removed lines, `getDownstreamImpact` shows which indents and POs
already exist before a designer touches a line.

## Money stays confined

Indents and Inventory carry no money. PO money is RLS-gated to
`/purchase-orders`; consumers read the money-free views (`po_facts`,
`po_line_facts`, `approved_budgets(_lines)`, `bill_facts`, `po_billing_totals`).

**One named exception, by founder decision: `/reporter` reads PO, bill,
budget and margin money** (`0055`, deliberately reversing `0011`'s margin
boundary). Done by _widening each table's one SELECT qual_ to
`has_app('/x') or has_app('/reporter')` — never a second policy, which ORs
in invisibly. `0055` ends by asserting exactly seven widened policies and no
doubles; keep that true. `budget_report_lines` is `security_invoker` — the
one view that must _inherit_ RLS rather than bypass it, because it carries
rupees. Settings shows an amber warning beside the Reporter checkbox
(`grantWarning` in `lib/tools.ts`); don't remove it.

**Never add a money column to a fact view; never add a second SELECT policy to
a gated table.** These views deliberately bypass RLS — their `WHERE` clause and
column list _are_ the boundary, so a careless column crosses it silently.

## What each tool reads from outside itself

This table IS the contract. A column here can't be renamed or dropped without
checking every tool in its row. Keep it current.

| Tool             | Reads                                                                                                                                                                                                                          |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Bills            | `po_facts`, `po_billing_totals`                                                                                                                                                                                                |
| Budgets          | `selections`, `selection_lines`, `spaces`                                                                                                                                                                                      |
| Indents          | `approved_budgets(_lines)`, `construction_budgets(_lines)`, `selections`, `selection_lines`, `po_line_facts`                                                                                                                   |
| Purchase Orders  | `indents`, `indent_lines`, `goods_receipts(_lines)`, `po_billing_totals`                                                                                                                                                       |
| Inventory        | `po_facts`, `po_line_facts`                                                                                                                                                                                                    |
| Selections       | `indents`, `indent_lines`, `po_line_facts`                                                                                                                                                                                     |
| Masters          | `po_facts`, `bill_facts`, `approved_budgets`, `indents`, `selections`, `selection_lines`                                                                                                                                       |
| Overview         | `indents`, `indent_lines`, `po_facts`, `bill_facts`, `goods_receipts` (counts only)                                                                                                                                            |
| Client Relations | `pusher_chain_state`, `selections`                                                                                                                                                                                             |
| Reporter         | `indents`, `indent_lines`, `purchase_orders(_lines)`, `bills`, `budget_report_lines` + masters lookups (`projects`, `units`, `vendors`, `items` via embeds; dataset registry `lib/reporter/datasets.ts` grows a row per stage) |

Relay reads only shared `projects`/`units`/`profiles`; Business Planning reads
nothing. Client Relations also reads the shared
`units`/`plots`/`projects`/`clients`/`profiles`. Masters, `profiles` and
`items` are shared, not another tool's.

`pusher_chain_state` has now been redefined five times (see `0042`'s warning)
and has a consumer outside Relay. A sixth definition must check Client
Relations too.

Everything above is a `SELECT`: **no tool's code writes another tool's table.**
Three documented exceptions:

1. **`indent_approvers`/`bill_approvers` are Settings-owned** despite living in
   Indents'/Bills' migrations (both admin-gated; deciding who approves is
   Settings' job).
2. **A cross-tool trigger, `projects_seed_schedule`** (`0045`) — creating a
   project in Masters writes Relay's `project_stages` and
   `pusher_project_plans`. Declared by _Relay's_ migration so the coupling
   points the right way, `security definer` because the creator holds
   `/masters`, not `/relay`.
3. **Client Relations writing Masters** (`0050`, `0051`) — three pieces.
   `clients` gains extra INSERT/UPDATE policies for `/client-relations`
   (permissive policies OR together; Masters keeps what it had).
   `crm_assign_unit`/`crm_release_unit` are `security definer` functions
   touching only `units.client_id` and `units.status`, because an UPDATE
   policy on `units` cannot be narrowed to two columns. And
   `units_seed_engagement` is a second cross-tool trigger: a unit created in
   Masters gets its CRM record and nine-rung payment schedule. **Each
   `security definer` function checks `has_app('/client-relations')` in its
   own body — that check is the entire permission boundary.**

A cross-tool trigger or definer function not listed here is what nobody finds
until it misfires.

## Reads

PostgREST silently caps selects at 1,000 rows. Anything needing completeness
goes through `fetchAll` (`lib/supabase/fetch-all.ts`), which **throws** if a
page fails. Lists state a limit and show "N of M" from a real count, never
`rows.length`.

**Always check `error`, not just `data`.** An empty result and a failed read
mean opposite things; conflating them has silently destroyed priced budget
lines and cleared design-drift warnings.

**An embed through a table with two FKs to the same target must name the key**
— `plots!units_plot_id_fkey`, because `units` has had two paths to `plots`
since `0029`. A bare embed answers HTTP 300 (`PGRST201`) at runtime. **No local
gate catches a bad `select` string**: it is not a type error, `next build`
compiles it, and the tests are pure logic with no database. Client Relations
shipped four dead screens through a fully green CI this way. Open the page, or
run the query.

## Database

Numbered SQL files in `supabase/migrations/`, applied **from this machine** via
the management API's `/database/query` endpoint (`SUPABASE_ACCESS_TOKEN` in
`.env.local`) — not by hand in Studio, and no handover needed. Same endpoint
reads production when you need to check what is actually there. No CLI, no
local Postgres, no rollback tooling.

- **Apply the migration first, then merge the code needing it.**
- **Additive only** — never rename or drop something in use.
- **Never edit an applied migration**; a correction is a new, later file
  (see `0014` fixing `0013`).
- **Write every one to be run twice** (`if not exists`, `drop … if exists`,
  `create or replace`).
- After applying: `npm run db:types`, commit types with the migration.
- New tool → extend **both** `user_apps_app_known` and `role_apps_app_known`
  CHECKs in the same migration, or granting fails at the database.

Making an admin **has a UI now** — the toggle on a person's row in Settings
(`setAdmin`, guarded by `profiles_guard()`, which refuses to remove the last
active admin and audits every change). The old `update profiles set role =
'admin' …` is the fallback for when nobody can get in at all.

## UI

Every screen from `components/ui/*` (+ `components/masters/*`) — no one-off
styles, no raw colour classes. Formatting through `lib/format.ts`. Every route
gets a `loading.tsx` with the shared `Spinner`. Read `DESIGN.md` (Warm
Minimalism) before styling.

**Charts are `recharts`** (added for Reporter Stage 3 on two explicit founder
requests — the "no new libraries" bar cleared, not lowered). It is imported
ONLY by `components/ui/chart/*`; screens use those wrappers, never Recharts
directly, and Next code-splits it to the routes that chart. The data shaping
lives in `lib/charts/{palette,series}.ts` (pure, tested); the PDF path
(Stage 9) rasterises the same charts through `sharp`, never a second
implementation. Chart colours are the `--chart-1…8` tokens — a fourth
deliberate palette; `DESIGN.md` says why its order must not be touched.

**Site engineers and store-keepers use this on phones at site** — Indents,
Inventory and site-facing flows must genuinely work on a phone. English-only
UI is confirmed sufficient. Plain English in all copy and error messages.

Using the catalogue picker? Add the grant to the allow-list in
`app/api/catalogue/route.ts` or it silently 403s.

## Environment

`.env.local` locally, Vercel settings in production. The two
`NEXT_PUBLIC_SUPABASE_*` vars are public — the anon key is safe _because_ RLS
is on everywhere; not a secret, but not a permission either.
`SUPABASE_SERVICE_ROLE_KEY` **bypasses RLS entirely** (server-only; Marathon +
import scripts). `SUPABASE_ACCESS_TOKEN` is the management API key — migrations
and production queries, local only, never in app code.
`MARATHON_SESSION_SECRET` signs the kiosk PIN cookie — changing it signs
everyone out of the kiosk.

Data loads are scripts in `scripts/`, **dry run by default, `--commit` to
write** (`import-catalogue.ts`, `import-saarang.ts`). Match on a natural key
and update in place so a re-run is a no-op; never delete to re-insert, because
live rows carry selections, budgets and indents.

## Tests & CI

Pure logic only (`npm test`) — no database, no browser; extract pure modules to
test them. CI is the gate; no hooks. It runs **prettier → lint → typecheck →
test → build → check:actions, stopping at the first failure**, so a trivial
lint error silently skips every check that matters. Confirm with `gh run list`
that a run is green — a successful push is not a green build.

**Never `export type` from a `"use server"` file** — it caused a production
outage; `npm run check:actions` enforces it.

**Smoke-test as a real single-grant user** (the probe account) before merging;
an admin passes every check and never sees grant bugs. After any deploy
changing server actions, press one real write-button on production.

## Git

`master` is production and auto-deploys on every push. Tools and sizeable
changes get a `feature/<tool>` branch — each push gets a preview URL. Merge to
`master` only after browser testing and sign-off, then delete the branch.
Small fixes to live tools may go straight to `master`. Commit each working
piece; never leave work uncommitted.

## Working with the founder

They direct the product, are not a developer, and judge the running app rather
than the code. Every session, unprompted: **before** a task, 3–5
plain-language bullets on what and why (wait for a go-ahead if it touches more
than a couple of files); **after**, a 2-sentence plain summary plus an "open
this page, try this" browser checklist. Small steps, one at a time, a
plain-English commit message each. If something breaks: one plain sentence on
the cause, then offer a rollback before patching chaos on chaos. Handle the
unhappy paths. Build fully what was approved; ask before adding what wasn't.
