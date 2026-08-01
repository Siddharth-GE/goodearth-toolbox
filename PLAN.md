# Goodearth Toolbox — build plan & session log

The living roadmap for rebuilding Goodearth's whole operational system
here, replacing the AppSheet suite. Source of truth for **where we are**
and **what's next**.

> **How this file works.** It gets updated at the end of every working
> session: tick off what shipped, correct the plan where reality
> disagreed with it, and leave the "Next up" section detailed enough
> that a cold start needs no explanation. Per-tool detail lives in
> `app/(dashboard)/<tool>/PLAN.md`; this file is the level above.

---

## Where we are right now

**Masters, the catalogue, Selections and design views are shipped.
Budgets is built and awaiting the browser gate on `feature/budgets`.**

| | |
|---|---|
| Last worked | 2026-08-01 |
| Branch | `feature/budgets` — built, pushed, **not yet merged** (needs testing in the browser) |
| Migrations applied | `0001`–`0012` (next new one is `0013`) |
| Items in database | **2,633** (2,631 imported catalogue + 2 material seeds) |
| Categories / brands | 14 / 21 |
| Thumbnails | **897** in Supabase Storage; 3 dead vendor links, 1,733 items have no image |
| Built tools | Marathon, Settings, Masters |

---

## Phase status

| # | Phase | Status |
|---|---|---|
| 0 | Platform hardening — `user_apps` grants, `requireApp()`, generated Supabase types, migration rules | ✅ Done |
| 1 | **Masters** — projects, plots, units, clients, vendors, stores, items, categories, brands, space types | ✅ Shipped, Gate 1 approved |
| 3 | **Catalogue import** — the real 2,631-item catalogue | ✅ Done — **pulled forward, out of order** (see below) |
| 3b | **Thumbnail pass** — catalogue images into Supabase Storage | ✅ Done |
| 2 | **Selections** — per-unit design workspace + the catalogue picker | ✅ Shipped, merged 2026-08-01 |
| 2b | **Design views** — renders per space, in the design document | ✅ Shipped, merged 2026-08-01 |
| 4 | **Budgets** — cost + margin → client rate, approval, two documents | 🔨 **Built (B1–B4), awaiting browser gate** |
| 5 | Indents — pull-from-budget *and* direct site request | ⬜ Not started |
| 6 | Purchase Orders — vendor grouping + letterhead PDF | ⬜ Not started |
| 7 | Inventory / Store — goods receipt, stock on hand, issues | ⬜ Not started |
| 8 | Bills — against POs and labour contracts | ⬜ Not started |
| 9 | Overview wired to real data + one real project end-to-end | ⬜ Not started |

**Why 3 came before 2:** the original plan built the catalogue picker on
5 sample items and imported the real catalogue afterwards. We flipped
it, so the picker gets designed against 2,631 real items from day one
rather than looking good on samples and falling over later. Same work,
better order.

---

## Images — settled, nothing left to do

`scripts/fetch-catalogue-images.ts` has run. **897 thumbnails** are in
the public `catalogue` Supabase Storage bucket at
`items/<item id>.webp`, with `items.thumb_url` pointing at each.
Roughly 5 KB apiece (a 218 KB, 1920px vendor JPEG becomes a 4.8 KB,
300px WebP — a 45× saving), so the whole set is about 4.5 MB.

What the picker needs to know:

- **Grid tiles load `thumb_url` only.** Never `image_url` — 30 full
  vendor images per page is ~15 MB against ~150 KB of thumbs.
- **`image_url` stays a link to the vendor's CDN**, for a detail/zoom
  view only. Not stored, because ~360 MB isn't worth it for something
  opened rarely.
- **1,736 items need a placeholder** — 1,733 that never had an image,
  plus 3 whose vendor URLs are now dead (`HANL095`, `HANL114`,
  `WALL337`, all 404). Use `lib/color-hash.ts` (already used for avatars
  and Marathon badges): the item's code on a stable colour. Zero bytes,
  zero requests, and reads as deliberate rather than broken. **This is
  the majority case — design the tile for it first, not as a fallback.**
- **`next.config.ts` already allows the Supabase Storage host** in
  `images.remotePatterns`. If a detail view later renders the full
  vendor image, `cdn.shopify.com` has to be added there too — it isn't
  yet, deliberately, since nothing renders it.
- The script is re-runnable and skips anything already done, so it's
  safe to run again whenever new catalogue rows arrive.

## The Selections → Budgets handoff (settled)

What the budget team receives when a designer presses **Issue**. Agreed
before Budgets existed so both sides were built against the same contract.

> **Corrected 2026-08-01, when Budgets was actually built.** This section
> used to say Budgets calls `getBudgetHandoff()` in
> `lib/selections/queries.ts`. It can't: every function in that module
> opens with `requireApp(user, "/selections")`, so a budget-team member
> without the design grant would be redirected off their own screen.
> Budgets reads the selection tables **directly, under `/budgets`** —
> the same rule that lets any tool read `lib/masters/*` without holding
> `/masters`. The contract below is still exactly right; only who
> assembles it changed.

- **The revision** — unit, project, R-number, who issued it and when,
  plus the designer's note saying *why* this revision exists. That note
  is the first thing the budget team reads.
- **Every line, grouped by space** — item, code, brand, quantity, unit,
  and `indicative_rate_snapshot`: the figure the item carried the day it
  was picked. Not an opinion about cost; it exists so an issued revision
  doesn't silently re-price when a master price is edited later.
- **What changed** — for R1 onward: added / removed / quantity-changed
  against the previous issued revision.

**That last part is the point of `line_key`.** `create_next_revision()`
copies each line forward carrying its key, so Budgets keys pricing to the
key rather than the row id. An unchanged sofa keeps the price it was
already given; only new or changed lines enter the budget queue. Copy
with fresh keys instead and issuing R1 quietly asks the team to re-price
all 200 lines — which is how people abandon a tool.

**Never crosses the boundary:** cost, margin, client rate. Those are
Budgets' alone (`lib/budgets/queries.ts` when it exists), and they never
appear in Selections or on a client-facing document.

## Next up

### Phase 2 — Selections (branch `feature/selections`)

The first phase that's a genuinely new tool. **Deserves its own plan
before any code** — migration, new route, new sidebar entry, and the
flagship UI of the whole system.

**Context a cold start needs:**

- **Selections has no Coming Soon stub**, unlike every other planned
  tool. It needs a brand-new `lib/tools.ts` entry plus a route — follow
  the "Adding a new tool" checklist in `CLAUDE.md`.
- **Migration `0006`** adds `designs` and `selection_lines` (shape in the
  founder's build-plan PDF §2.2). Apply in Studio **first**, then merge
  code — never the other way round.
- **`spaces` and `space_types` already exist** from migration `0004`
  with RLS and 11 seeded space types (Living, Dining, Kitchen, …), but
  have **no screen and no rows**. Selections is their first real
  consumer — a unit's spaces are the sections of the design workspace.
- **The catalogue picker is the flagship.** Real numbers to design
  against: 2,633 items, but **1,400 are lighting** and 466 are hardware,
  so category browsing is badly lopsided and the filters carry the
  weight. Server-side filters (kind, category, placement, brand, text
  search on name + code), ~30 per page. **Only 897 items have a
  thumbnail** — two-thirds of tiles will be colour placeholders, so the
  picker has to look right as a mostly-text grid, not a photo wall.
- **Pagination is already solved** — `listItems()` in
  `lib/masters/items.ts` does ranged, counted, stably-ordered paging;
  reuse that pattern rather than reinventing it. Note the `id`
  tiebreaker: hundreds of items share a name, and without a unique
  second sort key rows repeat across pages.
- **Snapshot the rate at pick time** into `selection_lines.indicative_rate`.
  Later edits to the item master must never rewrite existing lines.
- **The cascade rule ships from day one** (PDF §2.7): removing a line
  sets `line_status = 'removed'`, never deletes. One server function,
  not scattered triggers.
- **Open decision to ask the founder:** can a design start on an unsold
  unit (`client_id` null)?

---

## Decisions locked in

- **One `items` table** for catalogue products and raw materials, split
  by `kind`.
- **Prices are snapshotted** onto lines at pick time; master price edits
  never rewrite existing lines.
- **Lines are never deleted**, only marked removed; removal cascades
  flags downstream and never alters an issued PO or a goods receipt.
- **Margin is Budgets-only** — `margin_pct` and `client_rate` may be
  selected only by `lib/budgets/queries.ts`. POs never show them.
- **Access = per-user app grants.** `requireApp()` first in every action
  and query; sidebar visibility is cosmetic only.
- **Item codes:** Goodearth's real convention is a 4-letter *sub-type*
  prefix + 3-digit sequence (`BENS001`, `SOFS…`, `HANL…`) — finer than
  category, since one "Seating" category spans BENS/CHAS/ARMS/SOFS.
  Nothing auto-generates codes today; whenever that's built it must
  follow this convention and cannot key off `item_categories`.
- **Images:** thumbnails are ours (Supabase Storage), full images stay
  borrowed links, image-less items get a colour placeholder. Image
  fetching is never bundled into a data import — ~900 fetches against
  other people's servers produce timeouts and 404s, and that must not be
  able to damage a clean data load. See the images section above.

## Open decisions — ask at the phase that needs them

| Phase | Question |
|---|---|
| 2 | Can a design start on an unsold unit (`client_id` null)? |
| 4 | Default margin prefill — global, per category, or none? |
| 6 | PO / indent numbering format; letterhead assets (logo, address, terms) |
| 8 | Does bill approval need a different person than the recorder? |

Also still unconfirmed from Phase 1: the `status` value lists for
projects (`planning`/`active`/`completed`) and plots/units
(`available`/`reserved`/`sold`) were chosen as sensible defaults, not
specified by the founder. Easy to extend — say if they don't match how
Goodearth actually talks about status.

---

## The three documents

The system's real output. Agreed 2026-08-01, and the reason Budgets is
shaped the way it is.

| | Produced by | Contains | Audience |
|---|---|---|---|
| **A · Design document** | Selections | Spaces view by view — uploaded renders — with the items specified in each. No prices. | Client, for design sign-off |
| **B · Budget sheet** | Budgets | Every element with quantity, **cost, margin** and client rate | Internal only |
| **C · Client quote** | Budgets | Views, items, quantity, **client rate and amount**, totals | Client |

**B and C are the same data, filtered.** Cost and margin appear on B and
must never appear on C. That's why margin lives in a Budgets-owned table
with its own RLS rather than on `items` — a mistake in the C template
can't reach for a number it was never handed.

**All three are now built.** The separation between B and C ended up
stronger than "hide two columns": C renders from `QuoteData`
(`lib/budgets/quote.ts`), a type that has **no cost or margin field at
all**. A template can't print what its props don't contain, so the
failure mode is a compile error rather than a leaked margin.

## Session log

### 2026-08-01 (later still) — Budgets built (Phase 4, B1–B3)

Migration `0011`: `item_margins`, `budgets`, `budget_lines`. Then the
inbox, the pricing screen, per-product margins, approval, both documents,
and carry-forward — B1 through B4, the whole tool.

**Carry-forward finally cashes in `line_key`.** Starting a budget for R+1
copies the previous revision's pricing across, matched on the key rather
than the row id. An unchanged line arrives priced, keeping the budget
team's own adjusted quantity; a line the designer resized takes the
designer's new quantity, keeps its unit cost and is flagged for review;
a new line arrives with only its default margin. Rules live in
`lib/budgets/carry-forward.ts` — pure, and the most heavily tested code
in the repo, including the 200-lines-two-touched case.

**Reads are gated too, for the first time.** Every other table in the
schema is readable by any authenticated staff member. These three require
`/budgets` to *select*, not just to write — so a careless join from a
future Indents or PO screen returns zero rows instead of leaking markup.

**`client_rate` is a generated column**, computed by Postgres from cost
and margin. The internal sheet and the client quote therefore cannot
disagree; `lib/budgets/math.ts` reimplements the same formula only so the
screen can show the figure live before saving.

**The repo has tests now** — `npm test`, `node:test` via `tsx`, no new
framework, covering `lib/budgets/math.ts` only. The cases that matter:
an unpriced line never reads as free, a 0% margin charges exactly cost,
and totals sum unrounded values so a column adds up to its own total.

**Approval is reversible.** An approved budget locks its lines (trigger),
but can be re-opened — a cost estimate is fallible in a way a design
specification is not, and the alternative was a whole new revision to fix
one wrong rate. Every re-opening is in the audit log.

**Two numbering systems, and they mean different things** (migration
`0012`). The **R-number** comes from the design and says what was
specified. The **version** belongs to the budget and says which pricing of
it — documents are stamped `R2-v1`, and re-opening starts v2. Added
because reversible approval made references ambiguous: approve, send the
quote, re-open, fix a rate, approve again, and both quotations said
`QT/PLOT6/R2`. The version increments on **re-open**, not on approval, so
the number on screen while pricing is the number that reaches the
document. It can only go up, enforced by the guard trigger.

Two smaller things worth keeping:

- **`item_margins` needed a surrogate `id`.** The shared `audit_row()`
  trigger records `new.id`; a table keyed only on `item_id` would have
  raised at runtime on the first save. Any new audited table needs an
  `id` column.
- **Helvetica has no ₹ glyph.** react-pdf would print a blank box on
  every amount, so `formatAmount()` in `lib/pdf/theme.ts` emits Indian-
  grouped digits with no symbol, and documents state the currency once.
  Don't reuse the app's `formatMoney()` in a PDF.

### 2026-08-01 (later) — Design views (Phase 2b)

Designers upload renders and elevations per space; they appear in the
editor and at the top of each space's sheet in the design document.
Migrations `0009`–`0010`.

One spec in `lib/pdf/theme.ts` (`designView`) drives upload, editor
preview and PDF: **16:9, 1600×900, JPEG, letterboxed not cropped**. Change
it there and all three follow. JPEG specifically because
`@react-pdf/renderer` embeds PNG and JPEG only — the catalogue thumbnails
are WebP because they never leave the browser.

The bucket is **private**, unlike the public `catalogue` one, with its own
storage policies.

Three things worth remembering, all learned by getting them wrong:

- **Server Actions cap the request body at 1MB.** A real render never
  reached the action; it failed inside the framework as an opaque server
  error. The browser now normalises to ~300KB before sending, and the
  server re-normalises since an action is a public endpoint.
- **Supabase Storage has its own RLS**, in `storage.objects`, separate
  from the table. A private bucket starts with *no* policies — rows exist
  and every image 404s.
- **Verifying with the service-role key proves nothing about a signed-in
  user.** The upload probe passed while the feature was broken for
  everyone, because service role bypasses exactly the rules that were
  missing.

### 2026-08-01 — Selections built (Phase 2)

Branch `feature/selections`, migrations `0006`–`0008` applied. Everything
in the founder's Selections spec is built except paste-from-Excel.

- **Spaces** set up several at a time, with names suggested per type
  (`Bedroom 1`, `Bedroom 2`) and editable before committing.
- **The picker** over all 2,633 items — search on name, code *and* brand,
  filters for category, brand and placement, tiles designed around the
  fact that two-thirds have no photo. The basket is local, so clicking
  costs nothing and one action writes the lot; spaces are chosen as chips
  so four identical bathrooms fill in one pass. An item already in a
  space has its quantity raised rather than being duplicated.
- **Revisions** — issue (irreversible, guarded in the database), branch
  R+1 carrying `line_key`, and a line-by-line diff.
- **Item requests** — a designer creates a missing item from inside the
  picker and keeps working; Masters resolves it later, with a catalogue
  search seeded on the requested name so duplicates surface first.
  Merging never repoints existing lines: the provisional item survives as
  an alias, because issued revisions are immutable.
- **PDF and CSV** — A4, one sheet per space, drafts watermarked, no rates
  anywhere.

Two things learned the hard way, both worth remembering:

- **Server Actions are the wrong tool for reads.** They dispatch one at a
  time per client, and a revalidating action re-renders the whole route —
  so the picker's search queued behind itself and re-ran four unrelated
  page queries per keystroke. Moved to a Route Handler, which the Next
  docs recommend for exactly this.
- **`useState(prop)` is a bug waiting to happen** in a component that
  survives navigation. The picker's target space was seeded that way and
  kept pointing at whichever space was open when the page first loaded,
  so items silently landed in the wrong room.

Still open: paste-from-Excel; the PDF's real letterhead (logo, address,
GST, terms) and a Geist `.ttf` to replace Helvetica; and the wider
admins-only RLS mismatch on the other master tables (see the note in
migration `0008`).

### 2026-07-31 — Masters shipped, catalogue loaded

Shipped, tested and pushed to `master`:

- **Masters (Phase 1) merged** — Gate 1 approved in the browser.
- **Item codes made usable** — the `code` column existed and was
  editable but was invisible: no column in the table, and search matched
  name only. Added the column and widened search to name-or-code.
- **Catalogue imported (Phase 3, pulled forward)** — 2,631 items, 12
  categories, 18 brands. Data arrived exceptionally clean: no duplicate
  codes, no blanks, and all four constrained columns already using the
  exact values the database allows. `scripts/import-catalogue.ts` is
  dry-run by default and skips codes already present, so it's safe to
  re-run. Verified: 2,633 total, 10 random spot-checks matching on every
  field, and the 44-without-price / 900-with-image counts reconciling
  against the CSV exactly.
- **Migration `0005`** removed the 3 fictional catalogue seed items whose
  categories (`Sofas`/`Dining Tables`/`Lighting`) would have sat beside
  the real `Seating`/`Tables`/`Lighting & Electrical Fixtures`. The two
  material seeds were kept — they're realistic and the only material-side
  data so far.
- **Items list paginated** — with real data the page silently showed
  1,000 of 2,633 (Supabase caps un-ranged queries). Now 50 per page with
  an honest count, a Category filter, and Indian digit grouping on
  prices. Verified by walking all 53 pages: 2,633 distinct rows, zero
  duplicates.

- **Thumbnail pass run** — 897 of 900 uploaded to the `catalogue`
  storage bucket. The 3 that failed (`HANL095`, `HANL114`, `WALL337`)
  return 404 from the vendor's CDN; the source images are simply gone,
  so they fall back to the colour placeholder like any other image-less
  item. This is exactly the link-rot the "store our own thumbnails"
  decision was made to guard against — it showed up on day one.
- **`next.config.ts`** now allows the Supabase Storage host for
  `next/image`, derived from the env var so preview and production each
  resolve to their own project.

Notes for next time:

- The source CSVs live in `data/`, which is **git-ignored** — business
  data belongs in the database, not git history. Say if you'd rather
  have them versioned so the import is reproducible.
- Two decisions got made this session that changed earlier assumptions:
  the item-code convention (above) and the image architecture (above).
  Both are recorded so they don't get re-opened.
