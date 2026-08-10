# TODO

Phase 9 has no approved plan yet — read `STATUS.md` first; its "Next
up" list holds the loose ends and Phase 9's shape (Overview fully real

- one real project run end to end). This file gets the Phase 9 build
  plan once the founder approves one.

## Pusher — phases 2 to 4

Phase 1 (the relay) is built; see `app/(dashboard)/pusher/PLAN.md` for
how it works and what will bite. The remaining phases, in order:

- **Unit-level stages.** Project stages and the overview are built. Still
  to come: a per-unit breakdown (each unit stage mapping to one project
  stage) so a villa's own progress rolls up into the project picture,
  plus quests — a current stage with nothing running — and clearing a
  finished stage. Additive on top of `project_stages`.
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
