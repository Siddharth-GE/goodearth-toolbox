# Business Planning — the rules

Grant `/business-planning`. Migrations `0048`, `0057`. Model a project before you build it: lines in, profit and funding out — the founder's `Vihara_BusinessPlan_JV.xlsx` as a tool, instead of cloning the workbook per village. Verified figure-for-figure against the workbook (`model.test.ts`).

## The five rules everything rests on

1. **A plan is a set of LINES, and a project is whichever mix it has.** Two kinds cover every product: **SALE** (build and sell) and **HOLD** (build and keep earning). The name is free text and the zeros carry the product type — a bare plot has no built-up area, so no construction. A new kind of product needs no code.
2. **Store inputs, derive everything else.** The document holds only what someone typed; everything else is recomputed by `lib/business-planning/model.ts`, **pure, with no imports and no I/O**, so it runs unchanged in the browser (recalculating as you type) and on the server, and the two can never disagree.
3. **The line owns its own; the plan owns the common.** Each line: its land, product, costs, velocity, cashflow, interest and profit. The plan: horizon, financing rate, the land deal, collections, overheads, selling cost, one-time costs and shared infrastructure.
4. **Two interest figures, not meant to add up.** A line's interest is that line carrying itself with no equity; the plan pools every line with one revolver and the plan's equity, and borrows less. The Summary shows both and names the gap — it is the benefit of running them together.
5. **The document is one jsonb column, and `parsePlanInputs` is the only door in** — it defaults and clamps every field on read and on save, because Postgres cannot check jsonb and the client writes it.

## Two totals, and both are right

The workbook booked a home's whole price when it sold but dropped build cost past the horizon, so **the slower a scenario sold, the better its margin looked**.

- **Cash** (`landCost`, `constructionCost`, the monthly series) — what leaves the account inside the horizon. Truncation is correct here: it drives interest, the trough and peak funding. The Cashflow tab.
- **Matched** (`matchedCost`, …) — the cost of what sold: all its build whenever spent, plus the sold share of land and infra. It drives PBT and margin. The Summary tab.

`costOutsideHorizon` is the difference, shown as its own row. Vihara Base therefore deliberately does not tie to the sheet's Summary; Moderate and High tie exactly. **A held asset has no margin** — it reports yield on cost and IRR, under "Margin / yield".

## Peak funding is not money to raise

The workbook's "peak funding" is `-MIN(closing cash)` and comes out negative — headroom at the worst month. The tool splits it: `cashTrough` (lowest balance) and `peakFunding` (most ever borrowed, zero for Vihara Moderate). Tell the founder this whenever the figure comes up.

## Two businesses — `buildMode`

A SALE line is **`on-sale`** (default: nothing spent ahead of a buyer, `buildMonths` is one unit's cycle) or **`scheduled`** (the whole line built from `buildStartMonth` over `buildMonths`, sold or not, every rupee carried until a buyer comes).

## Things that will bite

- **`buildMode` changes what `buildMonths` means.** Code reading it must know the mode.
- **Choose the total before adding a figure** — using cash for a profit figure is the bug this tool shipped with.
- **`unsoldStock`** is always 0 on an on-sale line; on a scheduled one it makes `costOutsideHorizon` negative. Both are correct.
- **A HOLD line has no `marginPct`** — the type does not carry it. Use `yieldOnCostPct` or `holdIrrPct`.
- **Velocities are not sorted**; `velocityOutOfOrder` flags a "High" that is slowest, and nothing rewrites what was typed.
- **Divisors are clamped at the point of use** (efficiency, exit cap rate), because the editor recalculates on raw keystrokes before the parser. Any new divisor from a `line.*` field needs the same.
- **Units are fractional** (0.8 a month); don't round — rounding up is how a plan sells 43 villas out of 42.
- **Selling cost applies to SALE bookings only.**
- **Terminal value is not in PBT** — `pbtWithHeldValue` adds it on its own row.
- **A launch trigger reads the lines above it** for this month's sales, as a spreadsheet column would — reordering lines can shift a release by a month.
- **`MAX_HORIZON_MONTHS` is 144**, clamped everywhere, so a fat-fingered horizon cannot allocate a huge array.
- **Venture IRR is `null`** (a dash) where the flow opens positive; the guard is in `irr()`.
- Beds per unit was dropped on purpose — beds cancel out of every figure.

## Boundaries and what is not built

It reads nothing from other tools. One **optional** `project_id` (`0057`): linking publishes headline numbers to `business_plan_targets` on every save, which Reporter and Financial Management read through the facts view — never this engine. Not built: a PDF of a plan; itemised charges on a HOLD line; a cash curve (it would use `components/ui/chart/*`).
