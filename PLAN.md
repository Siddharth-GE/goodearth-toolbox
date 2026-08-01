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

**Phase 1 (Masters) and Phase 3 (Catalogue import) are done. Phase 2
(Selections) is next and has not been started.**

| | |
|---|---|
| Last worked | 2026-08-01 |
| Branch | `feature/selections` — Phase 2 built, awaiting the browser gate before merging |
| Migrations applied | `0001`–`0008` (next new one is `0009`) |
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
| 2 | **Selections** — per-unit design workspace + the catalogue picker | 🟡 **Built on `feature/selections`, awaiting the gate** |
| 4 | Budgets — cost + margin → client rate, approval flow | ⬜ Not started |
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
before Budgets exists so both sides are built against the same contract —
`lib/selections/queries.ts`'s `getBudgetHandoff()` is that contract in
code, and Budgets calls it rather than re-querying these tables.

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

## Session log

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
