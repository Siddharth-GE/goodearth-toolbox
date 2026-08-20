# Budgets — the rules

**Shipped 2026-08-01** (Interiors, migrations `0011`–`0012`); the **Construction** tree followed 2026-08-03 (`0019`). What an issued design revision costs, and what the client is charged.

_Trimmed 2026-08-14._

## The idea in one paragraph

The budget team picks up an **issued** selection revision, sets a **quantity** (their own measured figure, starting from the designer's), a **unit cost** and a **margin**, and the database computes the **client rate**. When every line has a cost the budget can be **approved**, which locks it. Two documents come out: an internal budget sheet showing cost and margin, and a client quotation showing neither.

## The four rules everything rests on

1. **Pricing is keyed on `line_key`, never on a selection line's row id.** A line copied into R+1 is a new row with the same key. Key on the row id and every revision re-prices from scratch — the single most likely reason the team would go back to a spreadsheet.
2. **Cost and margin are secret, and RLS is what keeps them secret.** `budgets`, `budget_lines` and `item_margins` require `/budgets` to **select**, not just to write — unlike every other table in the schema, whose reads are open to all staff. A careless join from a future Indents or PO screen returns zero rows rather than leaking markup. _(`/reporter` was added to those quals by `0055`, on the founder's explicit reversal of the margin boundary.)_
3. **`client_rate` is a generated column**, computed by Postgres from cost and margin, so the internal sheet and the client quote cannot disagree. `lib/budgets/math.ts` reimplements the same formula only so the screen can show it live before saving.
4. **Store full precision, round at display.** Rounding in the database bakes presentation into data; rounding each line before summing makes a 200-line quote disagree with its own total.

## The two documents

**B, the internal budget sheet** (`/budgets/[id]/pdf`) — quantity, cost, margin, client rate. Marked internal on every page **and in the filename**, because the name is what someone reads before deciding what to attach to an email.

**C, the client quotation** (`/budgets/[id]/quote`) renders from `QuoteData` in `lib/budgets/quote.ts`, **a type with no cost or margin field at all**. That is stronger than a template that merely omits two columns: a mistaken edit becomes a compile error rather than a leaked margin. **Keep it that way.**

> The space photos come from **shared `lib/design-views/queries.ts`**, which Selections uses too. Until 2026-08-17 `quote.ts` imported them out of `lib/selections/` — the toolbox's oldest cross-tool code import, closed on 2026-08-17. If Budgets ever needs another of another tool's reads, the answer is a shared module, not an import.
>
> That read **throws** if the database refuses it, and the quote route answers 503 rather than building the document. Deliberate: a quotation that silently prints without its photographs is worse than one that fails to print.

## Versions

Two numbering systems meaning different things. The **R-number** comes from the design and says what was specified; the **version** belongs to the budget and says which pricing of it. Documents are stamped `R2-v1`.

Approval is **reversible** — a cost estimate is fallible in a way a specification is not — and re-opening starts v2. The version increments on re-open rather than on approval, so the number on screen while pricing is the number that reaches the document. It can only go up.

## Carry-forward

Starting a budget for R+1 copies the previous revision's pricing across, matched on `line_key`. The rules live in `lib/budgets/carry-forward.ts` — pure, importing nothing, and the most heavily tested code in the repo.

| Case                        | What happens                                                       |
| --------------------------- | ------------------------------------------------------------------ |
| Unchanged line              | Cost, margin, vendor and the **team's** adjusted quantity all copy |
| Designer changed a quantity | Take the designer's new figure, keep the cost, flag for review     |
| New line                    | No row — the screen shows it with the product's default margin     |
| Removed line                | Absent; its old pricing stays with the old revision as history     |

The tests that matter: an unpriced line never reads as free, a 0% margin charges exactly cost, totals sum unrounded values, and 200 lines with two touched produce 199 carried.

## The Construction tree

`/budgets/construction` is the QS team's **stage-wise quantity plan per unit** — until 2026-08-20 the thing site indents were raised against. **It no longer feeds Indents**: the founder's backbone decision made the Estimator the construction line, so construction requests pull from the villa's official estimate, and these screens stay read/write for reference with a line of copy saying so. Whether they retire entirely is a founder question (TODO.md). Deliberately the opposite of Interiors in every way that matters:

- **No money.** `construction_budgets`/`construction_budget_lines` carry materials and quantities only, so reads are open to all signed-in staff and none of the secrecy machinery applies. Writes need `/budgets`.
- **No status, no approval, no revisions.** One living plan per unit (unique `unit_id`), edited in place as the build progresses.
- **Stages are free-form text** on the lines, grouped in first-appearance order (construction order, not alphabetical). A rename is one UPDATE, and renaming onto another stage's name **merges** them — that's the typo fix, not a bug.
- Data layer is `construction.ts` + `construction-actions.ts`, separate from the Interiors files on purpose: **nothing in them may touch `budget_lines` or `item_margins`.**

## Margin secrecy was verified for real

2026-08-03, as a staff user holding `/indents` and not `/budgets` — through that user's own JWT, never the service-role key, which bypasses exactly the rules under test. Result: `budgets`, `budget_lines` and `item_margins` all returned **zero rows**; `/budgets` redirected away and left the sidebar; the `approved_budgets` / `approved_budget_lines` views returned rows and carry no `unit_cost`, `margin_pct` or `client_rate` column at all; and the Indents pull screens showed no rupee figure anywhere, **in the rendered page or in its RSC payload**.

**Re-run that check if the views are ever widened.**

## Open

Layout and typography of both documents is unfinished — placeholder letterhead, Helvetica, stand-in terms text.
