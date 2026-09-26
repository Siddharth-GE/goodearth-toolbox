# Status — what exists and works

A snapshot, not a changelog: what exists now. Next work is `TODO.md`, each tool's rules its `PLAN.md`, history is git.

## Environments

|                             | Supabase ref           | Who reaches it                                                                                   |
| --------------------------- | ---------------------- | ------------------------------------------------------------------------------------------------ |
| `goodearth-toolbox`         | `pajfrgnkapicdgangjey` | **Production** — `toolbox.goodearthkannur.org`, from `master`. Real work, real staff.            |
| `goodearth-toolbox-staging` | `ipstebqawrvhkyntctrv` | **Staging** — `staging.goodearthkannur.org` from `staging`, every preview URL, and `npm run dev` |

How they move, and every rule that keeps them apart, is `SHIPPING.md`.

- **Production is paused** (free tier, found `INACTIVE` 2026-09-25 despite the weekly keep-alive) and has **no backups**. Restoring it is the founder's — `TODO.md`.
- **Staging carries work production does not have yet**, each waiting for the founder's vet or a ship day: the "stone and glass" skin, the Google Chat door (`0094`), Dexter (`0095`), the Estimator's measurement sheet and rework (`0096`–`0098`), the catalogue pictures, and smaller Reporter/Selections/Design Management changes. How it can reach `master` is in `TODO.md`.
- **Staging's data is practice.** Selections, budgets, rooms and everything built on them were cleared on 2026-09-26 at the founder's request, so the team starts from scratch there; master data (people, projects, units, clients, vendors, the catalogue) stayed.
- **Only two accounts can sign in on staging** — the founder's and the probe (`siddharth.cyriac.99+probe@gmail.com`, holds `/inventory` only; set a throwaway password through the auth admin API each time). Every other staff email there is `@staging.invalid`, so reproduce a colleague's problem with the probe and a grant.

## Platform

- **Stack:** Next.js 16.2 (Turbopack) · React 19.2 · Tailwind 4 · Supabase Postgres. Vercel `bom1` + Supabase `ap-south-1`, both Mumbai.
- **Migrations:** `0001`–`0093` on both databases; `0094`–`0098` on staging only. `applied_migrations` (`0067`) is the ledger, and CI checks it on every pull request.
- **Access:** per-user grants (`user_apps`) + role bundles (`role_apps`), enforced in the database by `has_app()`. `profiles.team` is a dead column.
- **Sign-in:** password → emailed 6-digit code (30-day trusted device), self-service reset, Google for existing team emails only; both steps rate-limited in the database. Mail rides Resend as `toolbox@goodearthkannur.org`. The rules are `SECURITY.md`.
- **Performance:** warm TTFB ~0.2s, cold ~1.0s — cold starts are the one measured problem. Every dashboard page shows a loading state: 84 of 127 pages have their own `loading.tsx`, the rest inherit the nearest parent's.
- **Look:** "stone and glass" (on staging), rules in `DESIGN.md`. The home page shows only real numbers.

## Tools

Production unless marked. Each tool's rules are its `PLAN.md` (Google Chat door: `lib/google-chat/PLAN.md`). Every Operations and Management tool opens on a welcome screen (`_components/tool-welcome.tsx`, counts from each tool's `getWelcomeCounts()`).

- **Marathon** — race-day kiosk: PIN login, entries, bibs, admin. Own auth and service-role client — the one kiosk, not a pattern.
- **Masters** — the shared reference data every tool reads: projects, plots, units, clients, vendors, stores, items (catalogue and materials), categories, brands, GST rates, construction stages, units of measure, works, item requests. Reads ungated, writes need `/masters`.
- **Settings** — people, grants, roles, approver lists. Admin only.
- **Selections** — what design specifies per room; revisions immutable once issued. Tiles and lines show the item's picture, description and product link (catalogue pictures on staging).
- **Budgets** — prices an issued revision (interiors) and a construction stage tree; money gated.
- **Indents** — site requests from a villa's official estimate, an approved interiors budget, or direct. No money.
- **Purchase Orders** — from approved indents, or direct for bulk/urgent buys. The money entry point, gated.
- **Inventory** — goods in, stock issues, adjustments, stock by location, the supervisors' request queue. Quantities only.
- **Bills** — PO, labour-contract and NMR bills; a bill has no lines.
- **Relay** — the baton relay: trails, departments, schedules, a wave per villa. Stores no documents. The **Google Chat door** drives it from Chat (staging).
- **Design Management** — drawing sets, revisions and transmittals per villa; released drawings reach Supervisors.
- **Estimator** — what a villa costs: a rate book, each villa measured on its own, a frozen official copy, one site-check list (the rework on staging).
- **Supervisors** — the site's day on a phone: labour, material requests, drawn-vs-estimated per work.
- **Client Relations** — the plot register and the only money coming in: payment schedules and receipts.
- **Business Planning** — the founder's JV business plan as a recalculating tool.
- **Financial Management** — cash, forward view and funding facilities, read from views.
- **Reporter** — a report builder over a dataset registry; carries money by founder decision.
- **Directory** — everyone who works here; people keep their own details current.
- **Dexter** — client presentations as shareable links (staging only).
- **Training** — stub.

The chain runs end to end: design → price → indent → PO → goods in / stock / goods out → bill → paid.

## The cross-tool read contract

**This table IS the contract.** A column in it can't be renamed or dropped without checking every tool in its row, and a tool that starts reading outside itself adds its row here in the same change. Everything is a `SELECT`; the writes that cross a boundary are the exceptions `SECURITY.md` lists. Masters, `profiles` and `items` are shared surfaces, not another tool's property, and are not listed.

| Tool                 | Reads from outside itself                                                                                                                                          |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Bills                | `po_facts`, `po_billing_totals`                                                                                                                                    |
| Budgets              | `selections`, `selection_lines`, `spaces`, `indent_lines` (refusing to delete a construction line an indent uses)                                                  |
| Indents              | `approved_budgets(_lines)`, `selections`, `selection_lines`, `po_line_facts`, `estimate_takeoff_facts`                                                             |
| Purchase Orders      | `indents`, `indent_lines`, `goods_receipts(_lines)`, `po_billing_totals`                                                                                           |
| Inventory            | `po_facts`, `po_line_facts`, `estimate_takeoff_facts`, `issue_requests`                                                                                            |
| Selections           | `indents`, `indent_lines`, `po_line_facts`                                                                                                                         |
| Masters              | `po_facts`, `bill_facts`, `approved_budgets`, `indents`, `selections`, `selection_lines`                                                                           |
| Overview (home page) | `indents`, `indent_lines`, `po_facts`, `bill_facts`, `goods_receipts`, `staff_departments` (counts only) + `lib/marathon/queries`                                  |
| Relay                | nothing outside the shared surfaces                                                                                                                                |
| Google Chat door     | Relay's own `pusher_*` tables and `pusher_chain_state`, through the admin client (`SECURITY.md`)                                                                   |
| Client Relations     | `pusher_chain_state`, `selections`                                                                                                                                 |
| Reporter             | `lib/reporter/datasets.ts` is the list: indents, POs, bills, budget report lines, CRM facts, goods receipts, stock, selections, `pusher_chain_state`, plan targets |
| Financial Management | `crm_milestone_facts`, `crm_receipt_facts`, `bill_money_facts`, `business_plan_target_facts`                                                                       |
| Estimator            | `stock_issues(_lines)`, `goods_receipts(_lines)` (issued-vs-estimated)                                                                                             |
| Supervisors          | `estimate_takeoff_facts`, `stock_issues(_lines)`, `goods_receipts(_lines)`, `lib/drawings/`                                                                        |
| Design Management    | nothing outside the shared surfaces; owns the tables behind `lib/drawings/`                                                                                        |
| Business Planning    | `projects` (its one optional link)                                                                                                                                 |
| Directory, Dexter    | nothing outside the shared surfaces                                                                                                                                |

**Nothing reads** Financial Management, Dexter or the Estimator's own tables — only its rate-free view `estimate_takeoff_facts`. A redefinition of `pusher_chain_state` must check Client Relations, Reporter and the Google Chat door (`relay/PLAN.md`).
