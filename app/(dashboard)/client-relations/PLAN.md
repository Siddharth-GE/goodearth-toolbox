# Client Relations — the rules

The Saarang plot register, one record per villa; every promise to a client as an action with an owner and a date; and **the only money coming in** anywhere in the app — a payment schedule with receipts against it. Grant `/client-relations`. Migrations `0050`, `0051`, `0120` (and Masters' `0119`, the build progress list).

## The founder's decisions

1. **One list.** A prospect and a client are the same record at different stages; "added to the master" is the moment they are given a plot, so `clients` grew a lifecycle instead of a parallel table.
2. **A milestone schedule, not a single agreement value**, so "overdue" is answerable. Plot payment is worked out from it, never typed — the Saarang tracker's "Completed / Pending – registration" word came in as a note.
3. **Fixed vocabularies** for the sales and legal columns, so they can be counted and filtered. Since `0120` they are the Saarang tracker's lists (deed and CA: not started, drafting, not signed, signed; the original with client, bank, Chess Cafe, Sreejayan or Tarana; five acknowledgements; seven bottlenecks; seven Kaadal stages).
4. **Design status from Relay — amended 2026-10-16** ("forget relay for this build do as needed"): Relay knows whole trails, never "ground floor slab", so the team now types **build progress** and the three **design checks** (client confirmed design, permit, working drawing). Relay's trails still show on a plot's page, read as they are.
5. **The Saarang tracker is the flow** (2026-10-16: "study this ui thats the flow they would love so integrate accordingly and edit the current tool to match the vibe"). The self-hosted tracker the CRM team used became this tool's Actions screen, Plots grid and plot page; every other screen took its look. Its paint did not: the toolbox's tones, Geist and its one green (DESIGN.md).
6. **Everyone with the grant sees everything** ("anyone with access can see is ok"). The tracker sent a team member only their own work; here a member opens on their own list and can switch to everyone's. Who opens on whose list is the screen's business, never a policy's.
7. **Build progress is a Masters list** ("construction stage lets make a masters table that lists it and then link it here") — `progress_stages`, beside, and not to be confused with, construction stages (Masters' `PLAN.md`).

## The rules everything rests on

1. **The grain is the plot; the list is client-first.** `client_engagements` hangs off `unit_id`; people are found by name. A client with two villas gets two lot cards.
2. **No `client_id` on an engagement** — the client is `units.client_id`; a second copy would drift.
3. **"Signed, Bank Original" is two columns**, so "sale deed signed" is one equality. A CHECK refuses a custodian on an unsigned deed; moving a deed off signed clears its custodian in the same write, so a chip never meets a constraint name.
4. **The nine payment stages are seeded; the invoice stage is derived** — the furthest rung with a date, never a stored position that could disagree with its rows.
5. **Each plot's dues are its own ledger.** An unallocated receipt spills into the oldest unpaid rung, so roll-ups add the answers, never the inputs (`combineSummaries`, tested) — or Villa 17's money would settle Villa 39's instalment.
6. **The whole tool is gated, SELECT included.** Money is one reason; `details`, and now every action's words and notes, are the stronger. Reporter and Financial Management read owner views whose **omission of the prose columns is the boundary** — actions never join a facts view.
7. **Dates compare as ISO strings with `today` passed in.** `todayInIndia()` (and `hourInIndia()` for the greeting) are the only clock reads, and nothing pure calls them.
8. **The tracker's rules live in `lib/client-relations/next-steps.ts`, pure and tested.** **No date is overdue** — an action without one sits with the overdue until someone gives it a real date. **Waiting on management outranks everything.** A sold plot with nothing open has **no next step**, unless it is handed over. **Not updated** is two weeks without a change to the plot or any of its actions.
9. **An action is never deleted** — `client_actions` has no DELETE policy; it is marked done, with Undo. `done_on` moves with the status in one CHECK. Any date a person picks clears _date assumed_.
10. **An action's owner is on the team** — `client_relations_team()`: active, non-admin people holding the grant. Every write checks it, so a step is never given to someone who could not see it. Admins are the managers: they clear "waiting on management" rather than own the list.
11. **Chips save when tapped; text saves when you leave the box.** One field per write (`updatePlot`, `updateNextStep`), the tracker's PATCH — there is no form to half-fill.
12. **Build progress reads its meaning from Masters' order**: the first stage is the paperwork before ground is broken (the rail's build step starts filling from the second); the last active stage is the handover.

## Things that will bite

- **An embed through `units` to `plots` names the key** (`plots!units_plot_id_fkey`, BUGCATCHER #2).
- **`client_engagements` has four FKs to `profiles`** (`crm_owner_id`, `kaadal_owner_id`, `created_by`, `updated_by`) and `client_actions` three: any embed of `profiles` through either names its key. The reads use a name map instead.
- **`crm_assign_unit`, `crm_release_unit` and `client_relations_team()` are `security definer`** — the `has_app` check in each body IS the boundary. Smoke-test them as a no-grant account.
- **`create_client_engagement`** may not be executed by any client role, and its body admits `/client-relations` **or** a call through the `units_seed_engagement` trigger — its real caller, firing for a `/masters` user. A plain `has_app` check would break adding a plot in Masters (BUGCATCHER #11).
- **It reads `pusher_chain_state` directly**, never `lib/relay/queries.ts` (every function there requires `/relay`). The small staff-name map is duplicated on purpose.
- **Two functions, not one with a null** (`0051`): the type generator cannot express a nullable uuid argument.
- **The bottleneck array needs two CHECKs** (`<@` allows duplicates and a NULL element), and `normaliseBottlenecks` dedupes and sorts before every write.
- **A plot's page sends its cards a slim set of fields** (`plotFields`), not the whole record — six client cards would otherwise each carry its actions, payments and Relay trails to the browser.
- **The board's shared data rides in one context** (`BoardProvider`): today, the team, every plot, each person's open count — handed down once, not repeated on every action card.
- **The import keys each action to `md5('saarang-tracker:<id>')`** — a second run adds nothing; never reuse that prefix for anything else.

## Known costs, accepted

- **No live refresh.** The tracker polled every 20 seconds; here a colleague's change shows on the next click, as in every tool.
- **Saarang West's configurations live in its villas' names** ("Villa 3 (1BHK Study)"), because Masters' unit type is only villa, apartment or duplex; the plot cards read it back from the name.
- **The Relay panel is empty for most plots** until trails are filed; the build stage no longer waits on it.
- **Most clients have a name and nothing else.** Blank is not a failed read. Joint names are one client; no co-applicant model without asking.
- **The import fills blanks only**, and leaves alone any plot whose buyer the tracker and Masters disagree on. On 2026-10-16 the founder ruled the tracker right ("some buyers cancel some new buyers have come"), and `scripts/update-saarang-register.ts` brought Masters in line first: cancelled buyers marked lost with the reason, new buyers assigned, Plots 33 and 34 made one, Saarang West's plots added.
