# Masters — the rules

**Shipped 2026-07-31.** Migrations `0004`, `0005`; hardened in `0031`; construction stages added in `0053`; the works vocabulary in `0073`.

The shared reference data every other tool reads: projects, plots, units, clients, vendors, stores, items, categories, brands, GST rates, construction stages, works, item requests. **Masters is a shared surface, not a peer tool** — when it degrades, everything degrades, and that is expected.

_Trimmed 2026-08-14: the build checklist lives in git._

## The rules everything rests on

- **Reads are open to every authenticated user; writes need `/masters`.** Read functions carry no `requireApp` gate precisely so any future tool can call them.
- **`lib/masters/` uses two files per entity** — `<name>.ts` reads, `<name>-actions.ts` writes. **This split is required, not stylistic**: a mixed single file broke the production build even though `tsc` passed clean. It is why Masters departs from the `queries.ts`/`actions.ts` convention every other tool follows.
- **Editing an item code is always safe** — every downstream table references `items.id`, never the code.
- **`plots` ↔ `units` is strictly 1:1** since `0029`, which also gave `units` a **second foreign key to `plots`**. Any embed reaching `plots` through `units` must name the key: `plots!units_plot_id_fkey`. A bare embed is HTTP 300 at runtime and compiles fine.
- **Construction stages are picked, never typed** (`0053`), and a rename cascades to indents.
- **Works (`0073`) and construction stages are two vocabularies on purpose.** Stages (Foundation, Plinth, … Handover) are what indents and construction budgets pick from; works are the site team's estimation list for the coming Estimator tool — three levels, `work_categories` (FD — Foundation) → optional `work_groups` (FD.3 — Dry rubble footing) → `work_items` (FD.4 — Excavation for rubble foundation), loaded from their workbook by `scripts/import-works.ts`. Nothing maps between the two lists, and nothing should until the Estimator gives a reason.
- **A category's groups and works share one numbering space** (FD.3 is a group, FD.4 a work) across two tables, so the DB's per-table UNIQUEs can't see a cross-table clash — the actions and the import script check it instead. The workbook numbered F.20 twice ("Joinery shutter works" and the "External Finishes" header); decided 2026-08-19: the item kept F.20, the header became F.21, and everything after shifted up one. The app's list is the numbering now.
- **Works codes (`FD.15`) are a second sanctioned code style**, the site team's own, alongside `items.code`'s `BENS001` convention below. They are different systems for different things — don't harmonise them.
- **Contractors are vendors** (`0025`'s one-counterparty-list rule, unchanged). `vendors.is_contractor` (`0073`) only lets a screen filter the one list; `scripts/import-contractors.ts` loaded the site team's ~85 names and prints likely-duplicate spellings for review rather than ever merging.

## Cross-tool coupling declared elsewhere

Two triggers fire on Masters writes but are declared by the tools that own the data, so the coupling points the right way:

- **`projects_seed_schedule`** (`0045`, declared by Relay) — creating a project writes Relay's `project_stages` and `pusher_project_plans`. `security definer`, because the creator holds `/masters`, not `/relay`.
- **`units_seed_engagement`** (`0050`, declared by Client Relations) — a unit created here gets its CRM record and nine-rung payment schedule.

Client Relations also writes `clients` (extra INSERT/UPDATE policies — permissive policies OR together, so Masters keeps what it had) and `units.client_id`/`units.status` through two column-narrow `security definer` functions, because an UPDATE policy cannot be narrowed to two columns.

## Judgement calls worth revisiting

- **Status vocabularies were my defaults, not the founder's** — `planning`/`active`/`completed` for projects, `available`/`reserved`/`sold` for plots and units. Extending is additive. The Saarang sheet's "Blocked" plots were mapped to `reserved` because there is no blocked status; nobody has confirmed that reads right.
- **`items.code` is optional and hand-typed.** Nothing generates it. Goodearth's real codes are a **4-letter sub-type prefix + 3-digit sequence** (`BENS001` bench, `SOFS…` sofa, `HANL…` hanging light) — which is **finer than category**: the single "Seating" category spans `BENS`/`CHAS`/`ARMS`/`SOFS`. So a `code_prefix` column on `item_categories` would NOT reproduce it. Auto-numbering, whenever it is built, needs its own sub-type lookup and must follow this convention rather than invent a competing `GE-SOF-001` style.
- **`spaces`/`space_types` ship with schema and RLS only**, no screen — Selections consumes them.

## The catalogue

2,631 real items, imported by `scripts/import-catalogue.ts` (dry run by default, re-runnable, skips codes already present). It was pulled forward ahead of Selections deliberately: building the picker against real items beats designing it around five samples and discovering the truth later.

At first only ~900 items carried an image URL, all on other companies' Shopify CDNs. **Thumbnails are copied into Supabase Storage** (~14 MB, ours, can't rot); full images stay pointing at the source (~360 MB not worth storing for a rarely-opened detail view). Items with no image get a `lib/color-hash.ts` placeholder tile rather than a broken-image icon.

### The design team's workbook (2026-09-26)

The founder asked for a picture on every item a designer picks from, the product links visible, and the sheet's missing items added — "dont make duplicates, if there are small variations in some data they are probably not a duplicate". `scripts/import-catalogue-sheet.ts` reads the workbook (sheet MAIN CATALOGUE) and `scripts/fetch-catalogue-images.ts` fills in from the links. On staging: 450 pictures from the sheet, 140 new items, and a vendor photo for 1,304 items that had only a link — **2,660 of 2,772 catalogue items now have a picture** (897 before). The rest: the 55 Specta quartz surfaces (no picture or link in the sheet), 6 installation charges, and 29 whose link is dead (the vendor removed the product) or opens a collection page. The settled trade-offs:

- **The sheet's code is not an identity.** It is a formula — `UPPER(LEFT(item,3)&LEFT(type,1))` plus a running COUNTIFS — so inserting a row renumbers every row below it; about 1,000 of 2,759 codes named a different product than the toolbox's same code. Rows match by content (`lib/masters/catalogue-sheet.ts`, tested): the same link, description and brand; else the same description and brand; else the same link, brand and price. Look-alikes pair by price, then order. New items get the next free number on the sheet's own prefix.
- **Anything that differs is a new item**, by the founder's rule — a "3" added to a sofa's description, the same lamp at another price. A wrong merge would put one product's picture on another; a wrong "new" is one row to switch off. The dry run lists the close calls under "worth a glance".
- **A row repeating an earlier row's product is skipped**: identical in every field, or the same product page, brand and price (a block of 26 consoles was pasted twice, six with corrected descriptions).
- **Nothing existing is overwritten** — no picture, link, name, description, price, code or category. The sheet is the design team's working copy; prices are Masters' to edit.
- **Pictures pasted in the sheet are stored whole** (`items/<id>-full.webp`, ≤1200px) as well as thumbnailed, because no vendor page holds them. Excel shrinks pasted pictures, so many are only ~170–300px wide: fine on a tile, soft when opened.
- **Photos from links**: Shopify's `/products/<handle>.js` (~6 KB) names the main photo; otherwise the page's `og:image`; collection pages are skipped (their picture is a banner). A 429 is waited out and retried. A 404 is a product the vendor removed — the item keeps its coloured tile.
- The workbook is not in the repo (real prices); pass its path. Both scripts are re-runnable and write nothing the second time.
- The 40 older Specta quartz items carry unit `each` though the sheet prices them per square foot; the 15 new ones are `sqft`. Not changed — a Masters decision.

## Shared pickers: build the third use, not the first

`components/masters/` originally shipped four pickers. **Only `project-picker` survives.** The other three still had zero importers a phase later — Selections built its own catalogue picker instead — and the planned "upgrade to a real searchable combobox" never happened because nothing needed it. The same reasoning is in `DESIGN.md`.
