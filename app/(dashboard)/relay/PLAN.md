# Relay — the rules

The relay layer for site and design. Grant `/relay`. Relay replaced the planned Project Management tool: drawing approvals, selections handoffs, fire NOCs and site handovers are all **activities**, tracked identically. It tracks **accountability only** — where a task is, with whom, for how long. It stores no drawing, decision or document; the drawings are Design Management's (**Relay keeps who-has-the-baton; Design Management keeps the artefacts**).

## The model

A **chain** (UI: "trail") is an ordered list of legs; each leg IS an activity, plus a person and expected days (`0043`). A **trail type** (`pusher_trail_sets`) is a named trail with its activities fixed, so a villa's whole run lands in one click and only the people are chosen. The baton sits with one person, who can **push** it forward, **bounce** it back to any earlier leg (reason and note mandatory) or **finish** it from the last leg. Time past a leg's expected days is **stuck** (UI: "cold"). An admin can **hand** a baton to someone else — the rescue hatch when the holder has left. The holder can mark the work **with the client** and take it back (`0064`).

## The rules everything follows from

1. **The event log is the state.** `pusher_chain_events` is append-only; holder, stuck-ness, per-leg actuals and points are derived by replaying it. **No status column, no current-leg column, no stored total** — adding one creates a second truth that drifts within a week.
2. **Events snapshot what they need.** The guard stamps `to_assignee_id` and `to_expected_days` on each event from the leg row as the baton lands, so nobody can retroactively change whether a past push was on time, and the guard decides legality from the last event row alone.
3. **The trigger is the boundary; buttons are a courtesy.** `lib/relay/events.ts` mirrors the guard so the right buttons render; when they disagree the database wins, and `guardError()` passes its message through — they were written for people.
4. **A trail can be in several departments** — a join table, because a selections handoff is Design _and_ Purchase.
5. **Dates are worked out, never typed.** The only stored inputs are a project's start date and each stage's length in weeks; a stored date "for convenience" is how inserting one stage orphans every date after it.

## With the client

`client_held` / `client_returned`, derived from the last **flow** event (`started`, `pushed`, `bounced`, `client_held`, `client_returned`), so a push, bounce or finish clears it with nobody remembering to.

- **The clock keeps running** — the sentence beside the number changes, not the number. Pausing it would need the view, `chain.ts` and the IST maths to agree about intervals, invisibly.
- A trail can be cold **and** with a client; cold takes the wave's crest.
- **`handed` is not a flow kind** — an admin reassigning the holder must not take the work back from a client. So the guard needs one extra indexed read over the flow kinds, and it snapshots the holder from the last **event**, not the leg row, or it would undo an admin's hand-off.
- **A held baton stays in its holder's court**, with an amber chip — they are the one who chases the client.

## Trail types and the queue

- A type is a list of **activities, never people**: people come from each activity's most recent leg when the type is laid down, so a leaver's name cannot ride onto every new house.
- **One trail, one clock** — a type is one trail with many legs, never many trails started at once.
- **A queued trail is a chain with no events** (`create_chain()` + `start_chain()`). It counts as planned-but-not-done in the project picture — making a project look further behind is correct. Anyone with `/relay` can start one.

## Things that will bite

- **`pusher_chains` reaches `units` through two FKs** — name the embed: `units!pusher_chains_unit_id_fkey(name)`.
- **Never rebuild `pusher_chain_state` from an older migration.** Six files have defined it and `create view` replaces the whole thing — `0041`, written from `0036`'s copy, silently dropped `0038`'s columns. Start from `pg_get_viewdef('pusher_chain_state'::regclass, true)`. It has **three readers outside Relay's screens** — Client Relations, Reporter and the Google Chat door — so a seventh definition checks all three and re-issues the revokes.
- **The `entry` lateral is the cold clock**: it anchors to the last event that ENTERED a leg, so neither a hand-off nor a client hold resets it. A new event kind that does not move the baton joins its exclusion list, or filing one launders the delay to zero.
- **Every write follows with `router.refresh()` on the client** — these pages render dynamically and the router cache keeps the old leg otherwise. Not inside a `useTransition` on a form that stays mounted: `isPending` greys the whole form while it runs.
- **The IST day lives in one place** (`lib/relay/day.ts`): elapsed days are IST calendar-day differences, and must agree with `at time zone 'Asia/Kolkata'` in the view. No test can catch a drift.
- **`fetchAll` where completeness matters** — a missing event silently changes the holder.
- **Anything audited needs an `id` column** — `audit_row()` reads `new.id` and fails at runtime otherwise.
- **Don't delete a chain unless it never started.** A mistaken trail is _finished_ with a note; `discard_chain()` works only on a queued one.
- **A trail files itself under a stage on creation** (`0065` trigger: a stage whose name matches, else the one the plan says today is in) — a default, never a lock. Anything creating a chain other than by an insert into `pusher_chains` must not skip it, or the trail is invisible on the project picture.
- **`replaceFutureLegs`, `editableFromLeg` and `scoreAll` are unused on purpose** — tested, not yet on a screen. Don't let a cleanup delete them.

**Drawing the project:**

- **A weighted total is a number, not a position** — never a bar growing from the left edge. Each stage fills its own block. The same trap waits for any leaderboard or dashboard.
- **One way to label a wave: `WaveStageHeader`**, inside the surface that holds the waves (`VillaWaveBoard`: one card, one axis, a villa per row). `WaveSvg` draws no names; two implementations meant a fix landed in one and shipped broken in the other.
- **Wave height is a count of open trails**, normalised to the busiest stage on the page — not a sum of expected days, or one slow activity would tower as "busy".
- **A queued stage is a low swell, never flat** (flat means finished), and a queued trail never shows a timer.
- **Unfiled work is counted aloud beside the wave**, never dropped. Villas with nothing are named together, not drawn as forty flat lines; the list sorts trouble-first.
- **The project page is waves, the stragglers panel and the linear plan bar** — the bar stays linear because it answers plan-against-actual. Draw SVGs uniformly (aspect ratio preserved).

## Not built yet

- **Unit stages and the map** — each unit stage maps to a project stage; quests, clearing a stage, a winding path with a "today" pennant. Build into the existing house screen, not a new page.
- **The game** — leaderboard, ranks, active days and the streak (`points.ts` is written and tested). Use the **clean streak**: a day counts if you neither ended it holding an overdue baton nor let one go overdue — reachable on a ten-day leg, derived from the log, nothing stored.
- **The seams** — `pusher_chain_links` surfaced both ways; outbound Chat notifications (fire-and-forget, never blocking a write; `lib/google-chat/PLAN.md`); `getRelayPulse()` grown into a dashboard feed.
