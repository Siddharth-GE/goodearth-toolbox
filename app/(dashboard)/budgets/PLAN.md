# Budgets — build notes

**Status: shipped** (Phase 4, merged 2026-08-01). Migrations `0011`–`0012`.

What an issued design revision costs, and what the client is charged.

## The idea in one paragraph

The budget team picks up an **issued** selection revision, sets a
**quantity** (their own measured figure, starting from the designer's), a
**unit cost** and a **margin**, and the database computes the **client
rate**. When every line has a cost, the budget can be **approved**, which
locks it. Two documents come out: an internal budget sheet showing cost
and margin, and a client quotation showing neither.

## The four rules everything rests on

1. **Pricing is keyed on `line_key`, never on a selection line's row id.**
   A line copied into R+1 is a new row with the same key. Key on the row
   id and every revision re-prices from scratch — which is the single
   most likely reason the team would go back to a spreadsheet.
2. **Cost and margin are secret, and RLS is what keeps them secret.**
   `budgets`, `budget_lines` and `item_margins` require `/budgets` to
   **select**, not just to write — unlike every other table in the
   schema, whose reads are open to all staff. A careless join from a
   future Indents or PO screen returns zero rows rather than leaking
   markup.
3. **`client_rate` is a generated column**, computed by Postgres from
   cost and margin. The internal sheet and the client quote therefore
   cannot disagree. `lib/budgets/math.ts` reimplements the same formula
   only so the screen can show it live before saving.
4. **Store full precision, round at display.** Rounding in the database
   bakes presentation into data; rounding each line before summing makes
   a 200-line quote disagree with its own total.

## The two documents

**B, the internal budget sheet** (`/budgets/[id]/pdf`) — quantity, cost,
margin, client rate. Marked internal on every page and in the filename.

**C, the client quotation** (`/budgets/[id]/quote`) — the design views,
items, quantity, rate and amount, with space and grand totals.

C renders from `QuoteData` in `lib/budgets/quote.ts`, **a type with no
cost or margin field at all**. That's stronger than a template that
merely omits two columns: a mistaken edit becomes a compile error rather
than a leaked margin. Keep it that way.

## Versions

Two numbering systems that mean different things. The **R-number** comes
from the design and says what was specified. The **version** belongs to
the budget and says which pricing of it — documents are stamped `R2-v1`.

Approval is **reversible** (a cost estimate is fallible in a way a
specification is not), and re-opening starts v2. The version increments
on re-open rather than on approval, so the number on screen while pricing
is the number that reaches the document. It can only go up.

## Carry-forward

Starting a budget for R+1 copies the previous revision's pricing across,
matched on `line_key`. The rules live in `lib/budgets/carry-forward.ts` —
pure, and the most heavily tested code in the repo:

| Case                        | What happens                                                       |
| --------------------------- | ------------------------------------------------------------------ |
| Unchanged line              | Cost, margin, vendor and the **team's** adjusted quantity all copy |
| Designer changed a quantity | Take the designer's new figure, keep the cost, flag for review     |
| New line                    | No row — the screen shows it with the product's default margin     |
| Removed line                | Absent; its old pricing stays with the old revision as history     |

## Tests

`npm test` covers `lib/budgets/math.ts` and `carry-forward.ts` only —
pure functions, no database. The cases that matter: an unpriced line
never reads as free, a 0% margin charges exactly cost, totals sum
unrounded values, and 200 lines with two touched produce 199 carried.

## Open

- Layout and typography of both documents is unfinished — placeholder
  letterhead, Helvetica, stand-in terms text.
- **Margin secrecy has never been verified as a non-Budgets user.** The
  policy is written and only `lib/budgets/` touches those tables, but
  nobody has signed in without the grant and confirmed zero rows. Do
  **not** check this with the service-role key — it bypasses exactly the
  rules being tested.
