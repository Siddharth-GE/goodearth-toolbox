# Client Relations — build notes

**Status: M1–M3 shipped** (branch `feature/client-relations`, 2026-08-11).
Migrations `0050` + `0051`, both applied and both run twice to prove they are
re-runnable. Every founder decision: the four listed below, taken before a line
was written.

Client Relations replaces the Saarang tracking sheet — "Area and BUA, Overall
Sheet / To do list", 43 rows, one per plot. What that sheet holds and this tool
now holds instead: who the client is, who in the office is handling them, where
the sale deed and construction agreement have got to, who is holding each
original, what the plot is waiting on, and what has been invoiced. What the
sheet could **not** hold, and this adds: money coming in. Before this tool,
nothing anywhere in the app tracked a rupee arriving — `bills`,
`purchase_orders` and `po_billing_totals` are all payables.

The sheet's header row was arithmetic typed by hand — "Sale Count: 38", "Sale
deed: 29", "Const Agmt: 23", "Plots for registration 5 9 27 30 33 36 37 38 40".
Every one of those is now computed from the rows beneath it.

## The four founder decisions

1. **One list.** A prospect and a client are the same record at different
   stages, not two tables. "Added to the master" is the moment they are given a
   plot. So `clients` grew a lifecycle instead of CRM growing a parallel table
   — no second list to maintain, no re-entering details at conversion.
2. **A milestone schedule, not a single agreement value**, so due dates exist
   and "overdue" is answerable at all.
3. **Fixed vocabularies** for the sales and legal columns, so they can be
   counted and filtered rather than read.
4. **Design and site status come from Relay only**, never typed here.

Decisions 3 and 4 overlapped on the sheet's "Design Verification" column. 4 is
the later and more specific instruction, so it won: **there is no design-status
column anywhere, and there must never be one.**

## The rules everything rests on

1. **The grain is the plot, the list is client-first.** Every tracked column on
   the sheet is a fact about one villa's sale, so `client_engagements` hangs off
   `unit_id`. But people are found by name, so the landing screen is the client
   list. A client with two villas — Saarang has one, "Satheesh and Aruna",
   plots 17 and 39 — gets two engagement cards on one page.
2. **No `client_id` on an engagement.** The client is `units.client_id`. A
   second copy on the one table whose whole purpose is knowing who owns what
   would drift, and the saved join is not worth it.
3. **"Signed, Bank Original" is two facts, stored as two columns.** As one enum
   the founder's "Sale deed: 29" is a three-way OR today and a four-way OR the
   day a fourth custodian appears. Split, it is one equality. A database CHECK
   refuses a custodian on an unsigned deed, and the dropdown clears the one when
   you change the other so the two can never argue.
4. **The nine payment stages are seeded, and the invoice stage is derived.**
   `create_client_engagement` inserts all nine rungs with the engagement, so
   Collections is a fixed grid you fill in rather than a list you build — the
   shape the sheet already had. "Current Stage of Invoice Raising" is then
   computed as the furthest rung with a date, because a stored ladder position
   and the rows behind it can disagree and nothing then says which one lied.
5. **Each plot's dues are its own ledger.** An unallocated receipt spills into
   the oldest unpaid rung, so rolling up by merging several plots' milestones
   would let money received on Villa 17 settle Villa 39's overdue instalment.
   `combineSummaries` adds the answers, never the inputs. There is a test.
6. **The whole tool is RLS-gated, SELECT included.** Money is the obvious
   reason; `details` is the stronger one — it holds notes about a family's bank
   and why they are stalling. That is not company-wide reading. Gating SELECT
   also means **no fact view exists and there is no second SELECT policy to get
   wrong**: nothing outside this tool reads this tool.
7. **Dates are compared as ISO strings with `today` passed in.** Vercel runs in
   UTC and the people using this do not; for five and a half hours a day the two
   disagree about what "today" is, and "overdue" must not depend on who asked.
   `todayInIndia()` is the only clock read, and nothing pure calls it.

## Milestones

- [x] **M1 — the register.** `0050` applied, types committed, tool flipped to
      `built: true`. Clients list with search, stage and owner filters on a real
      count; the plot register with the sheet's fourteen columns as badges and
      its header figures computed; sale and agreement fields edited in place on
      blur.
      _Gate: founder opens a real Saarang plot, changes its sale deed status, reloads, and it stuck._
- [x] **M2 — collections.** The nine-rung schedule per plot, receipts recorded
      against a rung or against none, outstanding and overdue computed, and the
      Collections board across every plot with overdue first.
      _Gate: founder records a real payment and both the plot's outstanding and the Collections total move by that amount._
- [x] **M3 — prospects and Relay.** Stage on every person, the prospect form,
      Assign a plot writing through `crm_assign_unit`, and the Relay panel with
      its honest empty state.
      _Gate: founder adds a prospect, assigns them a plot, and it shows against them in Masters._

## Notes

- **The Relay panel is empty for most plots, and that is the known cost of
  decision 4.** Measured the day this shipped: 4 of 43 villas had any trail
  filed (6 trails total), 3 units had an issued selection. The empty state says
  so and links to Relay. It gets better as the team files trails; it does not
  get better by adding a column here.
- **Relay exposes `is_finished` for a whole trail only.** There is no
  per-activity completion anywhere, and `project_stages` is per-project rather
  than per-villa (`0039` deferred that deliberately). "3 running, 1 stuck" is
  honest. "Foundation complete" would be a lie, and the panel is written to
  make that lie hard to add later.
- **The `plots` embed must name its foreign key: `plots!units_plot_id_fkey`.**
  `units` has had two FKs to `plots` since `0029` — the plain one and the
  composite `units_plot_same_project` guard — so a bare `plots(...)` embed
  through `units` is ambiguous and PostgREST answers HTTP 300 PGRST201. It
  shipped broken: the plot register, both detail pages and Collections all
  died on the error boundary while `format → lint → typecheck → test → build`
  was fully green. **Nothing local catches this class of bug** — it is not a
  type error, `next build` compiles it, and the tests are pure logic with no
  database. Other tools embed `plots(name)` safely because they hang it off
  `bills`/`indents`/`purchase_orders`, which have one FK each; only a path
  through `units` is ambiguous. The only real check is running the query.
- **`lib/relay/queries.ts` is unusable from here** — every function in it opens
  `requireTool("/relay")`, and one tool never imports another tool's code.
  `getRelayForUnits` reads `pusher_chain_state` directly, which is granted to
  `authenticated` with no app gate of its own (`0043`). The ten-line staff-name
  map is duplicated rather than imported, on purpose.
- **`security definer` means the `has_app` check in the body IS the boundary.**
  `crm_assign_unit`, `crm_release_unit` and `create_client_engagement` all
  bypass RLS by design. Delete a guard and any signed-in user can reassign every
  villa in the company. Smoke-test them as a no-grant account, not just as an
  admin — an admin passes everything and never sees a grant bug.
- **`0051` exists because the type generator cannot express a nullable uuid
  argument.** Releasing a plot was meant to be `crm_assign_unit` with a null
  client; `supabase gen types` emits `p_client_id: string` regardless, so the
  only way to call it was a cast that lies. Two functions, two unambiguous
  signatures instead.
- **The bottleneck array needs two CHECKs, not one.** `<@` permits duplicates
  and permits a NULL element, so `array_position(bottlenecks, null) is null`
  sits beside it, and `normaliseBottlenecks` dedupes and sorts before every
  write — otherwise `{payments,design}` and `{design,payments}` render
  differently for two identical plots.
- **Bottlenecks and dropdowns save immediately; text saves on blur.** A
  checkbox produces no blur a mouse user would notice, and a `<select>` a person
  changes and then clicks away from produces one too late to trust.
- **Saarang's 35 clients have a name and nothing else** — no mobile, no email.
  Most of the contact card is a dash on purpose. Blank is not a failed read.
- **Joint names are one client** ("Chandra and Preethi", "Harman & Aman Pal").
  Free text, no first/last split, no co-applicant model. Nobody should add one
  without asking.
- **Five plots have no buyer**, so `/client-relations/plots/[engagementId]`
  exists as a standalone page — the register must open something on every row,
  and those five have no client page to land on. It renders the same
  `EngagementCard` as the client page so the two cannot drift.
