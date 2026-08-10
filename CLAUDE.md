# goodearth-toolbox

Internal tools platform for Goodearth, a design-led real estate company
in Kerala (~70 staff). One self-hosted Next.js + Supabase (Postgres)
app replacing spreadsheet/AppSheet workflows: many tools, one per
business function, one shared database. Serves ~200 users max — keep it
simple, no over-engineering, no extra libraries unless truly needed.

**Read first, every session: `STATUS.md`** (what's shipped, settled
decisions, session log) **then `TODO.md`** (the build plan for what's
next). `DESIGN.md` before styling anything. Each tool keeps its own
`PLAN.md` next to its code — check it before touching that tool.

**Shipped:** Marathon (kiosk), Settings, Masters, Selections, Budgets,
Indents, Purchase Orders, Inventory, Bills, **Pusher** (the relay —
Phase 1 of 4). **Next:** the rest of the Management group (Dashboard,
Client Relations, Financial, Business Planning — planned with the
founder one at a time), plus Directory and Training. **Pusher replaced
the planned Project Management and Design Management tools**: it is the
whole design-management and project-management layer, one module, and
those two stubs are deleted. Their slugs stay in the database CHECKs
(additive-only) but nothing links to them. Unbuilt tools are Coming Soon
stubs — route and sidebar entry already exist in `lib/tools.ts`;
building one means flipping `built: true` and replacing the stub
`page.tsx`.

## Architecture — first principles

- **It's a toolbox.** Each tool is a self-contained module: adding one
  touches only its own folders plus a registry entry, and editing or
  even breaking one must not take the others down. Tools connect only
  through the shared database and the few deliberate shared surfaces
  (`lib/masters/`, the money-free views, `components/ui`,
  `lib/hooks/`) — one tool never imports another tool's code. When in doubt, choose the design
  that keeps tools independent.
- **Structure.** A tool is `app/(dashboard)/<tool>/` (screens) plus
  `lib/<tool>/` (`queries.ts` reads, `actions.ts` writes). Kiosk-style
  tools with their own auth live top-level (`app/marathon/` — the only
  one; not the pattern to copy). Platform actions (login/logout) in
  `app/actions/`; everything tool-specific in `lib/<tool>/`.
- **Access.** The app grant IS the permission boundary (`user_apps` +
  Settings; admins get everything). Every query/action calls
  `requireTool("<href>")` from `lib/auth/access.ts` first — sidebar
  visibility is cosmetic. Actions return the shared `ActionState`
  (`lib/action-state.ts`), never throw. Dashboard tools use the
  RLS-scoped client (`lib/supabase/server.ts`), never the admin client —
  the single sanctioned exception is `inviteUser` in
  `lib/settings/actions.ts` (creating a login has no RLS path), and it
  touches only the auth-admin API, never a table.
- **Shared masters** (`lib/masters/`): reads are ungated, any tool
  calls them; writes require the `/masters` grant. Two files per
  master — queries (`import "server-only"`) and actions (file-level
  `"use server"`) — never mixed, and **never `export type` re-exports
  from a `"use server"` file** (caused a production outage;
  `npm run check:actions` in CI enforces this).
- **Money stays confined.** Indents carry no money. PO money is
  RLS-gated to the `/purchase-orders` grant; consumers read the
  money-free views (`po_facts`/`po_line_facts`, `approved_budgets`/
  `approved_budget_lines`) — never add money columns to them, never add
  a second SELECT policy on gated tables. Cross-tool lines anchor on
  stable ids (`purchase_order_lines.id`, `indent_lines.id`) or the
  `(budget_id, line_key)` composite FK — never a bare `line_key`.
- **What each tool reads from outside itself.** Tools coordinate only
  through the database, so this list IS the contract between them — a
  column here cannot be renamed or dropped without checking every tool
  in its row. Keep it current when a tool starts reading something new.

  | Tool            | Reads from other tools                                                                                                                             |
  | --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
  | Bills           | `po_facts`, `po_billing_totals`                                                                                                                    |
  | Budgets         | `selections`, `selection_lines`, `spaces`                                                                                                          |
  | Indents         | `approved_budgets`, `approved_budget_lines`, `construction_budgets`, `construction_budget_lines`, `selections`, `selection_lines`, `po_line_facts` |
  | Purchase Orders | `indents`, `indent_lines`, `goods_receipts`, `goods_receipt_lines`, `po_billing_totals`                                                            |
  | Inventory       | `po_facts`, `po_line_facts`                                                                                                                        |
  | Selections      | `indents`, `indent_lines`, `po_line_facts` (the drift and impact panels)                                                                           |
  | Masters         | `po_facts`, `bill_facts`, `approved_budgets`, `indents`, `selections`, `selection_lines`                                                           |
  | Overview        | `indents`, `indent_lines`, `po_facts`, `bill_facts`, `goods_receipts` (counts only)                                                                |

  Money never crosses on a base table — always a fact view. The
  non-money handoffs above cross on raw tables, which is allowed but is
  exactly why they are listed here. Everything in this table is a
  `SELECT`: **no tool ever writes another tool's table.** Masters,
  `profiles` and the `items` catalogue are shared, not another tool's,
  so they are not listed.

- **Reads.** PostgREST silently caps selects at 1,000 rows. Anything
  needing completeness (merges, lookups, carry-forward) goes through
  `fetchAll` (`lib/supabase/fetch-all.ts`), which returns the rows and
  **throws** if a page fails — there is no partial answer to ignore.
  On-screen lists state a limit and show "N of M" from a real count,
  never `rows.length`.
- **Database.** Every schema change is a numbered SQL file in
  `supabase/migrations/`, additive only, never edited once applied.
  Apply in Supabase Studio **before** deploying dependent code, then
  `npm run db:types` and commit types with the migration. New tool →
  extend **both** the `user_apps_app_known` and `role_apps_app_known`
  CHECKs in the same migration, or granting it fails at the database.
- **UI.** Every screen from `components/ui/*` (+ `components/masters/*`
  for shared domain pieces) — no one-off styles, no raw color classes.
  All formatting through `lib/format.ts`. Every route gets a
  `loading.tsx` with the shared `Spinner`. If a tool uses the catalogue
  picker, add its grant to the allow-list in
  `app/api/catalogue/route.ts` or the picker silently 403s.
- **Tests** cover pure logic only (`npm test`, node:test via tsx) — no
  database, no browser; extract pure modules to test them. CI is the
  gate; no hooks. It runs, in this order: prettier, **lint**, typecheck,
  test, build, check:actions — and stops at the first failure, so a
  trivial lint error silently skips every check that matters. Check
  `gh run list` is actually green, not just that a push succeeded.
- **Smoke-test as a real single-grant user** (the probe account, one
  tool's grant only) before merging — an admin passes every check and
  never sees grant bugs. After any deploy that changes server actions,
  press one real write-button on production.

## Git

`master` is production — auto-deploys to Vercel on every push. Tools
and sizeable changes get a `feature/<tool>` branch (each push gets a
preview URL for review); merge to `master` only after browser testing
and sign-off, then delete the branch. Small fixes to live tools may go
straight to `master`.

@AGENTS.md

## Working with me

I am the founder, not a developer. I direct the product; you handle the
code. Every session, unprompted:

- Before a task: 3–5 plain-language bullets on what and why; wait for
  my go-ahead if it touches more than a couple of files.
- After: a 2-sentence plain summary plus an "open this page, try this"
  browser checklist — I judge the running app, not the code.
- Small steps, one thing at a time; commit each working piece with a
  plain-English message; never leave work uncommitted.
- If something breaks: one plain sentence on the cause, then offer a
  rollback before patching chaos on chaos.
- Handle the unhappy paths (bad input, empty states, double submits).
- Build fully what I approved; ask before adding anything I didn't.
