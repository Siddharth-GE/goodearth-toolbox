# TODO

Read `STATUS.md` first. Phase 9 (Overview fully real + one real project
run end to end) still has no approved plan; this file gets one when the
founder approves it.

## Right now: Pusher is waiting on a browser test

`feature/pusher-relay` is built, CI green, **not merged** — PR #2. It
carries the relay, departments, the project schedule, and the four fixes
the founder's own browser test produced. Migrations `0036`–`0040` are
**already applied to the live database**, so the branch and production
are in step on schema and only the code is waiting.

**Before anything else in the next session: ask whether the founder has
clicked through the preview.** If yes and they are happy, merge and
delete the branch. If they found something, fix it on the branch. The
founder has already chosen (2026-08-10) that standard trails wait for
this merge rather than stacking on top of it.

The browser checklist, if it needs repeating: open a trail with three
legs, push it, bounce it without a reason (must refuse), bounce it
properly, let one go cold, finish it; then set a project start date and
stages, change one stage's weeks and watch every later date move. Then
the four fixes: Pusher opens on Projects; finishing a trail in one stage
fills **that** stage and no other; a stage with nothing filed under it
shows as a dashed outline, not an empty solid block; and finishing a
baton clears it from Your court without a reload.

## Pusher — what is left, in order

The relay, departments and the project schedule are built; see
`app/(dashboard)/pusher/PLAN.md` for how it works and what will bite.

- **Standard trails at the house level** (founder, 2026-08-10 — approved
  shape, no code yet; build this first, on a fresh branch after PR #2
  merges). Every villa runs roughly the same set of handoffs. One click
  on a house should lay the whole set down, staffed, and then let you
  rearrange it. Three decisions already made:

  - **Queued trails have no clock.** The set arrives dormant; a trail
    goes live only when someone starts it. This is not a status column
    and does not break the doctrine — a queued trail simply **has no
    events yet**, so "not started" stays derived like everything else,
    and `open_chain()` splits into "create it" and "start it" (the
    `started` event it writes today). Why it matters: opening twelve
    trails live would start twelve clocks at once, and the Handover trail
    at 3 expected days would be cold within the week. Cold is the loudest
    signal in the tool; if it cries wolf on work nobody meant to start,
    people stop believing it, and that is the one thing Pusher does.
  - **Named sets, not one list.** "Standard villa", "Plot only",
    "Apartment" — each an ordered list of activities, managed next to
    Activities, offered on any house. Legs still prefill from the
    activity's last run, so a set is a list of activities, not a frozen
    copy of people and days.
  - **Rearranging means the queue**: reorder, remove, edit legs, start —
    all before a trail goes live. Nothing behind the baton ever becomes
    editable.

  Still to design: where the one click lives. Pusher has no house-level
  screen today, so this needs one, and that screen is also where the
  per-unit stage breakdown below belongs. Plan the two together.

- **Unit-level stages.** A per-unit breakdown (each unit stage mapping to
  one project stage) so a villa's own progress rolls up into the project
  picture, plus quests — a current stage with nothing running — and
  clearing a finished stage. Additive on top of `project_stages`. Shares
  the house screen with standard trails above.
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
