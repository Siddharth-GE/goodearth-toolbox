# Estimator — the rules

Grant `/estimator`. Migrations `0074`–`0088` and `0096`–`0098` (`0078`–`0081` shared with Indents and Inventory). The 2026-09-26 rework (`0096`–`0098`) is on staging; its Fable approval pass is due before production (`TODO.md`).

What a villa costs to build. Works come from the Masters vocabulary (`0073`); this tool adds what each is measured in, what its labour costs and what it consumes. Selections and Budgets are interiors and stay out of it.

## The shape (founder, 2026-09-26)

**Every villa is different** — "finishes are different, foundations can be different" — so there is no house type villas follow. What is shared is **how a work is priced**, never how much of it a villa has.

- **Rate book** (the Works tab): per work, its unit, labour ₹/unit and materials per unit at Masters' prices. Mixes are their own tab.
- **Villa**: one working estimate, its own list of works, each measured for that villa. It follows the rate book unless it has its own labour rate, materials or price for a work — grey follows the rate book, black is this villa's own, ↺ puts it back.
- **Official**: a numbered, frozen copy (EST/…/NNN) — what the stores and site check against.
- **Site check**: one list across villas.

## The founder's decisions

1. **Materials ARE the items master** (`0086`: "all materials are exactly the same as in the items master"). The rate is `items.indicative_price`, edited in Masters; recipe quantities are in the item's own unit, so nothing converts and issued-vs-estimated compares exactly. `estimator_materials` is retired in place and never read: a recipe row from before `0086` counts for nothing and says so; a frozen takeoff row from before it shows by its frozen name. `estimate_takeoff_facts` still bridges both generations for the site tools behind one unchanged column list.
2. **A rate explains itself.** On a draft every rate is a button opening its build-up for this villa — labour, what one unit uses, what each material costs — each figure marked _Rate book_ or _This villa_. A different foundation is a different work (the list has rubble / isolated / pile); a different finish is **Swap** on the villa's row, the rate book's material standing in as an allowance until the choice is made. Editing a villa's materials is **copy-on-write** (`changeLineRecipe`): the first change copies the rate book's list onto the line. Labour varies on the line, a material price on the estimate (one row per material, so two works cannot disagree about cement), each an override where blank means "follow the master" and 0 is a real rate (`0087`/`0088`). Someone holding `/masters` can set a missing price from the same panel (`setItemPrice`). The rate book lists works **used but not priced** and offers **Copy this rate to…** with the same work on other floors ticked (`floorTwins`).
3. **Mixes are named and reusable** — change M20 once and every concrete work follows. A recipe may hold both mixes and direct materials.
4. **One working estimate per villa; Make official takes a frozen copy** (`0098`). `make_estimate_official` copies the working estimate with everything under it, writes the snapshot the app computed, refuses if it no longer matches, and mints EST/…/NNN superseding the previous official — one transaction; the working estimate stays open. A villa starts blank or from another estimate (`start_villa_estimate`: its works to measure, or ticked, everything). Revise, Copy to villa and templates are gone from the screens.
5. **Measure first.** A work can be listed before it is measured (`0097`: `qty` null = "to measure"); Make official refuses while any is, naming them. Works can be added in bulk, set up or not, so the rate book never has to come first.
6. **A line's quantity can come from a measurement sheet** (`0096`): rows of Nos × Length × Breadth × Depth, a blank box not used, additions only (openings measured net by hand). After every row change the action re-sums the sheet through `calc.ts` and writes the total onto `estimator_estimate_lines.qty`, so nothing downstream changes; a measured line's quantity is read-only. Rows are draft-only in the database and stand after Make official as the record of where the quantity came from. Rows **copy to another work** of the estimate (a wall's rows feed masonry, plaster and paint) and **Duplicate** copies a row within its own sheet — both read from the database, never from the browser.
7. **Units are picked from the shared Masters list** (`0082`), and a work's unit is **refused**, not warned, while any estimate line uses it — 40 cum becoming 40 sqm is the same number describing a different building.
8. **The estimate reads as a BOQ**: one grand total, works grouped by category with subtotals, one rate and one amount per line. `groupLineCosts` in `calc.ts` produces it; anything that prints an estimate renders its output rather than grouping again.
9. **Site check is one list across villas**: over-estimate and outside-the-estimate rows with Approve on the row, and every material estimated against reached, villa by villa (`getOfficialComparisons`, `site-check.ts`). An approval **carries to the villa's later officials**, matched on (work, item) — read-side only.
10. **No scheduling** — "this whole build is only estimation". If it is ever built, Relay's missing per-activity dates are where it goes.

## The rules everything rests on

- **Every table here is `/estimator`-gated, SELECT included** (`0074`). Masters reads are ungated, so a rate cannot live there — a work's unit and labour rate are in `estimator_work_info`, never on `work_items`. It reads Inventory's money-free `stock_issues(_lines)` and `goods_receipts(_lines)`; nothing reads its tables except through `estimate_takeoff_facts`, which carries no rate, ever.
- **A missing rate is `null`, and `null` is never zero.** The calculator returns `null` for any cost it cannot know, `formatMoney(null)` prints "—", and a frozen unpriced figure stays unpriced forever (BUGCATCHER #13).
- **All arithmetic is in `lib/estimator/calc.ts`**, pure and tested. The rate book's cost per unit and an estimate line's cost come from the same `computeLine`.
- **Costs are live while working, frozen at official** (`0077`). The app computes the snapshot — per-line costs and the per-(work, material) takeoff — and SQL validates it, never re-implements it.
- **One working and one official estimate per villa** (partial unique indexes); a race loses at the index, loudly. Only drafts are edited or deleted (`delete_draft_estimate`, one transaction). A template is an estimate with no villa (`check (is_template = (unit_id is null))`); no screen makes one.
- **Deletion is refused, not cascaded** — a material used in a recipe is deactivated, never deleted.
- **Material outside the official estimate is flagged forever** (`0083`). Detection is derived, per (work, item), from issues and direct-to-site deliveries; only the estimator's acknowledgement is stored, with no delete policy and no un-approve. The amber badge never clears.
- **No embeds** — `units` has two paths to `plots`, so names merge through a `Map` (BUGCATCHER #2).

## Things that will bite

- **An official must not point back at the working estimate it came from.** `source_estimate_id` is ON DELETE SET NULL and a submitted header refuses updates, so deleting the working estimate would fail on the cascade. `make_estimate_official` leaves it null on purpose; a "made from" link needs its own column.
- **Nothing converts units** — not the recipes (quantities are per one unit of the parent, and screens print "bags per cum") and not the measurement sheet (feet on a cum work gives a confident wrong number; the unit beside the total is the only guard). Nothing stops Masters holding two units that mean the same thing.
- **A mix with nothing in it contributes nothing** rather than erroring; the "nothing in it yet" flag is all that stands between an empty mix and a quietly cheap estimate.
- **Cells still refresh the page on save.** Skipping it (Budgets' `saveLine` precedent) needs the whole BOQ computed in the browser — worth doing once the rework has settled.

## Later, if asked

A villa comparison grid (villas down, works across, to catch a mistyped measurement); a work-done record (measurement book) — the only honest basis for checking material against progress and paying labour by measured work; estimate against actual on the money side (POs, bills); an estimate PDF and a rate analysis print, both rendering `groupLineCosts` / `computeLine`; "where does the cement go" usage filters; Excel paste; wastage and contingency; deduction rows; tidying the 172-work list (a Masters job).
