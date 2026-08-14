# Business Planning — the rules

**Shipped 2026-08-10** (`0048`; the optional project link is `0057`). Model a project before you build it: lines in, profit and funding out. This is the founder's `Vihara_BusinessPlan_JV.xlsx` as a tool — thirteen sheets whose own Guide sheet said to "clone the workbook per village", which is the spreadsheet problem this toolbox exists to end.

_Trimmed 2026-08-14: the workbook-verification figures and the buildMode worked example live in git and in `model.test.ts`._

## The five rules everything rests on

1. **A plan is a set of LINES, and a project is whichever mix it has.** Two kinds cover all five products. **SALE** — you build it and sell it. **HOLD** — you build it and keep earning from it. The name is free text, so two SALE lines can behave completely differently, and the zeros carry the product types: a bare-plot line has no built-up area and therefore no construction; an apartment line has no saleable plot area. No type to choose, no fields to hide, and a sixth kind of product needs no code.
2. **Store inputs, derive everything else.** The document holds only what someone types; revenue per unit, capex, the month a payment lands, PBT — all recomputed by `lib/business-planning/model.ts` on every read. The engine is **pure, with no imports and no I/O**, so it runs unchanged in the browser (recalculating as you type, before anything is saved) and on the server. That is the only arrangement where the two can never disagree, and it is why the list page runs the whole model rather than caching a number.
3. **The line owns its own; the plan owns the common.** Each line: land area and rate, its product, costs, velocity, cashflow, interest and profit — readable standing alone. The plan: horizon, financing rate, the land DEAL (one deal, so plan-level even though area and rate are per line), collections, overheads, selling cost, one-time costs, and common infrastructure no single line owns.
4. **Two interest figures, and they are not meant to add up.** A line's interest is that line carrying itself with no equity. The plan pools every line into one account with one revolver and the plan's equity behind it, and borrows less. The Summary tab shows both and names the gap on screen, because those two numbers WILL be compared and the difference is the benefit of running them together, not a bug.
5. **The whole document is one jsonb column, and the parser is the only door in.** `parsePlanInputs` defaults and clamps every field on the way out AND on the way in through `savePlan`, because Postgres cannot check a jsonb column and the client is what writes it. It is also what lets a plan saved before a field existed still open.

## Two totals, and both are right

Found 2026-08-11, because the founder noticed the scenarios reading backwards. The sheet booked 100% of a home's price the month it sold but spread its build over `buildMonths` and dropped whatever fell past the horizon — so a scenario counted all of its revenue and only part of its cost, and **the slower it sold the better its margin looked**.

- **Cash** (`landCost`, `constructionCost`, the monthly series) — what leaves the account inside the horizon. Truncation is CORRECT here; it drives interest, the trough and peak funding. This is the Cashflow tab.
- **Matched** (`matchedCost`, `constructionMatched`, …) — the cost of what sold: every rupee of build for every home whose price was counted, whenever spent, plus only the SOLD SHARE of land and infra. This drives PBT and margin. This is the Summary tab.

`costOutsideHorizon` is the difference, shown as its own row so the Summary column visibly adds up. **Vihara Base therefore no longer ties to the sheet's Summary!B15:B16, deliberately**; `model.test.ts` says so at the assertion. Moderate and High tie exactly, because they sell out and the two totals coincide.

A held asset has **no margin at all**. Expensing ₹29 Cr of capex against six years of ramping rent gave a large negative percentage sitting in the same column as a sale line's +22%. It reports yield on cost and IRR, and the column is headed "Margin / yield".

## Tell the founder about peak funding

The workbook's "peak funding ₹5.91 Cr" is `-MIN(closing cash)` and comes out **negative** — the cash never goes below zero. It is ₹5.91 Cr of _headroom at the worst month_, not money to raise; the equity covers the whole project. The tool splits it: `cashTrough` (the lowest the balance gets) and `peakFunding` (the most ever borrowed, which for Vihara Moderate is zero).

## Two businesses, not one — `buildMode`

A SALE line says which construction rule it follows. **`on-sale`** (default): nothing is spent ahead of a buyer, collections largely fund the build, and `buildMonths` is one unit's cycle. **`scheduled`**: the whole line is built from `buildStartMonth` over `buildMonths`, sold or not, and every rupee is carried until a buyer turns up. A 100-flat tower at one sale a month swings ₹26.7 Cr between the two modes from _when_ you build, nothing else.

## Things that will bite

- **`buildMode` changes what `buildMonths` MEANS** — one unit's cycle on an on-sale line, the whole building on a scheduled one. Any code reading it has to know which mode it is in.
- **There are two cost totals and they are both right.** If a new figure is added, decide which question it answers before picking which total to build it from — quietly using cash for a profit figure is the exact bug this tool shipped with.
- **`unsoldStock`** is build cost of units put up but not sold; always 0 on an on-sale line. On a scheduled line it makes `costOutsideHorizon` go NEGATIVE. Both directions are correct; read the label.
- **A HOLD line has no `marginPct`.** Deliberate; the type does not carry the field. Reach for `yieldOnCostPct` or `holdIrrPct`.
- **Velocities are not sorted.** `velocityOutOfOrder` flags a line whose "High" is its slowest and the screen says so, but nothing rewrites it. Clamping what someone typed is worse.
- **The engine clamps efficiency and the exit cap rate at the point of use**, not only in `parsePlanInputs`, because the editor recalculates on raw keystrokes — before the parser sees anything. Any new divisor taken straight off a `line.*` field needs the same treatment.
- **Units are fractional.** 0.8 units a month is how velocity works, and totals read `41.999999999999993`. The workbook does the same. Don't "fix" it with rounding — rounding units up is how a plan sells 43 villas out of 42.
- **Selling cost is a percentage of SALE bookings only.** A resident's monthly charge does not attract brokerage.
- **Terminal value is not in PBT.** It is an asset still owned, not money that has moved. `pbtWithHeldValue` adds it in a row of its own.
- **A launch trigger reads the other lines' cumulative sales in list order** — it sees this month's sales from lines above it and not below. That is what a spreadsheet column does. **Reordering lines can shift a release by one month.**
- **Beds per unit was dropped on purpose.** Beds cancel out of every figure (halve the charge, double the count).
- **`MAX_HORIZON_MONTHS` is 144.** Every month field clamps to it, so a fat-fingered horizon cannot allocate a huge array on the server.
- **Venture IRR is `null`, rendered as a dash**, where the flow opens positive — the sheet's 1150% and −52% are artefacts. The guard is stated in `irr()`.

## Not built

A PDF of a plan. Itemised charge and opex lines on a HOLD line (the plan-level costs ARE itemised). A cash curve — if one earns its place it now uses the shared `components/ui/chart/*` wrappers.

The tool reads no other tool's data: `0048` gave it no foreign key outside `profiles`, on the founder's "completely independent". `0057` added one **optional** `project_id`, and linking publishes headline numbers to `business_plan_targets` for Reporter's plan-vs-actual. Reporter reads the facts view, never this engine.
