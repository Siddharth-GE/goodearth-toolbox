# Masters — the rules

The shared reference data every tool reads: projects, plots, units, clients, vendors, stores, items (catalogue and materials), categories, brands, GST rates, construction stages, units of measure, works, item requests. Grant `/masters` for writes. **Masters is a shared surface, not a peer tool** — when it degrades, everything degrades, and that is expected.

## The rules everything rests on

- **Reads are open to every signed-in person; writes need `/masters`.** Read functions carry no grant check so any tool can call them; the Masters screens gate at their layout.
- **`vendor_payment_details` is the one gated read** (`0089`/`0090`) — vendors' bank details: SELECT needs `/masters`, `/purchase-orders` or `/bills`; widen that single policy's qual, never add a second.
- **`lib/masters/` uses two files per entity** — `<name>.ts` reads, `<name>-actions.ts` writes. **Required, not stylistic**: a mixed file broke the production build while `tsc` passed.
- **Item codes are safe to edit** — everything references `items.id`, never the code.
- **`plots` ↔ `units` is strictly 1:1** (`0029`), and `units` has a second FK to `plots`, so an embed through `units` names the key: `plots!units_plot_id_fkey`.
- **One list of units of measure** (`uoms`, `0082`) for every unit column in the toolbox: picked, never typed; a FK by name, so a rename cascades; history excused (`NOT VALID`). Nothing stops two units meaning the same thing (cft, cuft) — look before adding one.
- **Construction stages are picked, never typed** (`0053`); a rename cascades to indents.
- **Works and construction stages are two vocabularies on purpose.** Stages (Foundation … Handover) are what construction budgets picked from; works are the site team's list — `work_categories` (FD) → optional `work_groups` (FD.3) → `work_items` (FD.4), loaded by `scripts/import-works.ts` — and they are what indents, issues, estimates and drawings name. A category's groups and works share one numbering space across two tables, so the actions check clashes the database cannot. Works codes (`FD.15`) are a second sanctioned code style beside `items.code`; don't harmonise them.
- **Contractors are vendors** — `vendors.is_contractor` (`0073`) only filters the one counterparty list.
- **Materials are items** (`kind = 'material'`, `0086`): 2,057 imported by `scripts/import-material-master.ts`, their rate `indicative_price`. 74 came without a price (`TODO.md`).

## Cross-tool writes into Masters, declared elsewhere

- `projects_seed_schedule` (`0045`, Relay's): a new project seeds Relay's schedule.
- `units_seed_engagement` (`0050`, Client Relations'): a new unit gets its CRM record and nine-rung payment schedule. Client Relations also writes `clients` and two `units` columns through column-narrow definer functions.
- Selections proposes provisional catalogue items (`create_item_request`); **Item requests** is where they are approved or merged.

## Judgement calls worth revisiting

- **Status vocabularies were defaults, not the founder's** — `planning`/`active`/`completed` for projects, `available`/`reserved`/`sold` for plots and units. The Saarang sheet's "Blocked" plots became `reserved`; nobody has confirmed that reads right.
- **`items.code` follows Goodearth's convention**: a 4-letter prefix — the first three letters of the item plus the first of its type (`BENS001` bench/seating, `HANL…` hanging light) — and a 3-digit number. The prefix is finer than category, so a `code_prefix` on categories cannot reproduce it. `nextCode()` in `lib/masters/catalogue-sheet.ts` is the one implementation; any auto-numbering uses it.

## The catalogue

~2,770 interiors items (`kind = 'catalogue'`). **Thumbnails are ours** (300px WebP in the public `catalogue` bucket — the grid loads one per tile and a vendor deleting a product must not blank ours); the full picture is the vendor's link, or ours (`items/<id>-full.webp`) when it came pasted in the design team's sheet. An item with no picture gets a `lib/color-hash.ts` tile. The bucket has no policies: only scripts write it, under the service role.

### The design team's workbook (2026-09-26)

`scripts/import-catalogue-sheet.ts` brings the workbook in (sheet MAIN CATALOGUE); `scripts/fetch-catalogue-images.ts` finds photos from product links. On staging it left 2,660 of 2,772 items with a picture (897 before) — the rest are the Specta quartz surfaces (no picture or link in the sheet), installation charges, and 29 whose vendor page is gone.

- **The sheet's code is not an identity.** It is a formula that renumbers every row below an insert — ~1,000 of its codes named a different product than the toolbox's same code. Rows match by content (`lib/masters/catalogue-sheet.ts`, tested): same link, description and brand; else same description and brand; else same link, brand and price. Look-alikes pair by price, then order.
- **Anything that differs is a new item** — the founder's rule: "if there are small variations in some data they are probably not a duplicate". A wrong merge puts one product's picture on another; a wrong "new" is one row to switch off. The dry run lists close calls under "worth a glance".
- **A row repeating an earlier row's product is skipped** — identical in every field, or the same page, brand and price.
- **Nothing existing is overwritten** — no picture, link, name, description, price, code or category. The sheet is the design team's working copy; prices are Masters' to edit.
- **Photos from links**: Shopify's `/products/<handle>.js` names the main photo, else the page's `og:image`; collection pages are skipped; a 429 is waited out. Pictures pasted in a sheet are small (Excel shrinks them) — fine on a tile, soft when opened.
- The 40 older Specta quartz items carry unit `each` though they are priced per square foot; the 15 new ones are `sqft`. A Masters decision, not changed.
