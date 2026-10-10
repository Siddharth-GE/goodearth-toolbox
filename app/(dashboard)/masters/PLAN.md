# Masters — the rules

The shared reference data every tool reads: companies, projects, plots, units, clients, vendors, stores, items (catalogue and materials), categories, brands, GST rates, construction stages, units of measure, works, terms templates, item requests. Grant `/masters` for writes. **Masters is a shared surface, not a peer tool** — when it degrades, everything degrades, and that is expected.

## The rules everything rests on

- **Reads are open to every signed-in person; writes need `/masters`.** Read functions carry no grant check so any tool can call them; the Masters screens gate at their layout.
- **`vendor_payment_details` is the one gated read** (`0089`/`0090`) — vendors' bank details: SELECT needs `/masters`, `/purchase-orders` or `/bills`; widen that single policy's qual, never add a second.
- **`lib/masters/` uses two files per entity** — `<name>.ts` reads, `<name>-actions.ts` writes. **Required, not stylistic**: a mixed file broke the production build while `tsc` passed.
- **Item codes are safe to edit** — everything references `items.id`, never the code.
- **`plots` ↔ `units` is strictly 1:1** (`0029`), and `units` has a second FK to `plots`, so an embed through `units` names the key: `plots!units_plot_id_fkey`.
- **One list of units of measure** (`uoms`, `0082`) for every unit column in the toolbox: picked, never typed; a FK by name, so a rename cascades; history excused (`NOT VALID`). Nothing stops two units meaning the same thing (cft, cuft) — look before adding one.
- **Construction stages are picked, never typed** (`0053`); a rename cascades to indents.
- **Works and construction stages are two vocabularies on purpose.** Stages are what indents and construction budgets pick from; works are the site team's list — `work_categories` (FD) → optional `work_groups` (FD.3) → `work_items` (FD.4) — and they are what indents, issues, estimates and drawings name. Since the final workbook the eight stages carry the work categories' names (Engineering Consultation … MEP), but they stay two tables. A category's groups and works share one numbering space across two tables, so the actions check clashes the database cannot. Works codes (`FD.15`) are a second sanctioned code style beside `items.code`; don't harmonise them.
- **Contractors are vendors** — `vendors.is_contractor` (`0073`) only filters the one counterparty list.
- **Materials are items** (`kind = 'material'`, `0086`), their rate `indicative_price` — per the item's own unit, before GST. **It rises by itself, never falls** (`0103`, founder 2026-10-08): issuing a PO at a higher net rate (after discount, before GST, in the item's own unit) raises it, and `item_price_changes` logs the old rate, the new one and the PO — readable by `/masters` or `/purchase-orders` only; the items list names the PO through `po_facts`. A person lowers it by hand. Official estimates stay frozen; working estimates follow. Staging has the workbook's 1,118; production still has the 2,057 of `scripts/import-material-master.ts`, 74 without a price.
- **Documents are printed under a company, and nobody picks it** (`0101`): a project belongs to one (`projects.company_id`), and every indent, PO, work order and bill takes its project's letterhead — and the company's `state` decides a PO's CGST + SGST or IGST. A project without one prints the placeholder letterhead and reckons GST against Kerala. **No seed**: Goodearth's real details are entered by a person, never invented (`PRODUCT.md`).
- **Terms templates** (`document_terms`, `0101`) are named texts per kind (`po`, `work_order`), one default each (partial unique index; a new default is saved with the flag down first, so a name clash fails before the old default is cleared). A new PO or work order copies the default's text, so editing a template never rewrites a document already made. Work order _line_ templates are Bills' own.
- **Companies and terms are switched off, never deleted** — no delete policy on either; documents already made keep naming them.

## The founder's final masters workbook (2026-10-07)

`scripts/import-masters-workbook.ts` loads Masters.xlsx: vendors and contractors, works with their labour rates (into the Estimator's rate book), material categories, materials and construction stages. Its cleaning rules are `lib/masters/masters-workbook.ts`, tested, with the founder's decisions in its header. On staging since 2026-10-07; production waits for ship day (`TODO.md`).

- **It is the final list.** What the workbook no longer names is deleted, so it runs after `scripts/wipe-staging-records.ts`; while any record still points at a master it drops, it stops before writing.
- **A blank cell keeps what the database has.** The sheet has no payment-terms column, so terms survive on every vendor it keeps.
- **Look-alike vendor names stay apart** (Santhosh K / K Santhosh, GeoBricks / Geo Bricks …) — the founder's call. Merging is a Masters job, once someone knows they are one party.
- **The "Project IDs" sheet is not read.** Companies, projects, plots and cost centres such as Rent House are their own step.

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
