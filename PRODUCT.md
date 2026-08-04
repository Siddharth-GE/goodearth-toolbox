# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- ~70 staff of Goodearth, a design-led real estate company in Kerala;
  the platform is sized for ~200 users maximum. Access is per-tool
  grants managed in Settings; admins see everything.
- Office staff — accounts, QS/budgets team, designers, admins — work on
  desktops/laptops. **Site engineers and store-keepers often open the
  toolbox on their phones at site** (founder, 2026-08-04): site-facing
  tools (Indents, Inventory, and future site workflows) must genuinely
  work on a phone, not merely not break.
- The founder directs the product and is not a developer; they judge
  the running app in the browser, in plain language.
- One public-facing exception: the Marathon kiosk serves event
  participants on race day, operated at a single device.
- English UI works for everyone (founder-confirmed 2026-08-04); no
  Malayalam or bilingual requirement.

## Product Purpose

One self-hosted internal platform — many tools, one per business
function, one shared database — replacing the company's spreadsheet and
AppSheet workflows. Success, as the founder defines it (2026-08-04):

1. **All purchasing runs through it** — every indent, PO, goods
   receipt, stock movement and bill, nothing off the books.
2. **The founder can steer the company from it** — the Management layer
   gives real visibility into projects, money and people without asking
   anyone for a report.
3. **The team adopts it without hand-holding** — staff pick tools up on
   their own; no training sessions, no resistance.

(Full retirement of spreadsheets was offered as a success criterion and
deliberately not selected — coexistence is acceptable; flow-through and
visibility are what count.)

## Positioning

Not a market product — an internal system whose edge over off-the-shelf
software is that it is shaped tool-by-tool with the founder around
Goodearth's actual workflows, on one shared database: a budget line, an
indent line, a PO line and a bill stay linked on stable ids across
tools, which no spreadsheet stack could truthfully do.

## Operating Context

- The business runs projects → plots ↔ units (strictly 1:1). The work
  chain the toolbox mirrors: design selections → issued revision →
  budget → site indents → purchase orders by vendor → goods
  receipt / stock / issues → bills (PO, labour contract, or NMR daily
  wages) → payment.
- Money visibility is a deliberate organisational boundary: indents
  carry no money; PO money is visible only to `/purchase-orders`
  holders, bill money to `/bills` holders; everyone else reads
  money-free views.
- Production is `goodearth-toolbox.vercel.app`, auto-deployed from
  `master`; migrations are applied from the founder's machine via the
  Supabase management API.

## Capabilities and Constraints

- **Shipped tools:** Marathon (kiosk), Settings, Masters, Selections,
  Budgets, Indents, Purchase Orders, Inventory, Bills.
- **Coming Soon (stubs live, planned with the founder one at a time):**
  the Management group — Dashboard, Project Management, Design
  Management, Client Relations, Financial Management, Business
  Planning — plus Directory and Training.
- Architecture constraints future work must preserve: tools are
  self-contained modules that never import each other's code; the app
  grant is the permission boundary; migrations are additive-only;
  ~200-user scale means no over-engineering and no new libraries
  without real need (see CLAUDE.md — the durable rulebook).
- Domain terminology in daily use: indents, GRN/ISS/PO/BILL references
  minted per project/scope, `line_key` as a line's cross-revision
  identity, "issued" revisions, NMR (daily-wage muster roll).

## Brand Commitments

- The name is **Goodearth Toolbox**. Visual authority for every screen
  is `DESIGN.md` (binding): Apple-meets-Google-meets-Notion with
  editorial quality, Geist Sans, one green accent, quiet motion —
  warm, not cold; minimal, not bare.
- Voice: plain English throughout — UI copy, error messages, and
  everything shown to the founder. No jargon in user-facing text.
- Letterhead assets (logo, company address, GST number, PO terms) are
  **pending from the founder** for the PDF documents; until provided,
  documents ship without them — never invent or placeholder them as if
  real.

## Evidence on Hand

- A real catalogue: 2,633 items (2,631 imported from the company's
  data), 14 categories, 21 brands; 897 real thumbnails in Supabase
  Storage, the rest on deliberate colour placeholders.
- Real staff accounts and grants in production; real indents, POs and
  bills beginning to flow (Bills shipped 2026-08-04).
- The founder's master data (clients, plots, units) is queued for
  import from spreadsheets — not yet loaded.
- No testimonials, marketing claims or public content exist or are
  needed; this product is internal.

## Product Principles

1. **One toolbox, independent tools.** Editing or even breaking one
   tool must never take the others down; the shared database and a few
   deliberate surfaces are the only connective tissue.
2. **The grant is the boundary.** Who can see money is an
   organisational decision enforced in the database, not a UI courtesy.
3. **Simple beats clever at this scale.** ~200 users; no
   over-engineering, no speculative components, no libraries without a
   proven need.
4. **The founder judges the running app.** Plain language, small
   reviewable steps, a browser checklist after every change.
5. **Self-evident over trained.** Success includes adoption without
   hand-holding — flows must make sense to a site engineer on a phone
   the first time they see them.

## Accessibility & Inclusion

English-only UI is confirmed sufficient for all staff. The material
inclusion requirement is device and situation: site engineers and
store-keepers use phones in the field, so site-facing screens must be
comfortably usable on a phone (touch targets, few steps, forgiving
forms). No other product-specific accessibility standard has been
established.
