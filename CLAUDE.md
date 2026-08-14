# goodearth-toolbox — the rulebook

Internal tools for Goodearth, a design-led real estate company in Kerala (~70 staff, sized for ~200). One self-hosted **Next.js 16 + React 19 + Tailwind 4 + Supabase** app replacing spreadsheet/AppSheet workflows: many tools, one per business function, one shared database. **Simple beats clever at this scale** — no over-engineering, no new libraries without proven need.

**This Next.js is not the one you know.** v16 has breaking changes to APIs and file structure. Read `node_modules/next/dist/docs/` first. Note `proxy.ts`, not `middleware.ts`.

`STATUS.md` = what exists, including the cross-tool read contract. `TODO.md` = what's next. `AUDIT.md` = open findings. `DESIGN.md` before styling. A tool's own `PLAN.md` before touching that tool. **"Do an audit" means: read `AUDIT.md`, re-verify its open findings, then rewrite it** — it is the standing record, not a one-off.

## The one principle

**It's a toolbox.** Each tool is a self-contained instrument. Adding one touches only its own folders plus a registry entry; breaking one must not take the others down. Tools connect through exactly three threads:

1. **The shell** — auth, `lib/tools.ts`, per-user grants.
2. **The shared database** — including the line chain.
3. **Shared UI/utilities** — `components/ui/*`, `components/masters/*`, `lib/masters/`, `lib/hooks/`, `lib/format.ts`, `lib/pdf/`, `lib/charts/`.

**One tool never imports another tool's code, and shared code never imports a tool's.** _(Two known violations: `lib/budgets/quote.ts` → `lib/selections/views`, and `lib/charts/series.ts` → `lib/reporter/*`. Don't copy either — AUDIT.md MOD-01, MOD-02.)_

## Structure

- A tool = `app/(dashboard)/<tool>/` (screens) + `lib/<tool>/` (`queries.ts` reads, `actions.ts` writes). `lib/masters/` uses `<entity>.ts` / `<entity>-actions.ts` pairs instead — sanctioned drift across nine entities.
- Every Operations and Management tool **opens on a welcome screen** (`_components/tool-welcome.tsx`): plain English, live counts, never rupees. The real first screen sits one click in, so actions must `revalidatePath("/<tool>", "layout")` — an exact-path call refreshes only the welcome and leaves the moved list stale.
- Kiosk tools with their own auth live top-level. `app/marathon/` is the only one and **not the pattern to copy**.
- `lib/overview/` is the shell's home, not a tool — the **one** module allowed to import other tools' queries (reads only, each call wrapped so one tool's failure can't take down the home page).
- New tool → register in `lib/tools.ts` and add its row to STATUS.md's contract table. A stub ships by flipping `built: true` and replacing its `page.tsx`.

## Security

- **The app grant IS the permission boundary.** Every query and action calls `requireTool("<href>")` (`lib/auth/access.ts`) **first**. Sidebar visibility is cosmetic. Admins get everything.
- Grants are per-user (`user_apps`) + role bundles (`role_apps`), unioned per request, enforced in the database by `has_app()`.
- **All database access is server-side.** No browser Supabase client exists — do not add one.
- Tools use the RLS-scoped client (`lib/supabase/server.ts`), never the admin client. Sole exception: `inviteUser` (auth-admin API, never a table). Marathon uses service-role throughout — it has no Supabase Auth session at all.
- **RLS on for every table, always.** A new table without policies is a bug.
- **A view is a READ surface.** Views are owned by `postgres` and bypass RLS, so a writable view is an RLS bypass with a `DELETE` on the end. Supabase's default privileges grant writes on every new relation, and `revoke … from public` does **not** remove `anon` or `authenticated` — name them. Every new view ships with `revoke insert, update, delete, truncate … from anon, authenticated`, and every new function with `revoke execute … from public, anon`, in the same migration. (AUDIT.md SEC-01/SEC-03 is what happens when it doesn't.)
- Every `security definer` function checks `has_app(...)` or `is_admin()` in its own body — that check is its entire permission boundary.
- Actions return `ActionState` (`lib/action-state.ts`), never throw. Queries may throw — a failed read has no partial answer worth showing.
- **Never seed a real default credential** (AUDIT.md SEC-05).

## The line chain

Design flows to payment through the database, never through shared code. The two files deciding what carries forward (`lib/budgets/carry-forward.ts`, `lib/indents/pull-rules.ts`) are pure functions importing nothing.

| Hop                | Anchor                                             |
| ------------------ | -------------------------------------------------- |
| selection → budget | composite FK `(selection_id, line_key)`            |
| budget → indent    | composite FK `(budget_id, line_key)`               |
| indent → PO        | FK `purchase_order_lines.indent_line_id`, not null |
| PO → receipt       | FK `goods_receipt_lines.po_line_id`, not null      |
| PO → bill          | FK `bills.po_id`, header level only                |

- **Anchor on stable ids or the composite FK — never a bare `line_key`.**
- **Deletion is refused, not cascaded.** Issued revisions are immutable (`selection_lines_draft_only`) and the FKs are RESTRICT, so a linked design line can't be deleted at all. Drift is _flagged_ instead: `classifyDesignDrift` marks changed/removed lines, `getDownstreamImpact` shows which indents and POs already exist before a designer touches a line.

## Money stays confined

Indents and Inventory carry no money. PO money is RLS-gated to `/purchase-orders`; consumers read the money-free views (`po_facts`, `po_line_facts`, `approved_budgets(_lines)`, `bill_facts`, `po_billing_totals`).

Two named exceptions, by founder decision. **`/reporter`** reads PO, bill, budget and margin money (`0055`), by _widening each table's one SELECT qual_ to `has_app('/x') or has_app('/reporter')`. **`/financial-management`** reads client money, bill money and plan targets (`0058`), entirely through owner views with a **three-way** WHERE, plus one new view `bill_money_facts`. Both grants carry an amber `grantWarning` in `lib/tools.ts`; don't remove it. `budget_report_lines` is the one `security_invoker` view — it must _inherit_ RLS, because it carries rupees. `crm_milestone_facts`/`crm_receipt_facts` are owner views whose `WHERE` and column list are the gate, because the CRM's stronger secret is prose (`details`, notes, bottlenecks), which they omit.

- **Never add a money column to a fact view.** Their `WHERE` and column list _are_ the boundary, so a careless column crosses it silently.
- **Never add a second SELECT policy to a gated table** — permissive policies OR together and the second one is invisible. Widen the existing qual.
- **Redefining `crm_milestone_facts`, `crm_receipt_facts` or `business_plan_target_facts` must carry the three-way WHERE forward** — re-running `0056`/`0057` as-is silently strips Financial Management's access. `0055` asserts seven widened policies and no doubles; `0058` asserts four views admit FM. Keep both true.

## Cross-tool reads and writes

**STATUS.md carries the contract table — which tool reads what from outside itself. It IS the contract: a column in it can't be renamed or dropped without checking every tool in its row. Keep it current.**

Everything in it is a `SELECT`: **no tool's code writes another tool's table.** Four documented exceptions — `indent_approvers`/`bill_approvers` are Settings-owned despite living in Indents'/Bills' migrations; the `projects_seed_schedule` trigger (`0045`) lets creating a project in Masters seed Relay's schedule, declared by _Relay's_ migration so the coupling points the right way; Client Relations writes Masters (`0050`, `0051`) through two column-narrow definer functions plus the `units_seed_engagement` trigger; and Directory's `profiles_seed_staff_details` trigger (`0060`) gives every new account a blank card, firing inside Settings' `inviteUser` — plus `updateMyName`, which writes `profiles.full_name` for the signed-in person's own row only. **A cross-tool trigger or definer function not listed there is what nobody finds until it misfires.**

`pusher_chain_state` has been redefined five times (`0042`'s warning) and now has two consumers outside Relay: **a sixth definition must check Client Relations and Reporter.**

## Reads

- PostgREST silently caps selects at 1,000 rows. Anything needing completeness goes through `fetchAll` (`lib/supabase/fetch-all.ts`), which **throws** if a page fails. Lists state a limit and show "N of M" from a real count, never `rows.length`.
- **Always check `error`, not just `data`.** An empty result and a failed read mean opposite things; conflating them has silently destroyed priced budget lines, cleared design-drift warnings, and re-opened the double-buy bug.
- **An embed through a table with two FKs to the same target must name the key** — `plots!units_plot_id_fkey`, because `units` has had two paths to `plots` since `0029`. A bare embed answers HTTP 300 (`PGRST201`) at runtime, and **no local gate catches a bad `select` string**: not a type error, `next build` compiles it, the tests have no database. Client Relations shipped four dead screens through a fully green CI this way. **Open the page, or run the query.**

## Database

Numbered SQL files in `supabase/migrations/`, applied **from this machine** via the management API's `/database/query` endpoint (`SUPABASE_ACCESS_TOKEN` in `.env.local`) — not by hand in Studio. The same endpoint reads production when you need to check what is actually there. No CLI, no local Postgres, no rollback tooling. Use Node for the request; PowerShell's `Invoke-RestMethod` mangles large JSON bodies.

- **Apply the migration first, then merge the code needing it.**
- **Additive only** — never rename or drop something in use.
- **Never edit an applied migration**; a correction is a new, later file (`0014` fixing `0013`).
- **Write every one to be run twice** (`if not exists`, `drop … if exists`, `create or replace`) and end it asserting what it claimed to do.
- After applying: `npm run db:types`, commit the types with the migration.
- New tool → extend **both** `user_apps_app_known` and `role_apps_app_known` CHECKs in the same migration, or granting fails at the database.
- Making an admin has a UI — the toggle in Settings (`setAdmin`, guarded by `profiles_guard()`, which refuses to remove the last active admin). The raw `update profiles set role = 'admin'` is the fallback for when nobody can get in at all.

## UI

- Every screen from `components/ui/*` (+ `components/masters/*`) — no one-off styles, no raw colour classes. Formatting through `lib/format.ts`. Every route gets a `loading.tsx` with the shared `Spinner`. Read `DESIGN.md` (Warm Minimalism) before styling.
- **Charts are `recharts`**, imported ONLY by `components/ui/chart/*` — screens use those wrappers, never Recharts directly, so Next code-splits it to the routes that chart. Data shaping lives in `lib/charts/` (pure, tested); the PDF path rasterises the same charts through `sharp`, never a second implementation. Chart colours are the `--chart-1…8` tokens; `DESIGN.md` says why their order must not be touched.
- **Site engineers and store-keepers use this on phones at site** — Indents, Inventory and site-facing flows must genuinely work on a phone. English-only UI is confirmed sufficient. Plain English in all copy and error messages.
- Using the catalogue picker? Add the grant to the allow-list in `app/api/catalogue/route.ts` or it silently 403s.

## Environment

`.env.local` locally, Vercel settings in production. The two `NEXT_PUBLIC_SUPABASE_*` vars are public — the anon key is safe _because_ RLS is on everywhere; not a secret, but not a permission either. `SUPABASE_SERVICE_ROLE_KEY` **bypasses RLS entirely** (server-only: Marathon + import scripts). `SUPABASE_ACCESS_TOKEN` is the management API key — local only, never in app code. `MARATHON_SESSION_SECRET` signs the kiosk PIN cookie; changing it signs everyone out of the kiosk.

Data-load scripts in `scripts/` are **dry run by default, `--commit` to write**. Match on a natural key and update in place so a re-run is a no-op; never delete to re-insert, because live rows carry selections, budgets and indents.

## Tests, CI and git

- Pure logic only (`npm test`) — no database, no browser; extract pure modules to test them. CI is the gate; no hooks. It runs **prettier → lint → typecheck → test → build → check:actions, stopping at the first failure**, so a trivial lint error silently skips every check that matters. Confirm with `gh run list` — a successful push is not a green build.
- **Never `export type` from a `"use server"` file** — it caused a production outage; `npm run check:actions` enforces it.
- **Smoke-test as a real single-grant user** (the probe account) before merging; an admin passes every check and never sees grant bugs. After any deploy changing server actions or policies, press one real write-button on production.
- `master` is production and auto-deploys on every push. Tools and sizeable changes get a `feature/<tool>` branch — each push gets a preview URL. Merge to `master` only after browser testing and sign-off, then delete the branch. Small fixes to live tools may go straight to `master`. **Commit each working piece and push it; never leave work uncommitted.**

## Working with the founder

They direct the product, are not a developer, and judge the running app rather than the code. Every session, unprompted: **before** a task, 3–5 plain-language bullets on what and why (wait for a go-ahead if it touches more than a couple of files); **after**, a 2-sentence plain summary plus an "open this page, try this" browser checklist. Small steps, one at a time, a plain-English commit message each. If something breaks: one plain sentence on the cause, then offer a rollback before patching chaos on chaos. Handle the unhappy paths. Build fully what was approved; ask before adding what wasn't.
