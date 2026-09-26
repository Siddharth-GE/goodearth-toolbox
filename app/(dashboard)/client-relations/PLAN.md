# Client Relations — the rules

The Saarang plot register, one record per villa, and **the only money coming in** anywhere in the app — a payment schedule with receipts against it. Grant `/client-relations`. Migrations `0050`, `0051`.

## The founder's decisions

1. **One list.** A prospect and a client are the same record at different stages; "added to the master" is the moment they are given a plot, so `clients` grew a lifecycle instead of a parallel table.
2. **A milestone schedule, not a single agreement value**, so "overdue" is answerable.
3. **Fixed vocabularies** for the sales and legal columns, so they can be counted and filtered.
4. **Design and site status come from Relay only**, never typed here — there is no design-status column and there must never be one.

## The rules everything rests on

1. **The grain is the plot; the list is client-first.** `client_engagements` hangs off `unit_id`; people are found by name, so the landing screen is clients. A client with two villas gets two cards.
2. **No `client_id` on an engagement** — the client is `units.client_id`; a second copy would drift.
3. **"Signed, Bank Original" is two columns**, so "sale deed signed" is one equality. A CHECK refuses a custodian on an unsigned deed.
4. **The nine payment stages are seeded; the invoice stage is derived** — the furthest rung with a date, never a stored position that could disagree with its rows.
5. **Each plot's dues are its own ledger.** An unallocated receipt spills into the oldest unpaid rung, so roll-ups add the answers, never the inputs (`combineSummaries`, tested) — or Villa 17's money would settle Villa 39's instalment.
6. **The whole tool is gated, SELECT included.** Money is one reason; `details` — notes about a family's bank and why they stall — is the stronger. Reporter and Financial Management read owner views whose **omission of the prose columns is the boundary**.
7. **Dates compare as ISO strings with `today` passed in.** `todayInIndia()` is the only clock read, and nothing pure calls it — Vercel's UTC and the office disagree about "today" for five and a half hours a day.

## Things that will bite

- **An embed through `units` to `plots` names the key** (`plots!units_plot_id_fkey`). This tool shipped four dead screens through a green CI that way (BUGCATCHER #2).
- **`crm_assign_unit` and `crm_release_unit` are `security definer`** — the `has_app` check in the body IS the boundary. Smoke-test them as a no-grant account.
- **`create_client_engagement`** may not be executed by any client role, and its body admits `/client-relations` **or** a call through the `units_seed_engagement` trigger — its real caller, firing for a `/masters` user. A plain `has_app` check would break adding a plot in Masters (BUGCATCHER #11).
- **It reads `pusher_chain_state` directly**, never `lib/relay/queries.ts` (every function there requires `/relay`). The small staff-name map is duplicated on purpose.
- **Two functions, not one with a null** (`0051`): the type generator cannot express a nullable uuid argument.
- **The bottleneck array needs two CHECKs** (`<@` allows duplicates and a NULL element), and `normaliseBottlenecks` dedupes and sorts before every write.
- **Checkboxes and dropdowns save immediately; text saves on blur.**
- **Five plots have no buyer**, so `plots/[engagementId]` is a standalone page rendering the same `EngagementCard`.

## Known costs, accepted

- **The Relay panel is empty for most plots** until trails are filed — the cost of decision 4, and it does not get better by adding a column here.
- **Relay knows whole-trail completion only** — "3 running, 1 stuck" is honest; "Foundation complete" would be a lie.
- **Most clients have a name and nothing else.** Blank is not a failed read. Joint names are one client; no co-applicant model without asking.
