# Budgets — the rules

What an issued design revision costs, and what the client is charged — plus the construction stage tree. Grant `/budgets`. Migrations `0011`, `0012`, `0019`.

## The idea

The budget team picks up an **issued** selection revision, sets a **quantity** (their measured figure, starting from the designer's), a **unit cost** and a **margin**, and the database computes the **client rate**. When every line has a cost the budget can be **approved**, which locks it. Two documents come out: an internal sheet with cost and margin, and a client quotation with neither.

## The rules everything rests on

1. **Pricing is keyed on `line_key`, never a selection line's row id** — a line copied into R+1 is a new row with the same key. Key on the row and every revision re-prices from scratch.
2. **Cost and margin are secret, and RLS keeps them secret.** `budgets`, `budget_lines` and `item_margins` need `/budgets` to **select**, not just write, so a careless join elsewhere returns zero rows rather than markup. (`/reporter` joins those quals by founder decision, `0055`.)
3. **`client_rate` is a generated column**, so sheet and quote cannot disagree. `lib/budgets/math.ts` repeats the formula only to show it live before saving.
4. **Store full precision, round at display** — rounding each line makes a 200-line quote disagree with its own total.

## The two documents

- **The internal budget sheet** (`/budgets/[id]/pdf`) — quantity, cost, margin, client rate; marked internal on every page **and in the filename**.
- **The client quotation** (`/budgets/[id]/quote`) renders from `QuoteData` (`lib/budgets/quote.ts`), **a type with no cost or margin field** — a mistaken edit is a compile error, not a leaked margin. Keep it that way. Its room photos come from shared `lib/design-views/`, and that read **throws**: a quote without its photographs answers 503 rather than printing incomplete.

## Versions

The **R-number** is the design's (what was specified); the **version** is the budget's (which pricing of it). Documents are stamped `R2-v1`. Approval is reversible — re-opening starts the next version, so the number on screen while pricing is the one that reaches the document. It only goes up.

## Carry-forward

A budget for R+1 copies the previous pricing, matched on `line_key` — `lib/budgets/carry-forward.ts`, pure, importing nothing, the most tested code in the repo.

| Case                        | What happens                                                   |
| --------------------------- | -------------------------------------------------------------- |
| Unchanged line              | Cost, margin, vendor and the team's adjusted quantity all copy |
| Designer changed a quantity | Take the new figure, keep the cost, flag for review            |
| New line                    | No row — shown with the product's default margin               |
| Removed line                | Absent; its old pricing stays with the old revision            |

An unpriced line never reads as free; a 0% margin charges exactly cost.

## The Construction tree

`/budgets/construction` — the QS team's stage-wise quantity plan per unit. **It no longer feeds Indents** (construction requests pull from the villa's official estimate); whether it retires is an open founder question (`TODO.md`). The opposite of Interiors: **no money** (reads open, writes `/budgets`), no status or revisions (one living plan per unit), free-text stages grouped in construction order (renaming onto another stage merges them — the typo fix). Its files (`construction.ts`, `construction-actions.ts`) must never touch `budget_lines` or `item_margins`. A construction line an indent anchored cannot be deleted — hence its read of `indent_lines`.

## Margin secrecy — verified, and re-run it if the views widen

As a user holding `/indents` and not `/budgets`, through their own session (never the service role): `budgets`, `budget_lines` and `item_margins` returned zero rows; `approved_budgets(_lines)` returned rows with no cost, margin or rate column; the Indents pull screens showed no rupee anywhere, in the page or its RSC payload.

## Open

Both documents' layout is unfinished — placeholder letterhead, Helvetica, stand-in terms.
