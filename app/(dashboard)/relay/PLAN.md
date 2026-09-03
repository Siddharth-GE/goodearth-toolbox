# Relay — the rules

The relay layer for site and design. Read this before touching the tool.

Relay replaced the planned **Project Management** and **Design Management** tools — it is that whole layer, one module. Drawing approvals, selections handoffs, fire NOCs and site handovers are all just **activities**, tracked identically. It tracks **accountability only**: where a task is, with whom, for how long. The actual work stays deliberately off-app — nothing here stores a drawing, a decision or a document.

_Trimmed 2026-08-14: the per-migration log lives in git and in the migrations themselves._

## The model, in one paragraph

A **chain** (UI: "trail") is an ordered list of **activities**; each leg IS an activity, plus a person and a number of expected days (`0043` — "there needn't be sub legs to an activity"). A **trail type** (`pusher_trail_sets`) is a named trail with its activities fixed, so a whole villa's run lands in one click and only the people need choosing. The baton sits with exactly one person, who can **push** it forward one leg, **bounce** it back to any earlier leg (reason + note both mandatory), or **finish** it from the last leg. Time in a leg beyond its expected days is **stuck** (UI: "cold"). An admin can **hand** a baton to someone else without moving the trail — the rescue hatch when the holder has left. The holder can also say the work is **with the client** (`0064`) and take it back.

## With the client

`client_held` / `client_returned` (`0064`), same leg, same holder, note optional. Derived in the view from the last **flow** event — `started`, `pushed`, `bounced`, `client_held`, `client_returned` — so a push, bounce or finish clears the flag with nobody remembering to release it first.

- **The clock keeps running.** What changes is the sentence beside the number, not the number. Relay could already say a trail had sat eleven days; it could not say who it was actually waiting on, so the one figure a leader reads quietly blamed the wrong person. Pausing the clock would need the SQL view, `chain.ts` and the IST day maths to agree about accumulated intervals, and a disagreement between them is invisible — the same trap as the IST day itself.
- **A trail can be cold AND with a client.** Both badges show; cold is the louder one and takes the wave's crest.
- **`handed` is deliberately not a flow kind.** An admin reassigning the staff holder must not quietly take the work back from a client.
- **The guard cannot answer this from the last event row alone** — the one place Relay's usual doctrine does not hold, because a hand-off can sit on top of a hold. It runs one extra indexed `order by seq desc limit 1` over the flow kinds.
- **The guard snapshots the holder from the last EVENT, not the leg row.** Every other kind reads the leg row; doing that here would hand the baton back to whoever was originally staffed and silently undo an admin's hand-off.
- **A held baton stays in its holder's court**, with an amber chip. They are the one who chases the client; removing it from every court makes it nobody's problem.

## The three rules everything else follows from

1. **The event log is the state.** `pusher_chain_events` is append-only. Holder, stuck-ness, per-leg actuals and every flow point are derived by replaying it. There is deliberately **no status column, no current-leg column, no stored point total**. If you find yourself adding one, stop — you are about to create a second source of truth that will drift from the log within a week.
2. **Events snapshot what they need.** `to_assignee_id` and `to_expected_days` are stamped onto each event by the guard, read from the leg row at the moment the baton lands — the same doctrine as prices-snapshotted-at-pick-time. It is what makes a manager unable to retroactively change whether a past push was on time, and what lets the guard decide legality from the **last event row alone** rather than replaying in plpgsql.
3. **The trigger is the boundary; buttons are a courtesy.** `lib/relay/events.ts` mirrors the guard so the right buttons render. When the two disagree the database wins, and `guardError()` in `actions.ts` passes its message through intact — those messages were written to be read by a person.

## Two more that arrived later

**A trail can be in several departments at once.** A selections handoff is Design _and_ Purchase. That is why it is a join table and not a column — a single department would force a lie on exactly the trails worth watching.

**Dates are worked out, never typed.** The only stored inputs are a project's start date and each stage's length in weeks; every date on screen is calculated. Do not add a stored date "for convenience" — that is how inserting one stage silently orphans every date after it.

## Trail types and the queue

A type is a list of **activities**, never a frozen copy of people: the people come from the most recent leg of each activity at the moment the type is laid down, so a leaver's name cannot ride onto every new house forever.

**One trail, one clock.** The first cut of this made a set produce twelve trails on a house — twelve clocks started at once, so Handover at three expected days would have been cold within the week on work nobody meant to begin. One trail with twelve activity-legs has one baton and one clock, and the problem does not arise.

**A queued trail is a chain with no events**, which is why the queue needed almost no machinery: `open_chain()` split into `create_chain()` + `start_chain()`, and both `0036` guards already handled it. Queued work **counts in the project picture as planned-but-not-done** — laying a set down makes a project look further behind, and that is correct; the flattering number before it came from the work not being written down. **Anyone with `/relay` can start a queued trail**, matching what Open-a-trail has always allowed.

## Things that will bite

- **`pusher_chains` reaches `units` through two foreign keys** — `unit_id` and the `(project_id, unit_id)` composite. A bare `units(name)` embed is a PGRST201 at runtime. Always name it: `units!pusher_chains_unit_id_fkey(name)`.
- **Never rebuild `pusher_chain_state` from an older migration.** It has been defined in **six** files (`0036`, `0038`, `0039`, `0041`/`0042`, `0043`, `0064`) and a `create view` is a full replacement, not a patch. `0041` was written from `0036`'s copy and silently dropped the department columns `0038` had added, breaking All trails against the live database until `0042`. Always start from the live definition: `select pg_get_viewdef('pusher_chain_state'::regclass, true);` **It has three consumers outside Relay** — Client Relations, Reporter and the Google Chat door (`lib/google-chat/relay-reads.ts`) — so a seventh definition must check all three, and re-check the grants: `drop view` + `create view` resurrects Supabase's default write privileges every time.
- **The `entry` lateral is the cold clock.** It anchors to the last event that ENTERED a leg, which is why neither a hand-off nor a client hold can reset a cold trail's timer. Any new event kind that does not move the baton must be added to its exclusion list, or filing one launders the delay to zero. `0064` widened it from `<> 'handed'` to a three-kind not-in list, deliberately keeping the not-in form so every existing kind — including `completed`, which is why finished trails show a null `expected_days` — behaves exactly as before.
- **`revalidatePath` is not enough.** These pages render dynamically and the router cache holds their payload, so every write follows through with `router.refresh()` on the client. Without it the baton moves in the database and the screen keeps showing the old leg.
- **Don't put `router.refresh()` inside a `useTransition` on a form that stays mounted.** `isPending` stays true while the refresh is in flight and the whole form greys out. A plain boolean is the right tool.
- **A weighted total is a number, not a position.** Never draw one as a bar growing from the left edge. `actualPct` weights each stage by its length, so finishing one 40-week Construction trail is a big number — drawn from x=0 it painted straight over an untouched Design stage and claimed work nobody had done. Each stage fills in its own block. **The same trap waits for the leaderboard and the Dashboard.**
- **Draw uniformly.** The trail route SVG scales with its aspect ratio preserved; the first version stretched to fill its container and turned every node into a flat ellipse.
- **There is ONE way to label a wave: `WaveStageHeader`.** `WaveSvg` deliberately draws no stage names. It used to draw its own set at `lg`, centred and unclamped — so the overlap fix went into the header, the big wave on the house page kept the bug, and it shipped. Two implementations of the same thing means fixing it once is indistinguishable from fixing it.
- **The header lives INSIDE the surface that holds the wave, never floating on the page** (founder, 2026-08-14: "text flying around"). On the project page that surface is the `VillaWaveBoard` — one card, the axis written once across its top, every villa a row under the same ruled x. Separate cards with a page-level header strip was the first cut and it read as debris.
- **The project page shows waves, the stragglers panel, and the linear plan bar — nothing else.** "Trails by stage" (every trail listed under every stage) was removed by the founder's call: the waves say where the work is, a trail's own page is where it is acted on, and since `0065` the filing workbench had nothing left to do. The stage picker lives on the trail detail page now. The `ScheduleCard`/`SchedulePath` bar below the board stays LINEAR on purpose — it answers plan-against-actual, which a wave cannot; do not turn it into another wave.
- **A queued trail must never show a timer.** A `TimerDial` reading "0 of 4 days" looks like a clock that has started, which is precisely what the queue exists to avoid. Queued rows read "Waiting" / "not started". On a wave the same rule says a queued stage is a **low swell**, never flat — flat means finished.
- **The wave's height is a count of open trails, not a sum of expected days** (`lib/relay/wave.ts`). One forty-day Construction activity would otherwise tower over five one-day approvals, and the picture would say "Construction is busy" when it means "Construction is slow". Heights are normalised against the busiest single stage on the page, so a taller wave really does mean more open work than the villa above it. Per-stage height does **not** break the weighted-total rule: every hump is drawn inside its own stage's span, and nothing cumulative is drawn from the left edge.
- **A trail files itself under a stage on creation** (`0065`, `pusher_chains_file_stage`): a stage whose name matches the trail's own, else the stage the plan says today is in. Before this, `open_chain` left `project_stage_id` null and **nothing a person created could ever appear on the project picture** — six of Saarang's ten trails were invisible to the screen built to show them, and the only cure was a dropdown two screens away. It is a default, never a lock: an explicit stage on insert is left alone and the picker still moves it. **Anything that creates a chain by a route other than an insert into `pusher_chains` must not skip that trigger.**
- **Work not filed under a stage has no honest place on a wave**, so it is counted out loud beside it rather than dropped — a calm-looking wave with work missing from it is the flattering number this tool exists to remove. It should now be rare; if it is not, the filing trigger is being bypassed.
- **Villas with nothing filed are named together, not drawn.** Saarang has forty-three houses and four with work on them; thirty-nine identical flat lines would bury the four that matter. The wave list is sorted trouble-first — stuck, with client, moving, waiting, complete.
- **Anything audited needs an `id` column.** `audit_row()` reads `new.id` and raises at runtime otherwise — `0039` shipped a table without one and every write to it failed until `0040`. It typechecks and builds; only opening the page finds it.
- **Don't delete a chain — unless it never started.** Every chain that has run has history from its `started` event, and one opened by mistake is _finished_ with a note. The single exception (`0041` §9) is a queued trail, which has no events; `discard_chain()` refuses the instant one starts.
- **`fetchAll` where completeness matters** — a missing event silently changes who the holder is, which is worse than an error.
- **The IST day lives in one place** (`lib/relay/day.ts`). Vercel and Postgres both run UTC; the office is +05:30, and elapsed days are IST calendar-day differences, not 24-hour blocks. It must agree exactly with `at time zone 'Asia/Kolkata'` in the state view — **no test can catch a drift between them.**
- **`replaceFutureLegs`, `editableFromLeg` and `scoreAll` are unused on purpose** — tested write paths not yet wired to a screen. Don't let a cleanup delete them.

## Not built yet

- **Unit stages and the map.** Each unit stage maps to one project stage, which is how ground-truth progress rolls up into a macro timeline. Plus quests (a current stage with nothing running), clearing a finished stage, and the winding path with a pennant showing where the plan says today is. All additive. **Build into the existing house screen, don't add a page.**
- **The game.** Leaderboard, ranks, active days, and the streak. `points.ts` is written and tested.
  > **Use the clean streak, not the mockup's.** "Consecutive days you ended with an empty court" is unreachable for anyone on a ten-day leg — it punishes exactly the people doing the long work. A day counts if you neither ended it holding an overdue baton nor let one go overdue: reachable while on a long leg, breaks the moment you go cold, derived from the same log with nothing stored.
- **The seams.** `pusher_chain_links` surfaced both ways, Google Chat _notifications_ (fire-and-forget — never block a write on them; the inbound half, slash commands and buttons, is built — `lib/google-chat/`, which reads `pusher_chain_state` and writes through `open_chain` and `pusher_chain_events` **as the person**, so nothing in this tool changed for it and nothing here may import it), and `getRelayPulse()` grown into what the collated Dashboard reads.
