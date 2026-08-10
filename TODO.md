# TODO

Read `STATUS.md` first. Phase 9 (Overview fully real + one real project
run end to end) still has no approved plan; this file gets one when the
founder approves it.

## Right now: Pusher is waiting on a browser test

`feature/pusher-relay` is built, CI green, **not merged** — PR #2. It
carries the relay, departments and the project schedule. Migrations
`0036`–`0040` are **already applied to the live database**, so the
branch and production are in step on schema and only the code is
waiting.

**Before anything else in the next session: ask whether the founder has
clicked through the preview.** If yes and they are happy, merge and
delete the branch. If they found something, fix it on the branch. Do not
start unit-level stages on top of an unreviewed branch.

The browser checklist, if it needs repeating: open a trail with three
legs, push it, bounce it without a reason (must refuse), bounce it
properly, let one go cold, finish it; then set a project start date and
stages, change one stage's weeks and watch every later date move.

## Pusher — what is left, in order

The relay, departments and the project schedule are built; see
`app/(dashboard)/pusher/PLAN.md` for how it works and what will bite.

- **Unit-level stages.** Project stages and the overview are built. Still
  to come: a per-unit breakdown (each unit stage mapping to one project
  stage) so a villa's own progress rolls up into the project picture,
  plus quests — a current stage with nothing running — and clearing a
  finished stage. Additive on top of `project_stages`.
- **The game.** Leaderboard, podium, ranks, the **clean streak** (a day
  counts if you neither ended it holding an overdue baton nor let one go
  overdue — the mockup's "empty court" version is unreachable for anyone
  on a long leg) and active days. `lib/pusher/points.ts` is written and
  tested already; this is mostly screens plus the two scoring views.
- **The seams.** `pusher_chain_links` surfaced both ways, Google Chat
  notifications (greenfield — fire-and-forget, never block a write), and
  `getPusherPulse()` grown into what the collated Dashboard reads.

## Management group — plan one tool at a time

Four Management stubs remain (sidebar + homepage vision cards). Each
gets its own planning session with the founder before any code:
Dashboard, Client Relations, Financial Management, Business Planning. No
order agreed yet — ask which comes first. (Project Management and Design
Management are gone: Pusher is that layer.)

## Smaller, any session

- PO-anchor picker in the Bills record form: move to server-side
  search (the `/api/catalogue` route-handler pattern) once the PO list
  makes the form payload noticeable — it currently ships every
  issued/completed PO.
- `lib/selections/views.ts` moves to `lib/design-views/` the moment a
  third consumer appears (verified 2026-08-04: still two — Selections
  and the Budgets quote).
