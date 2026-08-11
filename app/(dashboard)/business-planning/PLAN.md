# Business Planning — build notes

**Status: shipped** (2026-08-10). Migration `0048`.
Model a project before you build it: lines in, profit and funding out.

## The idea in one paragraph

The founder handed over `Vihara_BusinessPlan_JV.xlsx` — thirteen sheets
modelling an eco-village: JV land settled at a 30% premium in year four,
42 plotted villas and 35 row houses selling at three velocities, a
senior-living asset, company overheads and a biodiversity park, over a
72-month cash engine. Its own Guide sheet states the reuse plan: _"clone
the workbook per village/hamlet and re-enter the blue assumptions."_
Which is the spreadsheet problem this toolbox exists to end — clones
drift, nobody knows which file is current, and two plans can never sit
side by side. This is that workbook as a tool: name a plan, add lines,
read profit and funding as you type.

## The five rules everything rests on

1. **A plan is a set of LINES, and a project is whichever mix it has.**
   The founder's words: _"each line like row house, plotted development,
   apartment, commercial, senior living etc will have their own inputs
   (some projects may just be one thing other projects will be a mix of
   some)."_ Two kinds cover all five. **SALE** — you build it and sell
   it. **HOLD** — you build it and keep earning from it. The name is a
   free-text label, so two SALE lines can behave completely differently,
   and the zeros carry the product types: a bare-plot line has no
   built-up area and therefore no construction; an apartment line has no
   saleable plot area and sells only built-up area. No type to choose, no
   fields to hide, and a sixth kind of product needs no code.

2. **Store inputs, derive everything else.** Same doctrine as Relay's
   schedule. The document holds only what someone types; revenue per
   unit, capex, the month a payment lands, PBT — all recomputed by
   `lib/business-planning/model.ts` on every read. The engine is **pure,
   with no imports and no I/O**, so it runs unchanged in the browser
   (recalculating as you type, before anything is saved) and on the
   server (the list page's figures). That is the only arrangement where
   the two can never disagree, and it is why the list page runs the whole
   model rather than caching a number.

3. **The line owns its own; the plan owns the common.** Each line: land
   area and rate, its product, its costs, its velocity, its own cashflow,
   its own interest and profit, readable standing alone. The plan:
   horizon, financing rate, the land DEAL (one deal, so its terms are
   plan-level even though the area and rate are per line), collections,
   overheads, selling cost, one-time costs, and common infrastructure —
   roads, a clubhouse, the biodiversity park — that no single line owns.

4. **Two interest figures, and they are not meant to add up.** A line's
   interest is that line carrying itself with no equity. The plan pools
   every line into one account with one revolver and the plan's equity
   behind it, and borrows less — a line in surplus funds a line in
   deficit. The Summary tab shows both and names the gap on screen,
   because those two numbers WILL be compared and the difference is the
   benefit of running them together, not a bug. The workbook does the
   same thing across its Blocks 1, 2 and 3.

5. **The whole document is one jsonb column, and the parser is the only
   door in.** `0048 §1` argues the storage choice. The consequence lives
   here: `parsePlanInputs` defaults and clamps every field, on the way
   out AND on the way in through `savePlan`, because Postgres cannot
   check a jsonb column and the client is what writes it. It is also what
   lets a plan saved before a field existed still open.

## Where this deliberately departs from the workbook

Each of these is commented at the point it happens in `model.ts`.

|               | The sheet                                                                                                | Here                                                                                                                                       |
| ------------- | -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Interest      | A circular reference Excel works around; the ex-SL block charges none at all                             | A sequential monthly loop, which just does it correctly                                                                                    |
| Collections   | Convolved against a fixed 31-month window, silently dropping instalments on build cycles over ~30 months | Runs to the horizon                                                                                                                        |
| Peak funding  | `-MIN(closing cash)`, which for Vihara is **negative** — the cash never goes below zero                  | Split in two: `cashTrough` (the lowest the balance gets) and `peakFunding` (the most ever borrowed, which for Vihara Moderate is **zero**) |
| Venture IRR   | 1150% for Moderate and −52% for High, off a flow that opens positive                                     | `null`, rendered as a dash, with the guard stated in `irr()`                                                                               |
| Products      | Two hard-coded columns                                                                                   | A list you add to                                                                                                                          |
| Senior living | Its own five sheets                                                                                      | One HOLD line among however many                                                                                                           |
| Sensitivity   | Two named cells swung by an Excel data table                                                             | Both axes proportional across every line — prices do not fall on villas and hold on row houses                                             |
| Margin        | Revenue booked in full at sale, cost truncated at the horizon, so Base out-margins Moderate              | Profit is struck against the cost of WHAT SOLD; cash keeps the truncation. See below                                                       |

**Tell the founder about the peak-funding one.** ₹5.91 Cr was read as
money to raise; it is ₹5.91 Cr of headroom at the worst month. The
equity covers the whole project.

## The margin one, at length

Found 2026-08-11, because the founder noticed the scenarios reading
backwards. The sheet — and this tool, until now — booked 100% of a
home's price the month it sold, but spread its build over `buildMonths`
and dropped whatever fell past month 72. So a scenario counted all of
its revenue and only part of its cost, and the SLOWER it sold the better
its margin looked:

| Vihara Block 1 | Base                    | Moderate | High  |
| -------------- | ----------------------- | -------- | ----- |
| Was            | **23.3%** (6.2 unsold!) | 22.2%    | 22.2% |
| Now            | 21.5%                   | 22.2%    | 22.2% |

There are now two cost totals, and the whole fix is keeping them apart:

- **Cash** (`landCost`, `constructionCost`, the monthly series) — what
  leaves the account inside the horizon. Truncation is CORRECT here, it
  drives interest and the trough and peak funding, and it is unchanged
  to the rupee. This is the Cashflow tab.
- **Matched** (`matchedCost`, `constructionMatched`, …) — the cost of
  what sold: every rupee of build for every home whose price was
  counted, whenever spent, plus only the SOLD SHARE of land and infra.
  This drives PBT and margin, and it is the Summary tab.

`costOutsideHorizon` is the difference, shown as its own row so the
Summary column visibly adds up to the PBT in the strip rather than
quietly not. For Base that is ₹2.05 Cr: ₹2.91 Cr of building put back,
less ₹0.86 Cr of land and infra taken out from under 6.2 unsold homes.

**Base therefore no longer ties to Summary!B15:B16.** That is deliberate
and `model.test.ts` says so at the assertion. Moderate and High tie
exactly, because they sell out and the two totals coincide.

A held asset has **no margin at all** now. Expensing ₹29 Cr of capex
against six years of ramping rent gave a large negative percentage
sitting in the same column as a sale line's +22%. It reports yield on
cost and IRR, which is what a held asset is judged on, and the column is
headed "Margin / yield".

## Verified against the workbook

`vihara-fixture.ts` is the founder's own model as inputs, and
`model.test.ts` asserts the workbook's figures for both halves. This is
the strongest test available — the workbook was arrived at
independently, by hand, so agreement is evidence rather than a
tautology.

**Block 1, Moderate:** revenue ₹119.82 Cr · construction ₹44.94 Cr ·
dev/infra ₹13.02 Cr · land ₹17.16 Cr · overheads ₹12.24 Cr ·
biodiversity ₹5.80 Cr · interest ₹0 · **PBT ₹26.66 Cr at 22.2%** · cash
trough ₹5.91 Cr · 2.56× money.

**Block 1, Base:** trough ₹3.60 Cr · 2.08× — cash, and it ties. Its
construction is ₹39.43 Cr of cash rather than the ₹42.34 Cr those homes
cost to build, because the last row houses sell too late to finish
inside six years: the horizon doing its job. **PBT and margin here
deliberately differ from the sheet's ₹26.56 Cr at 23.3%** — see "The
margin one" above. The tool reports ₹24.52 Cr at 21.5%.

**Block 2 (the HOLD line):** capex ₹29.10 Cr · stabilised NOI ₹2.75 Cr ·
yield on cost 9.47% · terminal value ₹30.61 Cr · hold ₹54.34 Cr against
sell ₹43.08 Cr → **HOLD** · IRR 17.92% · 8.09×.

**Block 3 (mixed):** consolidated revenue ₹138.74 Cr.

Two places the fixture is not a literal transcription, both deliberate
and both commented in the file: land is per line here, so the site's
₹13.2 Cr is split across the two SALE lines by plot area (the total is
identical to the rupee); and the senior-living line carries development
cost only, because the site acquisition already sits on the residential
lines and charging it twice would double-count ₹13.2 Cr.

## Two businesses, not one — `buildMode`

Added 2026-08-11. The engine originally had exactly one construction
rule: a unit is built _because it sold_, spread over `buildMonths` from
its sale month. That is the plotted-development business, and Vihara is
entirely that. It cannot describe an apartment tower, where the whole
building goes up on its own calendar and you cannot put up the 14th
floor to order.

So a SALE line now says which it is:

- **`on-sale`** (default, unchanged) — nothing is spent ahead of a
  buyer. Collections largely fund the build. `buildMonths` is one unit's
  cycle.
- **`scheduled`** — the whole line is built from `buildStartMonth` over
  `buildMonths`, sold or not. Every rupee is carried until a buyer turns
  up.

The second one is where the money actually goes. A 100-flat tower, built
months 1–30, selling from month 6, **zero equity at 15%**:

| Sold at | Interest  | Peak funding | Unsold stock | PBT       | Margin |
| ------- | --------- | ------------ | ------------ | --------- | ------ |
| 1/mo    | ₹30.42 Cr | ₹44.97 Cr    | ₹11.88 Cr    | −₹4.96 Cr | −8.8%  |
| 1.5/mo  | ₹19.54 Cr | ₹38.24 Cr    | —            | ₹18.46 Cr | 22.0%  |
| 2.3/mo  | ₹11.15 Cr | ₹27.61 Cr    | —            | ₹26.85 Cr | 32.0%  |
| 4/mo    | ₹5.51 Cr  | ₹18.66 Cr    | —            | ₹32.49 Cr | 38.7%  |

The same tower at 1/mo built to order instead: **+₹21.78 Cr against
−₹4.96 Cr**. A ₹26.7 Cr swing from _when_ you build, nothing else.

Note what this does and does not touch:

- **`unsoldStock`** is new on `SaleLineResult`: build cost of units put
  up but not sold. Always 0 on an `on-sale` line. On a scheduled line it
  is the whole risk of the mode, and the reason cash spent exceeds cost
  of sales — those flats are stock, not expense, so `costOutsideHorizon`
  goes NEGATIVE here. Both directions are correct; read the label.
- **Zero equity needed no code.** `runCash` already charges interest from
  the first month the balance is negative, so a cash land payment in
  month 1 against an empty account starts the meter immediately. What was
  missing was only that the cashflow never SHOWED the equity, so a plan
  funded entirely by debt looked the same as one that wasn't.
  `MonthlySeries.equity` and the "Equity in" row fix that.
- **Collections still spread over `buildMonths` from each sale.** On a
  scheduled line that is now the whole building's duration rather than
  one unit's, which is a fair approximation of a construction-linked
  payment plan but not the same thing. If pre-launch and
  post-completion sales ever need different terms, that is the next
  field, not a tweak to this one.

## Things that will bite

- **`buildMode` changes what `buildMonths` MEANS** — one unit's cycle on
  an on-sale line, the whole building on a scheduled one. Any code
  reading it has to know which mode it is in.
- **There are two cost totals and they are both right.** Cash on the
  Cashflow tab, matched on the Summary tab, `costOutsideHorizon` naming
  the gap. If a new figure is added, decide which question it answers
  before picking which total to build it from — quietly using cash for a
  profit figure is the exact bug this tool shipped with.
- **A HOLD line has no `marginPct`.** Deliberate; the type does not carry
  the field. Reach for `yieldOnCostPct` or `holdIrrPct`.
- **Velocities are not sorted.** `velocityOutOfOrder` flags a line whose
  "High" is its slowest and both the strip and the sale form say so, but
  nothing rewrites it. Clamping what someone typed is worse.
- **The engine clamps efficiency and the exit cap rate at the point of
  use**, not only in `parsePlanInputs`, because the editor recalculates
  on raw keystrokes — before the parser sees anything. Any new divisor
  taken straight off a `line.*` field needs the same treatment.
- **Units are fractional.** 0.8 units a month is how velocity works, and
  totals read `41.999999999999993`. The workbook does the same. Don't
  "fix" it with rounding — rounding units up is how a plan sells 43
  villas out of 42.
- **Selling cost is a percentage of SALE bookings only.** A resident's
  monthly charge does not attract brokerage. If a third line kind ever
  arrives, decide explicitly whether its income joins that base.
- **Terminal value is not in PBT.** It is an asset still owned, not money
  that has moved. `pbtWithHeldValue` adds it in a row of its own.
- **A launch trigger reads the other lines' cumulative sales in list
  order** — a trigger sees this month's sales from lines above it and not
  from lines below. That is what a spreadsheet column does, and it is why
  Vihara's row houses release the month plotted crosses 70% rather than
  the month after. Reordering lines could therefore shift a release by
  one month.
- **Beds per unit was dropped on purpose.** The workbook works senior
  living per pax; beds cancel out of every figure (halve the charge,
  double the count), so this is per unit with one fewer input to get
  wrong. If a pax-based display is ever wanted, it is presentation only.
- **`MAX_HORIZON_MONTHS` is 144.** Every month field clamps to it, so a
  fat-fingered horizon cannot allocate a huge array on the server.

## Not built

- A PDF of a plan.
- Any chart. The cashflow is a table; if a cash curve earns its place it
  is hand-rolled inline SVG in this folder, the way Relay's
  `schedule-path.tsx` is.
- Itemised charge and opex lines on a HOLD line (the workbook has five
  charge items and six fixed-opex items; this takes the totals). The
  plan-level costs ARE itemised.
- Any link between a plan and actual spend in Budgets or Bills, and any
  read of another tool's data. The founder asked for this to be
  _"completely independent"_ and it is: `0048` has no foreign key outside
  `profiles`, and nothing here appears in the cross-tool contract table
  in CLAUDE.md.
