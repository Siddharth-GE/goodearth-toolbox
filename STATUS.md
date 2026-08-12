# Status — what exists and works

A snapshot, not a changelog. Durable rules live in `CLAUDE.md`, next tasks in
`TODO.md`, open findings in `AUDIT.md`, per-tool detail in each tool's
`PLAN.md`, and full history in git.

_Last reviewed: 2026-08-11 — full architecture, security and performance audit,
then Client Relations shipped._

## Platform

|               |                                                                                                                                                              |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Production    | `goodearth-toolbox.vercel.app` — `master` auto-deploys on push                                                                                               |
| Region        | Vercel `bom1` + Supabase `ap-south-1` — both Mumbai                                                                                                          |
| Stack         | Next.js 16.2 (Turbopack) · React 19.2 · Tailwind 4 · Supabase Postgres                                                                                       |
| Migrations    | `0001`–`0053`, all applied. Nothing pending.                                                                                                                 |
| Access model  | **Settled and live.** Per-user grants (`user_apps`) + role bundles (`role_apps`), enforced in the database by `has_app()`. `profiles.team` is a dead column. |
| Backups       | Supabase managed backups only. No independent export — see TODO.                                                                                             |
| Measured perf | Warm TTFB ~0.16s; cold ~1.14s. Cold starts dominate. Bundle, fonts, CSS, region all verified fine.                                                           |

## Tools

| Tool                  | State      | What it does                                                                                                                                                                                                                                                                                                                                                                                           |
| --------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Marathon**          | Production | Race-day kiosk: PIN login, entry capture, bib numbering, admin panel. Live since 30 Jul. Own auth, service-role client, `app/marathon/` — the one kiosk pattern, not to be copied.                                                                                                                                                                                                                     |
| **Masters**           | Production | Shared reference data: projects, plots, units, clients, vendors, stores, items, categories, brands, GST rates, **construction stages** (`0053` — picked, never typed; renames cascade to indents), item requests. Reads ungated; writes need `/masters`.                                                                                                                                               |
| **Settings**          | Production | People, per-user grants, role templates, approver lists. Admin-only. Holds the single sanctioned service-role call (`inviteUser`).                                                                                                                                                                                                                                                                     |
| **Selections**        | Production | What design specifies per space. Revisions are immutable once issued; drift and downstream-impact panels show what a change would hit.                                                                                                                                                                                                                                                                 |
| **Budgets**           | Production | Prices an issued revision (interiors) plus a construction stage tree. Carry-forward reuses prior prices across revisions. Money RLS-gated.                                                                                                                                                                                                                                                             |
| **Indents**           | Production | Site requests pulled from approved budgets or raised direct. Carries **no money** by design.                                                                                                                                                                                                                                                                                                           |
| **Purchase Orders**   | Production | Raised from indents only. The money entry point; RLS-gated to `/purchase-orders`. Per-line quantity guard prevents over-ordering.                                                                                                                                                                                                                                                                      |
| **Inventory**         | Production | Goods receipts against POs, stock issues, adjustments, stock by location. Quantities only, never cost.                                                                                                                                                                                                                                                                                                 |
| **Bills**             | Production | PO-anchored, labour-contract and NMR bills. A bill has no lines — the paper invoice's figures are the record.                                                                                                                                                                                                                                                                                          |
| **Relay**             | Production | The baton relay: trails, departments, project schedules, standard trail types. Replaced the planned Project Management and Design Management tools. Every project is born with eight default stages over three years.                                                                                                                                                                                  |
| **Business Planning** | Production | The founder's `Vihara_BusinessPlan_JV.xlsx` as a tool — SALE and HOLD lines, pure recalculating engine, sensitivity grid. Verified figure-for-figure (PBT ₹26.66 Cr at 22.2%; senior living HOLD 17.92% IRR). No FK to any other tool.                                                                                                                                                                 |
| **Client Relations**  | Production | The Saarang plot register, replacing the tracking sheet. One record per villa: sale deed, construction agreement, registration, bottleneck. Prospects and clients in one list. **The only money coming IN anywhere in the app** — a nine-rung payment schedule with receipts against it. Gated on `/client-relations`, SELECT included. Design and site status come from Relay, never typed.           |
| **Reporter**          | Production | Was the Dashboard stub; stages 1–3 of 10 merged 2026-08-12. A report builder over a dataset registry — columns, dropdown-only filters (founder rule), two-level grouping, measures, sort, subtotals — now rendering as a composed page: KPI band, chart (6 forms via `recharts` behind `components/ui/chart/*`), table. One dataset so far (`indent_lines`). Next: CSV (Stage 4). Plan: its `PLAN.md`. |
| Financial Management  | Stub       | Coming Soon.                                                                                                                                                                                                                                                                                                                                                                                           |
| Directory             | Stub       | Coming Soon.                                                                                                                                                                                                                                                                                                                                                                                           |
| Training              | Stub       | Coming Soon.                                                                                                                                                                                                                                                                                                                                                                                           |

The chain runs end to end: design → price → indent → PO → goods in / stock /
goods out → bill → paid.

## Notable facts worth not rediscovering

- **Migrations are applied from this machine** via the management API's
  `/database/query` endpoint (`SUPABASE_ACCESS_TOKEN` in git-ignored
  `.env.local`) — not by hand in Studio. Verify, then `npm run db:types`.
  Use Node for the request; PowerShell's `Invoke-RestMethod` mangles large
  JSON bodies.
- **Preview deployments sit behind Vercel's SSO wall** — a preview URL 302s
  unless that browser is signed into Vercel. So the two-browser probe smoke
  uses the private window for **production**, and your Vercel-authenticated
  browser for the preview.
- **The probe account holds `/inventory` only.** Its password is never stored
  — set a throwaway one via the auth admin API each time. Its
  `@goodearth.test` domain isn't real, so recovery emails can never arrive.
  The reset did work on 2026-08-10; try it before assuming a browser pass is
  impossible.
- **Relay's `replaceFutureLegs`, `editableFromLeg` and `scoreAll` are unused
  on purpose** — tested write paths not yet wired to a screen. Don't let a
  cleanup delete them.
- **Line pulls are deliberately non-atomic** — row-by-row so the quantity
  guard can refuse one line with a useful message rather than failing the
  whole basket. Each reports partial success honestly.
- **Full CI browser smoke was costed and declined** (2026-08-03);
  `check:actions` covers the known outage class.
- **Dark mode is a switch, not a stored preference.** Sidebar user menu and
  login screen; `data-theme` on `<html>`, remembered in a cookie and applied
  by a blocking inline script before first paint. Untouched, it follows the
  device as it always did. Nothing is stored on anyone's account — no
  migration, no Settings screen. Rules in `DESIGN.md`, logic in `lib/theme.ts`.
- **Reading the theme cookie in the root layout costs static rendering.**
  Tried it: `cookies()` there turned `/login`, `/_not-found` and
  `/_global-error` from prerendered into server-rendered-on-demand — the whole
  app went dynamic. Hence the inline script. Worth re-measuring the same way
  (`.next/prerender-manifest.json`) before adding any other `cookies()` or
  `headers()` call to a root layout.
- **`color-scheme` is why date pickers were white.** The app carried a full
  dark palette from the start but never declared `color-scheme`, so the
  browser drew its own furniture — date and number inputs, select menus,
  scrollbars — in light colours on a dark page, across ~30 forms. One line
  fixed all of them, and nothing in CI could ever have seen it.
- **A broken PostgREST `select` passes every gate.** Client Relations shipped
  with four dead screens behind a fully green
  `format → lint → typecheck → test → build`: an ambiguous embed answers HTTP
  300 at runtime and is invisible to all of them — not a type error, the build
  compiles it, and the tests are pure logic with no database. **Open the page,
  or run the query.** The specific trap: a table with two FKs to the same
  target needs the key named (`plots!units_plot_id_fkey`), and `units` has had
  two to `plots` since `0029`.

## Settled decisions

- Relay replaced Project Management and Design Management. Their slugs remain
  in the database CHECKs (additive-only) but nothing links to them.
- A bill has no line items, by founder decision.
- POs come from indents only — never directly from a budget.
- Indents and Inventory never carry money.
- English-only UI is sufficient for all staff (founder-confirmed 2026-08-04).
- Site staff use phones at site; site-facing tools must genuinely work there.
