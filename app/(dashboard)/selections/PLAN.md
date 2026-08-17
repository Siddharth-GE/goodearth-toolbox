# Selections — the rules

**Shipped 2026-08-01.** Migrations `0006`–`0010`.

What the design team specifies for every space of a unit, and the source everything downstream reads from.

_Trimmed 2026-08-14._

## The idea in one paragraph

A unit has **spaces** (Living, Bedroom 1, Bath 2 — real rooms, named). A **selection** is a numbered revision of that unit's design: R0, R1, R2. A revision is a **draft** until it is **issued**, and an issued revision is **immutable** — a change means R+1, copied forward. Each line carries a **`line_key`** that survives the copy, which is what lets Budgets keep pricing on lines that didn't change.

## Why it's built this way

- **Immutability is enforced by the database, not the UI.** `selection_lines_draft_only` refuses every write to a line whose revision isn't a draft. The rule has to hold whatever writes the row — and it is also why a linked design line can never be deleted, only superseded.
- **`line_key` cannot be retrofitted.** It exists from the first migration even though nothing consumed it for weeks. `create_next_revision()` copies lines forward carrying their keys; copy with fresh keys and issuing R1 silently asks the budget team to re-price all 200 lines.
- **Cross-unit lines are structurally impossible.** `selection_lines` carries a denormalised `unit_id` purely so two composite foreign keys can force the line's space and its revision to belong to the same unit. Without it that rule needs a trigger someone eventually bypasses.
- **Rates are snapshotted at pick time** (`indicative_rate_snapshot`). Not an opinion about cost — it exists so an issued revision keeps the figure it was specified against when a master price changes later.
- **Provisional items.** A designer can add something the catalogue lacks without leaving the editor. It lands in `items` immediately, flagged provisional, so the line has a real foreign key from the start — there is no parallel "custom line" concept to reconcile. Masters approves or merges it later; **approval is never a gate on the designer.**

## Performance decisions worth keeping

The picker was rebuilt once after it felt slow. Both causes are easy to reintroduce:

- **Catalogue search is a Route Handler** (`app/api/catalogue/route.ts`), not a Server Action. Actions dispatch one at a time per client, so keystrokes queue behind each other, and a revalidating action re-renders the whole route server-side.
- **The basket is local.** Pressing + costs nothing; the whole lot is written in one `addLines` call. Twelve items used to be twelve round trips, each re-running every query on the page.

## Things that will bite

- **`getDownstreamImpact` reads indents and POs directly** — open reads of `indent_lines`/`indents` plus the money-free `po_line_facts`. **No Indents code is imported**, and none may be.
- **The design-view READS are shared, in `lib/design-views/queries.ts`** — Selections shows and prints them, Budgets prints them on the client quote. They moved out of `lib/selections/views.ts` on 2026-08-17, which was the toolbox's one long-standing cross-tool code import (`AUDIT.md` MOD-01). **Selections still owns the writes** (`views-actions.ts`, gated on `/selections`), and only reading is shared. That shared file has **no grant of its own** by design, following the `lib/masters/*` convention — so anything added to it is reachable by a holder of `/budgets` who has no `/selections`. Keep it narrowly about photographs.
- **`/selections/views/[viewId]` streams from a private bucket** and gates on `/selections` OR `/budgets` itself, in the route handler. It is not covered by any RLS policy.

## Open

The design document uses a placeholder letterhead and Helvetica until real assets and a Geist `.ttf` arrive. Paste-from-Excel into the line grid was asked for and not built.
