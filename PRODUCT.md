# Product

<!-- impeccable:product-schema 1 -->

The product brief for design work (the `impeccable` skill reads it). The rules are `CLAUDE.md`, the visual system `DESIGN.md`, what exists `STATUS.md`.

## Platform

web

## Users

- ~70 staff of Goodearth, a design-led real estate company in Kerala; sized for ~200. Access is per-tool grants in Settings; admins see everything.
- Office staff — accounts, QS/budgets, designers, admins — on desktops and laptops. **Site engineers, supervisors and store-keepers use it on phones at site**: site-facing tools (Indents, Inventory, Supervisors) must genuinely work on a phone.
- The founder directs the product, is not a developer, and judges the running app in plain language.
- Two outside audiences: race-day participants at the Marathon kiosk, and clients opening a Dexter presentation link.
- English-only UI is confirmed sufficient.

## Product Purpose

One self-hosted internal platform — many tools, one per business function, one shared database — replacing spreadsheets and AppSheet. Success, as the founder defines it:

1. **All purchasing runs through it** — every indent, PO, goods receipt, stock movement and bill.
2. **The founder can steer the company from it** — projects, money and people, without asking anyone for a report.
3. **The team adopts it without hand-holding.**

Spreadsheets may coexist; flow-through and visibility are what count.

## Positioning

An internal system shaped tool by tool with the founder around Goodearth's real workflows, on one shared database: a design line, a budget line, an indent line, a PO line and a bill stay linked on stable ids across tools — which no spreadsheet stack can truthfully do.

## Operating Context

- Projects → plots ↔ units (1:1). The chain the toolbox mirrors: design selections → issued revision → budget → site indents (or from a villa's official estimate) → purchase orders → goods receipt / stock / issues → bills (PO, labour contract, NMR) → payment; client payments come in through Client Relations.
- Money visibility is an organisational boundary enforced in the database: indents and inventory carry no money; PO, bill, budget, estimate and client money are each visible only to their tool's holders.
- Production is `toolbox.goodearthkannur.org`, from `master`; staging is `staging.goodearthkannur.org`.

## Capabilities and Constraints

- Twenty tools across Operations, Management, People, Events and Admin — the list and each one's state is `STATUS.md`.
- Constraints to preserve: tools are self-contained and never import each other's code; the app grant is the permission boundary; migrations are additive only; at ~200 users, no over-engineering and no new library without proven need.
- Domain words in daily use: indent, GRN/ISS/PO/BILL/EST references minted per project, `line_key` (a line's identity across revisions), an "issued" revision, an "official" estimate, NMR (daily-wage muster roll), villa, plot, trail and baton (Relay).

## Brand Commitments

- **Goodearth Toolbox.** `DESIGN.md` is binding: Aman meets Apple — warm stone neutrals in three tones, Geist Sans alone, one green accent for actions, hairlines at rest and a shadow only on what floats, a small fixed motion vocabulary.
- Plain English everywhere — UI copy, errors, everything the founder reads.
- Letterhead assets (logo, address, GST number, PO terms) for PDFs are pending from the founder; never invent or placeholder them as real.

## Evidence on Hand

- A real catalogue of ~2,770 interiors items, most with a picture and a vendor link, plus ~2,060 construction materials.
- Real staff, projects, plots, units and clients in production.
- No testimonials or marketing content exist or are needed.

## Product Principles

1. **One toolbox, independent tools.** Breaking one tool must never take the others down.
2. **The grant is the boundary.** Who sees money is decided in the database, not the UI.
3. **Simple beats clever at this scale.**
4. **The founder judges the running app** — plain language, small steps, a browser checklist after every change.
5. **Self-evident over trained** — a flow must make sense to a site engineer on a phone the first time.

## Accessibility & Inclusion

The material requirement is device and situation: site-facing screens must be comfortable on a phone in the field — touch targets, few steps, forgiving forms. English-only is confirmed. No other standard has been set.
