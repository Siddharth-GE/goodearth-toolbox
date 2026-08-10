# TODO

Read `STATUS.md` first. Phase 9 (Overview fully real + one real project
run end to end) still has no approved plan; this file gets one when the
founder approves it.

## Right now: nothing in flight

Business Planning is merged and live (PR #4). Relay is merged and live
through standard trails; the next build is the first item below.

Two things to pick up on Business Planning when the founder next uses it
in anger, neither blocking:

- **Grant it to whoever needs it.** Only admins can see it today. It
  carries land cost, profit and peak funding, so the grant is the whole
  boundary — SELECT is gated, not just writes.
- **The peak-funding finding is worth carrying into how plans are
  discussed.** The workbook's "peak funding ₹5.91 Cr" is
  `-MIN(closing cash)` and comes out negative: the cash never goes below
  zero, so that is headroom at the worst month, not money to raise. The
  tool reports peak funding as zero and the trough separately. See
  `app/(dashboard)/business-planning/PLAN.md`.

One thing to watch on Relay when real work starts landing:
a trail's unfinished activities count in the project picture as
planned-but-not-done, so a house with a full villa trail reads further
behind. The founder has seen this and accepted it; revisit only if it
turns out to mislead in practice.

## Relay — what is left, in order

The relay, departments, the project schedule, trail types and the house
screen are built; see `app/(dashboard)/relay/PLAN.md` for how it works
and what will bite.

- **Unit-level stages.** Each unit stage maps to one project stage, so a
  villa's own progress rolls up into the project picture; plus quests — a
  current stage with nothing running — and clearing a finished stage.
  Additive on top of `project_stages`. **The house screen already exists**
  (`/relay/projects/[projectId]/houses/[unitId]`) — build this into it
  rather than adding another page.
- **The game.** Leaderboard, podium, ranks, the **clean streak** (a day
  counts if you neither ended it holding an overdue baton nor let one go
  overdue — the mockup's "empty court" version is unreachable for anyone
  on a long leg) and active days. `lib/relay/points.ts` is written and
  tested already; this is mostly screens plus the two scoring views.
- **The seams.** `pusher_chain_links` surfaced both ways, Google Chat
  notifications (greenfield — fire-and-forget, never block a write), and
  `getRelayPulse()` grown into what the collated Dashboard reads.

## Relay — two known gaps, small

- **Editing a queued trail's activities from the house page.** You can
  open the trail itself to change them, but there is no inline editor in
  the waiting list. The write path already exists and is current —
  `replaceFutureLegs` in `lib/relay/actions.ts` and the
  `replace_future_legs` RPC, updated for the activity model in `0044` —
  and has simply never been wired to a screen. Deliberately kept for this.
- **An "Open a trail" button on the Projects landing page.** It is one
  click away via a house or All trails, so this is convenience, not a gap
  in capability. The founder has not asked for it.

## Management group — plan one tool at a time

Three Management stubs remain (sidebar + homepage vision cards). Each
gets its own planning session with the founder before any code:
Dashboard, Client Relations, Financial Management. No order agreed yet —
ask which comes first. (Project Management and Design Management are
gone: Relay is that layer. Business Planning is built.)

Wanted later on Business Planning, none of it asked for yet: a one-page
PDF of a plan; itemised charge and running-cost lines on a HOLD line
(the plan-level costs are already itemised); a cash curve, which by
DESIGN.md would be hand-rolled inline SVG rather than a chart library.

## Smaller, any session

- PO-anchor picker in the Bills record form: move to server-side
  search (the `/api/catalogue` route-handler pattern) once the PO list
  makes the form payload noticeable — it currently ships every
  issued/completed PO.
- `lib/selections/views.ts` moves to `lib/design-views/` the moment a
  third consumer appears (verified 2026-08-04: still two — Selections
  and the Budgets quote).
