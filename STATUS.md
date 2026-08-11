# Status — what exists and works

A snapshot, not a changelog. Durable rules live in `CLAUDE.md`, next tasks in
`TODO.md`, open findings in `AUDIT.md`, per-tool detail in each tool's
`PLAN.md`, and full history in git.

_Last reviewed: 2026-08-11 (full architecture, security and performance audit)._

## Platform

|               |                                                                                                                                                              |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Production    | `goodearth-toolbox.vercel.app` — `master` auto-deploys on push                                                                                               |
| Region        | Vercel `bom1` + Supabase `ap-south-1` — both Mumbai                                                                                                          |
| Stack         | Next.js 16.2 (Turbopack) · React 19.2 · Tailwind 4 · Supabase Postgres                                                                                       |
| Migrations    | `0001`–`0051` all applied. `0049` (Overview indexes) went in ahead of `0050`/`0051` (Client Relations), closing AUDIT.md PERF-02.                            |
| Access model  | **Settled and live.** Per-user grants (`user_apps`) + role bundles (`role_apps`), enforced in the database by `has_app()`. `profiles.team` is a dead column. |
| Backups       | Supabase managed backups only. No independent export — see TODO.                                                                                             |
| Measured perf | Warm TTFB ~0.16s; cold ~1.14s. Cold starts dominate. Bundle, fonts, CSS, region all verified fine.                                                           |

## Tools

| Tool                  | State      | What it does                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| --------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Marathon**          | Production | Race-day kiosk: PIN login, entry capture, bib numbering, admin panel. Live since 30 Jul. Own auth, service-role client, `app/marathon/` — the one kiosk pattern, not to be copied.                                                                                                                                                                                                                                                                      |
| **Masters**           | Production | Shared reference data: projects, plots, units, clients, vendors, stores, items, categories, brands, GST rates, item requests. Reads ungated; writes need `/masters`.                                                                                                                                                                                                                                                                                    |
| **Settings**          | Production | People, per-user grants, role templates, approver lists. Admin-only. Holds the single sanctioned service-role call (`inviteUser`).                                                                                                                                                                                                                                                                                                                      |
| **Selections**        | Production | What design specifies per space. Revisions are immutable once issued; drift and downstream-impact panels show what a change would hit.                                                                                                                                                                                                                                                                                                                  |
| **Budgets**           | Production | Prices an issued revision (interiors) plus a construction stage tree. Carry-forward reuses prior prices across revisions. Money RLS-gated.                                                                                                                                                                                                                                                                                                              |
| **Indents**           | Production | Site requests pulled from approved budgets or raised direct. Carries **no money** by design.                                                                                                                                                                                                                                                                                                                                                            |
| **Purchase Orders**   | Production | Raised from indents only. The money entry point; RLS-gated to `/purchase-orders`. Per-line quantity guard prevents over-ordering.                                                                                                                                                                                                                                                                                                                       |
| **Inventory**         | Production | Goods receipts against POs, stock issues, adjustments, stock by location. Quantities only, never cost.                                                                                                                                                                                                                                                                                                                                                  |
| **Bills**             | Production | PO-anchored, labour-contract and NMR bills. A bill has no lines — the paper invoice's figures are the record.                                                                                                                                                                                                                                                                                                                                           |
| **Relay**             | Production | The baton relay: trails, departments, project schedules, standard trail types. Replaced the planned Project Management and Design Management tools. Every project is born with eight default stages over three years.                                                                                                                                                                                                                                   |
| **Business Planning** | Production | The founder's `Vihara_BusinessPlan_JV.xlsx` as a tool — SALE and HOLD lines, pure recalculating engine, sensitivity grid. Verified figure-for-figure (PBT ₹26.66 Cr at 22.2%; senior living HOLD 17.92% IRR). No FK to any other tool.                                                                                                                                                                                                                  |
| **Client Relations**  | Production | The Saarang plot register, replacing the "Overall Sheet / To do list". One engagement per villa carrying sale deed, construction agreement, registration and bottleneck as countable values; prospects and clients in one list; a nine-rung payment schedule with receipts against it. **The only money coming IN anywhere in the app.** RLS-gated to `/client-relations`, SELECT included. Design and site status are read from Relay and never typed. |
| Management Dashboard  | Stub       | Coming Soon. Route + sidebar entry exist.                                                                                                                                                                                                                                                                                                                                                                                                               |
| Financial Management  | Stub       | Coming Soon.                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Directory             | Stub       | Coming Soon.                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Training              | Stub       | Coming Soon.                                                                                                                                                                                                                                                                                                                                                                                                                                            |

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

## Settled decisions

- Relay replaced Project Management and Design Management. Their slugs remain
  in the database CHECKs (additive-only) but nothing links to them.
- A bill has no line items, by founder decision.
- POs come from indents only — never directly from a budget.
- Indents and Inventory never carry money.
- English-only UI is sufficient for all staff (founder-confirmed 2026-08-04).
- Site staff use phones at site; site-facing tools must genuinely work there.
