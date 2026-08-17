# Client Relations — the rules

**Shipped 2026-08-11.** Migrations `0050` + `0051`. Replaces the Saarang tracking sheet — 43 rows, one per plot — and adds what that sheet could not hold: **money coming in.** Before this tool, nothing anywhere in the app tracked a rupee arriving; `bills`, `purchase_orders` and `po_billing_totals` are all payables.

_Trimmed 2026-08-14: the milestone log and the sheet-column mapping live in git._

## The four founder decisions

1. **One list.** A prospect and a client are the same record at different stages, not two tables. "Added to the master" is the moment they are given a plot — so `clients` grew a lifecycle instead of CRM growing a parallel table.
2. **A milestone schedule, not a single agreement value**, so due dates exist and "overdue" is answerable at all.
3. **Fixed vocabularies** for the sales and legal columns, so they can be counted and filtered rather than read.
4. **Design and site status come from Relay only**, never typed here.

Decisions 3 and 4 overlapped on the sheet's "Design Verification" column. 4 is later and more specific, so it won: **there is no design-status column anywhere, and there must never be one.**

## The rules everything rests on

1. **The grain is the plot, the list is client-first.** Every tracked column on the sheet is a fact about one villa's sale, so `client_engagements` hangs off `unit_id`. But people are found by name, so the landing screen is the client list. A client with two villas gets two engagement cards on one page.
2. **No `client_id` on an engagement.** The client is `units.client_id`. A second copy on the one table whose whole purpose is knowing who owns what would drift.
3. **"Signed, Bank Original" is two facts, stored as two columns.** As one enum, "Sale deed: 29" is a three-way OR today and a four-way OR the day a fourth custodian appears. Split, it is one equality. A CHECK refuses a custodian on an unsigned deed, and the dropdown clears the one when you change the other so the two can never argue.
4. **The nine payment stages are seeded, and the invoice stage is derived.** `create_client_engagement` inserts all nine rungs with the engagement, so Collections is a fixed grid you fill in rather than a list you build. The current invoice stage is computed as the furthest rung with a date, because a stored ladder position and the rows behind it can disagree and nothing then says which one lied.
5. **Each plot's dues are its own ledger.** An unallocated receipt spills into the oldest unpaid rung, so rolling up by merging several plots' milestones would let money received on Villa 17 settle Villa 39's overdue instalment. `combineSummaries` adds the answers, never the inputs. There is a test.
6. **The whole tool is RLS-gated, SELECT included.** Money is the obvious reason; `details` is the stronger one — it holds notes about a family's bank and why they are stalling. That is not company-wide reading. Reporter and Financial Management reach the money through owner views whose **omission of the prose columns is the boundary**; they never read these tables.
7. **Dates are compared as ISO strings with `today` passed in.** Vercel runs in UTC and the people using this do not; for five and a half hours a day the two disagree about what "today" is, and "overdue" must not depend on who asked. `todayInIndia()` is the only clock read, and nothing pure calls it.

## Things that will bite

- **The `plots` embed must name its foreign key: `plots!units_plot_id_fkey`.** `units` has had two FKs to `plots` since `0029`, so a bare `plots(...)` embed through `units` is ambiguous and PostgREST answers HTTP 300 PGRST201. **It shipped broken**: the plot register, both detail pages and Collections all died on the error boundary while `format → lint → typecheck → test → build` was fully green. **Nothing local catches this class of bug.** Other tools embed `plots(name)` safely because they hang it off `bills`/`indents`/`purchase_orders`, which have one FK each; only a path through `units` is ambiguous. The only real check is running the query.
- **`security definer` means the `has_app` check in the body IS the boundary.** `crm_assign_unit` and `crm_release_unit` bypass RLS by design — delete a guard and any signed-in user can reassign every villa in the company. Smoke-test them as a no-grant account, not as an admin.
- **`create_client_engagement` is the odd one, and `0071` is why.** It had no check at all (`AUDIT.md` SEC-02, closed 2026-08-17) and now carries two: no client role may execute it, and its body refuses unless the caller holds `/client-relations` **or** the call came through a trigger. That last clause is load-bearing — the function's real caller is the `units_seed_engagement` trigger, firing for a person who holds `/masters`, and `security definer` does **not** make `auth.uid()` the definer. A plain `has_app` check here breaks adding a plot in Masters. `BUGCATCHER.md` #11.
- **`lib/relay/queries.ts` is unusable from here** — every function in it opens `requireTool("/relay")`, and one tool never imports another tool's code. `getRelayForUnits` reads `pusher_chain_state` directly. The ten-line staff-name map is duplicated rather than imported, on purpose.
- **`0051` exists because the type generator cannot express a nullable uuid argument.** Releasing a plot was meant to be `crm_assign_unit` with a null client; `supabase gen types` emits `p_client_id: string` regardless, so the only way to call it was a cast that lies. Two functions, two unambiguous signatures instead.
- **The bottleneck array needs two CHECKs, not one.** `<@` permits duplicates and permits a NULL element, so `array_position(bottlenecks, null) is null` sits beside it, and `normaliseBottlenecks` dedupes and sorts before every write — otherwise `{payments,design}` and `{design,payments}` render differently for two identical plots.
- **Bottlenecks and dropdowns save immediately; text saves on blur.** A checkbox produces no blur a mouse user would notice, and a `<select>` a person changes and then clicks away from produces one too late to trust.
- **Five plots have no buyer**, so `/client-relations/plots/[engagementId]` exists as a standalone page — the register must open something on every row. It renders the same `EngagementCard` as the client page so the two cannot drift.

## Known costs, accepted

- **The Relay panel is empty for most plots** — the known cost of decision 4. Measured the day this shipped: 4 of 43 villas had any trail filed, 3 units had an issued selection. The empty state says so and links to Relay. It gets better as the team files trails; it does not get better by adding a column here.
- **Relay exposes `is_finished` for a whole trail only.** There is no per-activity completion anywhere. "3 running, 1 stuck" is honest; "Foundation complete" would be a lie, and the panel is written to make that lie hard to add later.
- **Saarang's 35 clients have a name and nothing else** — no mobile, no email. Most of the contact card is a dash on purpose. **Blank is not a failed read.**
- **Joint names are one client** ("Chandra and Preethi"). Free text, no first/last split, no co-applicant model. Nobody should add one without asking.
