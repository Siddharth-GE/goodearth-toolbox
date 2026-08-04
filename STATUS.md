# Goodearth Toolbox — status & session log

Where we are: what's shipped, settled decisions, the session log.
Updated at the end of every session; finished work moves here from
`TODO.md`. Per-tool detail lives in each tool's `PLAN.md`; durable
rules in `CLAUDE.md`; full history in git. Stays lean by design.

## Now

**Phases 1–7 shipped** (Masters → Selections → Budgets → Indents →
Purchase Orders → Inventory), the last three all merged 2026-08-03.
The chain runs design → price → indent → PO → goods in / stock / goods
out. **Next: Phase 8 — Bills** (plan in `TODO.md`), then Phase 9:
Overview fully real + one real project run end-to-end.

|                    |                                                                                                                  |
| ------------------ | ---------------------------------------------------------------------------------------------------------------- |
| Last worked        | 2026-08-04                                                                                                       |
| Branch             | `master` — clean                                                                                                 |
| Migrations applied | `0001`–`0024` (next is `0025`)                                                                                   |
| Items in database  | 2,633 (2,631 imported catalogue + 2 material seeds); 14 categories / 21 brands                                   |
| Thumbnails         | 897 in Supabase Storage; 1,736 items use the colour placeholder                                                  |
| Built tools        | Marathon, Settings, Masters, Selections, Budgets (Interiors + Construction), Indents, Purchase Orders, Inventory |
| Tests              | `npm test` — 74, all pure logic                                                                                  |

## Next up

- **Load the founder's master data** — clients, plots, units, from
  spreadsheets, the `scripts/import-catalogue.ts` way (re-runnable,
  dry-run default, skip existing, verify counts). Watch: plots/units
  need their project per row and `unique (project_id, name)` holds;
  the project/plot **status value lists are my defaults, never
  confirmed** — ask first. Source files go in `data/` (git-ignored).
- **Grant `/inventory`** in Settings to store-keepers (and site
  engineers if wanted — its reads carry no money).
- **Letterhead assets** — logo, address, GST number, PO terms → swap
  into `lib/pdf/document.tsx`'s `Letterhead` (one place); a Geist
  `.ttf` registered there lifts every PDF at once.
- Smaller, any session: migrate Selections onto the shared
  `catalogue-picker`; Selections paste-from-Excel; the admins-only RLS
  mismatch noted in migration `0008`; database clean-up once rolling
  (test indents `IND/SAA/001`–`005`, the inert probe account — both
  need SQL in Studio, the app refuses by design).

## Decisions locked in

- One `items` table for products and materials, split by `kind`.
- Prices are **snapshotted onto lines at pick time**; master edits
  never rewrite existing lines. Same principle for PO `gst_pct`.
- An issued selection revision is **immutable** (trigger, `0006`); no
  soft deletes anywhere — history is revisions + the audit log.
- `line_key` is a line's cross-revision identity; Budgets prices
  against it; downstream anchors use `(budget_id, line_key)`.
- Margin is `/budgets`-only, PO money `/purchase-orders`-only; the only
  sanctioned windows are the `approved_*` and `po_*facts` views (see
  CLAUDE.md — column lists are the boundary).
- Indents carry no money; numbered `IND/<project code>/NNN`, minted in
  the database, gaps accepted; **approved is terminal** — no delete.
- Construction plans are materials + quantities only — free-form
  stages, no approval, one living plan per unit, QS-owned.
- Approvers (indents, and bills to come) are named lists managed in
  Settings, enforced by DB guards — **triggers are the boundary,
  buttons are a courtesy**.
- POs come from approved indents only; one vendor + one plot/unit
  ("GEN" for general); `PO/<project>/<scope>/NNN` minted per scope.
  Over-ordering is impossible at the database (unique + advisory-lock
  guard); a PO line's uom is locked to its indent line's.
- Deleting an issued PO is request → admin approves, trigger-enforced.
- Attribution everywhere: `components/ui/attribution.tsx` + stamp
  `updated_by`.
- Item codes are 4-letter sub-type + 3 digits (`BENS001`); nothing
  auto-generates today — any future generator follows this, not
  categories.
- Images: grid tiles load `thumb_url` only (ours, in Storage);
  `image_url` stays a borrowed vendor link (no `remotePatterns` entry
  yet, deliberate); 1,736 image-less items use the `color-hash`
  placeholder — the majority case, designed for. Image fetching is
  never bundled into a data import.
- The three documents: **A** design document (Selections, no prices,
  client) · **B** budget sheet (cost + margin, internal) · **C** client
  quote (client rates only). C renders from `QuoteData`
  (`lib/budgets/quote.ts`), which has **no cost/margin fields** — a
  template mistake is a compile error, not a leaked margin.

## Open decisions — ask at the phase that needs them

- Phase 8: must a bill's approver differ from its recorder?
- Phase 2 (dormant): can a design start on an unsold unit?
- From Phase 1: the project/plot/unit status value lists (defaults,
  unconfirmed — see master-data load above).

## Deferred, with the trigger for revisiting

- `audit_log` retention — revisit past a few million rows.
- Actions trust their inputs' relationships (DB constraints are the
  boundary; ~200 trusted staff) — revisit only if outsiders arrive.
- Actor FKs are `NO ACTION` so past actors can't be deleted from auth —
  flip to `on delete set null` when offboarding first needs it.
- `space_views` storage orphans (deleted spaces leave JPEGs) — someday.
- Two accepted races: `moveSpaceView` sort swap (self-heals) and
  Marathon PIN lockout (fix rides the next Marathon migration).
- `lib/selections/views.ts` stays put until a third consumer appears.
- Full CI browser smoke **costed and declined** (2026-08-03);
  `check:actions` covers the known outage class — revisit only if a
  different runtime action failure reaches production.

## Environment & working notes

- Production: `goodearth-toolbox.vercel.app`. Post-deploy and pre-merge
  verification habits are in CLAUDE.md (probe-user smoke, the
  write-button press).
- Pre-push smoke: Playwright installed in the session scratchpad,
  `npm run build && npm start`, drive localhost as the probe user
  (reset its password via the auth admin API; never stored).
- `sharp` can't load its win32 binary locally — Selections' upload
  action fails **locally only**; Vercel is fine. Not an app bug.
- `npm test`'s glob is shell-dependent — check that before assuming
  green. Git Bash rewrites `/budgets`-style args into Windows paths —
  use PowerShell for REST calls with app slugs.
- Lessons that stuck: Server Actions are wrong for reads (catalogue
  search is a Route Handler) and cap bodies at 1 MB; Storage has its
  own RLS and service-role checks prove nothing about real users;
  Postgres view columns come back nullable from the type generator —
  normalise at the read boundary; on Windows kill servers by port, not
  `pkill`; audited tables need a surrogate `id`; PDFs print digits-only
  (`formatAmount` — Helvetica has no ₹).

## Session log

One line per day; full detail in git history and the PLAN.md files.

- **2026-08-04** — docs slimmed: CLAUDE.md, this file, TODO.md cut to
  essentials.
- **2026-08-03** — three phases in one day. **Indents** (5 gates) — and
  the production outage found, hotfixed and permanently guarded
  (`check:actions`); margin secrecy proved as a real single-grant user.
  **Purchase Orders** (`0020`–`0022`). **Inventory** (`0023`, then
  `0024` when the founder wanted plots on Stock) — the store-keeper
  smoke caught the catalogue-allowlist 403. `PLAN.md` → `STATUS.md` +
  `TODO.md` split.
- **2026-08-01** — Selections, design views, Budgets shipped; the
  five-stage audit merged (escalation closed, 1,000-row bug killed,
  shared primitives extracted); CI + Prettier added.
- **2026-07-31** — Masters shipped; the real 2,631-item catalogue
  imported and thumbnailed (3 vendor URLs already dead — the link-rot
  that justified our own thumbnails).
