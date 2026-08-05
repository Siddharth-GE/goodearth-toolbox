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
Indents, Purchase Orders, Inventory, Bills. **Next:** the Management
group (Dashboard, Project, Design, Client Relations, Financial,
Business Planning — planned with the founder one at a time), plus
Directory and Training. Unbuilt tools are Coming Soon stubs —
route and sidebar entry already exist in `lib/tools.ts`; building one
means flipping `built: true` and replacing the stub `page.tsx`.

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
- **Reads.** PostgREST silently caps selects at 1,000 rows. Anything
  needing completeness (merges, lookups, carry-forward) goes through
  `fetchAll` (`lib/supabase/fetch-all.ts`); on-screen lists state a
  limit and show "N of M" from a real count, never `rows.length`.
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
  database, no browser; extract pure modules to test them. CI
  (typecheck, prettier, build, check:actions) is the gate; no hooks.
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
