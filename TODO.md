# TODO

Phase 9 has no approved plan yet — read `STATUS.md` first; its "Next
up" list holds the loose ends and Phase 9's shape (Overview fully real

- one real project run end to end). This file gets the Phase 9 build
  plan once the founder approves one.

## Pusher — phases 2 to 4

Phase 1 (the relay) is built; see `app/(dashboard)/pusher/PLAN.md` for
how it works and what will bite. The remaining phases, in order:

- **Phase 2 — stages and the map.** Project stages and unit stages, both
  user-editable, ordered, with week counts; every unit stage maps to one
  project stage, which is how ground-truth progress rolls up into the
  macro timeline. Chains then live in a stage. Quests (a current stage
  with nothing running), clearing a finished stage, and the winding path
  with a pennant for where the plan says today is — the gap is the slip.
  All additive: new tables plus nullable columns on `pusher_chains`.
- **Phase 3 — the game.** Leaderboard, podium, ranks, the **clean
  streak** (a day counts if you neither ended it holding an overdue baton
  nor let one go overdue — the mockup's "empty court" version is
  unreachable for anyone on a long leg) and active days. `points.ts` is
  written and tested already; this is mostly screens plus the two scoring
  views.
- **Phase 4 — the seams.** `pusher_chain_links` surfaced both ways,
  Google Chat notifications (greenfield — fire-and-forget, never block a
  write), and `getPusherPulse()` grown into what the collated Dashboard
  reads.

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
