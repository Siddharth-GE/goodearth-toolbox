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
| Last worked | 2026-07-31 |
| Branch | everything merged and pushed to `master`, live on Vercel |
| Migrations applied | `0001`–`0005` (next new one is `0006`) |
| Items in database | **2,633** (2,631 imported catalogue + 2 material seeds) |
| Categories / brands | 14 / 21 |
| Built tools | Marathon, Settings, Masters |

---

## Phase status

| # | Phase | Status |
|---|---|---|
| 0 | Platform hardening — `user_apps` grants, `requireApp()`, generated Supabase types, migration rules | ✅ Done |
| 1 | **Masters** — projects, plots, units, clients, vendors, stores, items, categories, brands, space types | ✅ Shipped, Gate 1 approved |
| 3 | **Catalogue import** — the real 2,631-item catalogue | ✅ Done — **pulled forward, out of order** (see below) |
| 2 | **Selections** — per-unit design workspace + the catalogue picker | ⬜ **NEXT** |
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

## Next up

### 1. Thumbnail pass — do this *before* the picker

**Why first:** the picker's whole feel depends on how fast tiles load.
Building it against real thumbnails beats retrofitting them.

**The situation:** only **900 of 2,633 items have an image**, and every
one points at *another company's* Shopify CDN (`homeworkliving.in` and
similar). If a vendor deletes a product, our catalogue goes blank.

**Decided architecture** (do not re-litigate):

- **Thumbnails → copied into Supabase Storage.** ~900 × ~15 KB ≈ 14 MB.
  Ours, small, can't rot. This is the only thing the grid ever loads.
- **Full images → keep pointing at the source URL.** ~360 MB isn't worth
  storing for a detail view almost nobody opens. If one rots we lose a
  zoom on one item, not the grid.
- **The 1,731 items with no image** get a generated placeholder tile
  using `lib/color-hash.ts` (already used for avatars and Marathon
  badges) — the item's code on a stable colour. Zero bytes, zero
  requests, and reads as deliberate rather than broken.
- **Never bundle image fetching into a data import.** ~900 fetches off
  other people's servers *will* produce timeouts and 404s; that must
  never be able to wreck a clean data load.

**The work:** `scripts/fetch-catalogue-images.ts` — walk the 900 rows
with an `image_url`, download, resize to ~300px WebP, upload to Supabase
Storage, write the public URL back to `items.thumb_url`. Skip any row
that already has a `thumb_url` so it's re-runnable after failures. Dry
run by default, same as the import script.

**Prerequisites:** a public Supabase Storage bucket (created in Studio —
a manual step, like migrations). `sharp` is already in `node_modules`
via Next, so no new dependency. `next.config.ts` needs `remotePatterns`
before any remote image renders — it's currently empty.

### 2. Phase 2 — Selections (branch `feature/selections`)

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
  search on name + code), ~30 per page.
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
- **Images:** see the thumbnail section above.

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

Notes for next time:

- The source CSVs live in `data/`, which is **git-ignored** — business
  data belongs in the database, not git history. Say if you'd rather
  have them versioned so the import is reproducible.
- Two decisions got made this session that changed earlier assumptions:
  the item-code convention (above) and the image architecture (above).
  Both are recorded so they don't get re-opened.
