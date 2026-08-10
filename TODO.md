# TODO

Read `STATUS.md` first. Phase 9 (Overview fully real + one real project
run end to end) still has no approved plan; this file gets one when the
founder approves it.

## Right now: standard trails is waiting on a browser test

`feature/pusher-standard-trails` is built, CI green, **not merged**.
Migrations `0041`–`0044` are **already applied to the live database**,
and that is safe while the code is unmerged: the state view kept every
column production reads (0042 exists because 0041 briefly did not — see
STATUS.md).

**Before anything else next session: ask whether the founder has clicked
through the preview.** One judgement call needs their eye specifically —
queued work counts in the project picture as planned-but-not-done, so
laying a standard set on a house makes its project read further behind.
That is the honest number, but it surprises, and it is theirs to accept
or overrule.

## Pusher — what is left, in order

The relay, departments and the project schedule are built; see
`app/(dashboard)/pusher/PLAN.md` for how it works and what will bite.

- **Unit-level stages.** Each unit stage maps to one project stage, so a
  villa's own progress rolls up into the project picture; plus quests — a
  current stage with nothing running — and clearing a finished stage.
  Additive on top of `project_stages`. **The house screen already exists**
  (`/pusher/projects/[projectId]/houses/[unitId]`) — build this into it
  rather than adding another page.
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
