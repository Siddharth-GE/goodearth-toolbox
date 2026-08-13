# Relay — build notes

The relay layer for site and design. Read this before touching the tool.

Relay replaced the planned **Project Management** and **Design
Management** tools — it is that whole layer, one module. Drawing
approvals, selections handoffs, fire NOCs, site handovers are all just
**activities**, tracked identically.

It tracks **accountability only**: where a task is, with whom, for how
long. The actual work stays deliberately off-app. Nothing here stores a
drawing, a decision, or a document.

## The model, in one paragraph

A **chain** (UI: "trail") is an ordered list of **activities**; each leg
IS an activity, plus a person and a number of expected days (0043 —
"there needn't be sub legs to an activity"). A **trail type** (table:
`pusher_trail_sets`) is a named trail with its activities fixed, so a
whole villa's run lands in one click and only the people need choosing.

The baton sits with exactly one person, who can **push** it forward one
leg, **bounce** it
back to any earlier leg (reason + note both mandatory), or **finish** it
from the last leg. Time in a leg beyond its expected days is **stuck**
(UI: "cold"). An admin can **hand** a baton to someone else without
moving the trail — the rescue hatch when the holder has left or is away.

## The three rules that everything else follows from

1. **The event log is the state.** `pusher_chain_events` is append-only.
   Holder, stuck-ness, per-leg actuals and every flow point are derived
   by replaying it. There is deliberately **no status column, no current
   -leg column, no stored point total**. If you find yourself adding one,
   stop — you are about to create a second source of truth that will
   drift from the log within a week.

2. **Events snapshot what they need.** `to_assignee_id` and
   `to_expected_days` are stamped onto each event by the guard, read from
   the leg row at the moment the baton lands. This is the same doctrine
   as prices-snapshotted-at-pick-time. It is what makes a manager
   unable to retroactively change whether a past push was on time, and
   what lets the guard decide legality from the **last event row alone**
   rather than replaying in plpgsql.

3. **The trigger is the boundary; buttons are a courtesy.**
   `lib/relay/events.ts` mirrors the guard so the right buttons render.
   When the two disagree the database wins, and `guardError()` in
   `actions.ts` passes its message through intact — those messages were
   written to be read by a person.

## Layout

| Path                     | What                                                                                                                                                                                                                                                                        |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `lib/relay/day.ts`       | **The IST day, in one place.** Vercel and Postgres both run UTC; the office is +05:30. Elapsed days are IST calendar-day differences, not 24-hour blocks. Must agree exactly with `at time zone 'Asia/Kolkata'` in the state view — no test can catch a drift between them. |
| `lib/relay/events.ts`    | The vocabulary and the guard's mirror. Answers from last event + leg count + who is asking.                                                                                                                                                                                 |
| `lib/relay/chain.ts`     | `replayChain` / `stintsOf` — the replay. A stint is one person holding one leg once; a leg bounced back to has several.                                                                                                                                                     |
| `lib/relay/points.ts`    | The economy, ranks, on-time. `scoreChain` takes a whole chain because on-time needs the _previous_ event.                                                                                                                                                                   |
| `lib/relay/queries.ts`   | Reads. Lists go through the `pusher_chain_state` view; only the detail page reads a full log.                                                                                                                                                                               |
| `lib/relay/actions.ts`   | Writes. Push/bounce/finish are **one insert each**; the guard does the rest.                                                                                                                                                                                                |
| `app/(dashboard)/relay/` | Projects (the landing page — `/relay` redirects to `/relay/projects`, the Masters pattern), Your court at `/relay/court` (phone-first), All trails, trail detail, Open a trail, Activities.                                                                                 |

Migrations: **`0036`** (the relay), **`0037`** (defaults on the two
server-stamped columns), **`0038`** (departments, many per trail),
**`0039`** (the project schedule), **`0040`** (the surrogate id
`pusher_project_plans` needed to be auditable), **`0041`** (trail types
and the queue), **`0042`** (a regression fix — see below), **`0043`**
(the leg IS the activity), **`0044`** (`replace_future_legs` catches up).

## Trail types, and the queue (0041, reshaped by 0043)

**The leg is the activity.** A trail type is a named trail whose
activities are fixed; picking one fills in the whole list with whoever
last carried each activity and the days that type gives it. Nothing is
typed, and everything is editable until the baton reaches it.

A type is a list of **activities**, never a frozen copy of people: the
people come from the most recent leg of each activity at the moment the
type is laid down, so a leaver's name cannot ride onto every new house
forever.

**One trail, one clock.** The first cut of this made a set produce
TWELVE trails on a house, which is twelve clocks started at once —
Handover at three expected days would have been cold within the week, on
work nobody meant to begin. One trail with twelve activity-legs has one
baton and one clock, and the problem simply does not arise.

**The queue survives anyway** (founder's choice) and now means something
better: a house's trail can be laid out today and begun when the site is
actually ready. It needed almost no machinery, because **the event log
already had the state and nothing used it** — a chain with no events.
`open_chain()` split into `create_chain()` + `start_chain()` and both
0036 guards already handled it: the events guard accepts only `started`
on an eventless chain, the legs guard waves every edit through because
"before the trail is opened there is nothing to protect".

Queued work **counts in the project picture as planned-but-not-done**.
Laying a set down makes a project look further behind, and that is
correct: the flattering number before it came from the work not being
written down. Anything else would let a house record twelve jobs and
still read 100% done.

**Anyone with `/relay` can start a queued trail** — matching what the
tool already allows, since Open-a-trail has always let one person open a
trail whose first leg belongs to someone else. A stricter rule would let
a coordinator lay a set down and then be unable to begin any of it.

## Two rules that arrived with the founder's next round

**A trail can be in several departments at once.** A selections handoff
is Design _and_ Purchase. That is why it is a join table and not a
column — a single department would force a lie on exactly the trails
worth watching. They prefill from the activity's last run, like the legs.

**Dates are worked out, never typed.** The only stored inputs are a
project's start date and each stage's length in weeks. Every date on
screen is calculated. Do not add a stored date "for convenience": that is
how inserting one stage silently orphans every date after it.

## Things that will bite

- **`pusher_chains` reaches `units` through two foreign keys** — `unit_id`
  and the `(project_id, unit_id)` composite. A bare `units(name)` embed
  is a PGRST201 at runtime. Always name the FK:
  `units!pusher_chains_unit_id_fkey(name)`.
- **`revalidatePath` is not enough.** These pages render dynamically and
  the router cache holds their payload, so every write follows through
  with `router.refresh()` on the client. Without it the baton moves in
  the database and the screen keeps showing the old leg.
- **Draw uniformly.** The trail route SVG scales with its aspect ratio
  preserved. The first version stretched to fill its container and turned
  every node into a flat ellipse.
- **A weighted total is a number, not a position.** Never draw one as a
  bar growing from the left edge. `actualPct` weights each stage by its
  length, so finishing one 40-week Construction trail is a big number —
  drawn from x=0 it painted straight over an untouched Design stage and
  claimed work nobody had done. Each stage now fills in its own block.
  The same trap is waiting for the leaderboard and the Dashboard.
- **`fetchAll` where completeness matters** — a missing event silently
  changes who the holder is, which is worse than an error.
- **Anything audited needs an `id` column.** `audit_row()` reads
  `new.id` and raises at runtime otherwise — 0039 shipped a table without
  one and every write to it failed until 0040. It typechecks and builds;
  only opening the page finds it.
- **Don't put `router.refresh()` inside a `useTransition` on a form that
  stays mounted.** `isPending` stays true while the refresh is in flight
  and the whole form greys out. A plain boolean is the right tool.
- **Don't delete a chain — unless it never started.** Every chain that
  has run has history from its `started` event, and one opened by mistake
  is _finished_ with a note. The single exception (0041 §9) is a **queued**
  trail, which has no events and therefore no history to destroy;
  `discard_chain()` refuses the instant one starts.
- **Never rebuild `pusher_chain_state` from an older migration.** It has
  been defined in **five** files now (0036, 0038, 0039, 0041/0042, 0043),
  and a
  `create view` is a full replacement, not a patch. 0041 was written from
  0036's copy and silently dropped the department columns 0038 had added,
  breaking All trails against the live database until 0042. Always start
  from the live definition:
  `select pg_get_viewdef('pusher_chain_state'::regclass, true);`
- **A queued trail must never show a timer.** A `TimerDial` reading
  "0 of 4 days" looks like a clock that has started, which is precisely
  what the queue exists to avoid. Queued rows read "Waiting" / "not
  started".

## What is not built yet

Phase 1 is the relay. Still to come, in order:

- **Phase 2 — stages and the map.** Project stages and unit stages, both
  ordered with week counts; each unit stage maps to one project stage,
  which is how ground-truth progress rolls up into a macro timeline. A
  chain then lives in a stage. Quests (a current stage with nothing
  running), clearing a finished stage, and the winding path with a
  pennant showing where the plan says today is. All additive: new tables
  plus nullable columns on `pusher_chains`.
- **Phase 3 — the game.** Leaderboard, ranks, the clean streak (see
  below) and active days. `points.ts` is already written and tested.
- **Phase 4 — the seams.** `pusher_chain_links` in the UI both ways,
  Google Chat notifications (greenfield — never block a write on them),
  and `getRelayPulse()` grown into the seam the collated Dashboard reads.

**The streak, when Phase 3 lands.** The mockup's "consecutive days you
ended with an empty court" is unreachable for anyone on a ten-day leg —
it punishes exactly the people doing the long work. Use the **clean
streak** instead: a day counts if you neither ended it holding an overdue
baton nor let one go overdue. Reachable while on a long leg, breaks the
moment you go cold, and derived from the same log with nothing stored.

## Welcome screen (2026-08-13)

The tool opens on a welcome screen (founder request, all Operations and Management tools). This supersedes the 2026-08-10 redirect-to-Projects: `/relay` now renders the welcome with `getRelayPulse()` counts, and Projects is its primary door.
