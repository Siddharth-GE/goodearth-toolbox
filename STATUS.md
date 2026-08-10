# Goodearth Toolbox — status & session log

Where we are: what's shipped, settled decisions, the session log.
Updated at the end of every session; finished work moves here from
`TODO.md`. Per-tool detail lives in each tool's `PLAN.md`; durable
rules in `CLAUDE.md`; full history in git. Stays lean by design.

## Now

**Phases 1–8 shipped** (Masters → Selections → Budgets → Indents →
Purchase Orders → Inventory → Bills, the last merged 2026-08-04 after
the founder's browser gates and the single-grant probe smoke). The
chain runs design → price → indent → PO → goods in / stock / goods
out → bill → paid.

**Pusher is built through the project schedule** on
`feature/pusher-relay` (**PR #2, CI green, NOT merged**): the relay,
departments (many per trail), and a per-project overview whose dates are
all calculated. It is **waiting on the founder's browser pass** — see
TODO.md, which opens with that. **Next after the merge:** unit-level
stages rolling up into the project picture, then the leaderboard, then
links + Google Chat.

Note for a cold start: migrations `0036`–`0040` are **already applied to
the live database**, so schema is in step with production and only the
code is unmerged. The branch's test data has been cleared and the probe
account put back to `/inventory`.

|                    |                                                                                                                                 |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| Last worked        | 2026-08-10                                                                                                                      |
| Branch             | `feature/pusher-relay` — built, CI green, PR #2 open, not merged                                                                |
| Migrations applied | `0001`–`0040` (next is `0041`)                                                                                                  |
| Items in database  | 2,633 (2,631 imported catalogue + 2 material seeds); 14 categories / 21 brands                                                  |
| Thumbnails         | 897 in Supabase Storage; 1,736 items use the colour placeholder                                                                 |
| Built tools        | Marathon, Settings, Masters, Selections, Budgets (Interiors + Construction), Indents, Purchase Orders, Inventory, Bills, Pusher |
| Tests              | `npm test` — 186, all pure logic                                                                                                |

## Next up

- **Load the founder's master data** — clients, plots, units, from
  spreadsheets, the `scripts/import-catalogue.ts` way (re-runnable,
  dry-run default, skip existing, verify counts). Watch: plots/units
  need their project per row and `unique (project_id, name)` holds;
  since `0029` **every unit needs its plot** (create plots first, pair
  1:1 — a double link fails loudly on the unique index); the
  project/plot **status value lists are my defaults, never
  confirmed** — ask first. Source files go in `data/` (git-ignored).
- **Grant `/bills`** in Settings to accounts (and tick their "Approve
  bills" box), **`/inventory`** to store-keepers (and site engineers if
  wanted — its reads carry no money).
- **Letterhead assets** — logo, address, GST number, PO terms → swap
  into `lib/pdf/document.tsx`'s `Letterhead` (one place); a Geist
  `.ttf` registered there lifts every PDF at once.
- **Set up the real roles** once the Masters & Settings branch merges —
  Site Engineer, Purchase, Accounts, and whatever else matches how the
  office actually splits work; then assign a role instead of ticking
  apps one at a time.
- Smaller, any session: Selections paste-from-Excel; database clean-up
  once rolling (test indents `IND/SAA/001`–`005`, the inert probe
  account — both need SQL in Studio, the app refuses by design).

## Decisions locked in

- **Pusher replaces Project Management and Design Management** (founder,
  2026-08-10). One module is the whole design- and project-management
  layer; both stubs are deleted, their slugs left inert in the CHECKs.
  UI keeps the shared nouns **Project** and **Unit** — a villa must not
  be a "Unit" in Selections and a "Territory" here — and uses game words
  only for Pusher's own ideas (trail, baton, leg, cold, flow). Code and
  data speak plainly throughout: chain, leg, stuck, points.
- **Pusher dates are worked out, never typed** (founder, 2026-08-10).
  The only stored inputs are a project's start date and each stage's
  length in weeks; every date on screen is calculated on read. Inserting
  a stage moves every later date by itself, and no two dates can
  contradict each other. **A trail can be in several departments at
  once** — cross-department is the normal case, so it is a join table.
- **Pusher's event log IS its state.** No status column, no stored
  holder, no stored points — all derived by replay. Events snapshot the
  assignee and expected days at the moment the baton lands, which is what
  stops a leg edit rewriting whether a past push was on time, and what
  lets the guard rule on a new event from the last event row alone.
  Bouncing is rewarded (+5) and never punished; it is impossible without
  a reason and a note, at the database. Expected days are whole days,
  because elapsed time is counted in **IST calendar days**.
- One `items` table for products and materials, split by `kind`.
- Prices are **snapshotted onto lines at pick time**; master edits
  never rewrite existing lines. Same principle for PO `gst_pct`.
- An issued selection revision is **immutable** (trigger, `0006`); no
  soft deletes anywhere — history is revisions + the audit log.
- `line_key` is a line's cross-revision identity; Budgets prices
  against it; downstream anchors use `(budget_id, line_key)`.
- Margin is `/budgets`-only, PO money `/purchase-orders`-only; the only
  sanctioned windows are the `approved_*` and `po_*facts` views (see
  CLAUDE.md — column lists are the boundary).
- Indents carry no money; numbered `IND/<project code>/NNN`, minted in
  the database, gaps accepted; **approved is terminal** — no delete.
- Construction plans are materials + quantities only — free-form
  stages, no approval, one living plan per unit, QS-owned.
- Approvers (indents and bills) are named lists managed in Settings,
  enforced by DB guards — **triggers are the boundary, buttons are a
  courtesy**.
- POs come from approved indents only; one vendor + one plot/unit
  ("GEN" for general); `PO/<project>/<scope>/NNN` minted per scope.
  Over-ordering is impossible at the database (unique + advisory-lock
  guard); a PO line's uom is locked to its indent line's.
- Deleting an issued PO is request → admin approves, trigger-enforced.
- Bills (Phase 8, 2026-08-04): a bill is one of **three kinds** — an
  issued PO, an **approved** labour contract, or **NMR daily wages**
  (no anchor, vendor optional — nothing when the muster roll is paid
  directly); numbered `BILL/<project>/<scope>/NNN`, the scope derived
  from the anchor (NMR picks it directly); amounts stored **as
  entered** from the paper (no total-equals-sum CHECK); over-billing
  **warns, never blocks** (NMR never warns — no ceiling exists);
  **self-approval allowed**; paying needs one free-text `payment_ref`;
  "Unpaid" = `status <> 'paid'`; recorded bills are recorder-or-admin
  deletable, approved/paid are permanent. **Labour contracts live in
  the Bills tool** (`/bills/contracts`, moved out of Masters in 0026):
  any `/bills` holder records one, a bill approver or admin approves
  it, terms lock on approval, deactivating is the off-switch. Bill
  money is `/bills`-gated; the windows are `bill_facts` (money-free,
  open) and `po_billing_totals` (`/purchase-orders` OR `/bills`, one
  totals row per PO).
- Attribution everywhere: `components/ui/attribution.tsx` + stamp
  `updated_by`.
- **Plot ↔ unit is strictly 1:1** (founder, 2026-08-04; migration
  `0029`): every unit sits on exactly one plot, one unit per plot,
  same project both sides. Forms ask one "For" question via the shared
  `SitePicker` (`components/masters/site-picker.tsx` +
  `lib/masters/site-options.ts`) — a pair submits the unit id, a
  unit-less plot the plot id, so scope codes and RPCs are untouched.
  Stock folds 'unit' rows into their plot. Every-plot-has-a-unit is
  the soft side — surfaced on the plots list, not DB-enforced.
- Item codes are 4-letter sub-type + 3 digits (`BENS001`); nothing
  auto-generates today — any future generator follows this, not
  categories.
- Images: grid tiles load `thumb_url` only (ours, in Storage);
  `image_url` stays a borrowed vendor link (no `remotePatterns` entry
  yet, deliberate); 1,736 image-less items use the `color-hash`
  placeholder — the majority case, designed for. Image fetching is
  never bundled into a data import.
- The three documents: **A** design document (Selections, no prices,
  client) · **B** budget sheet (cost + margin, internal) · **C** client
  quote (client rates only). C renders from `QuoteData`
  (`lib/budgets/quote.ts`), which has **no cost/margin fields** — a
  template mistake is a compile error, not a leaked margin.

## Open decisions — ask at the phase that needs them

- Phase 2 (dormant): can a design start on an unsold unit?
- From Phase 1: the project/plot/unit status value lists (defaults,
  unconfirmed — see master-data load above).

## Deferred, with the trigger for revisiting

- `audit_log` retention — revisit past a few million rows.
- Actions trust their inputs' relationships (DB constraints are the
  boundary; ~200 trusted staff) — revisit only if outsiders arrive.
- Actor FKs are `NO ACTION` so past actors can't be deleted from auth —
  flip to `on delete set null` when offboarding first needs it.
- `space_views` storage orphans (deleted spaces leave JPEGs) — someday.
- Two accepted races: `moveSpaceView` sort swap (self-heals) and
  Marathon PIN lockout (fix rides the next Marathon migration).
- **Inventory's partial-write window.** A goods receipt (and a stock
  issue) mints its header in an RPC, then inserts lines one at a time so
  the over-receipt / negative-stock guard can name the line it refused.
  A refusal part-way therefore leaves a note holding fewer lines than
  arrived, and nothing can add lines to it afterwards — the recovery is
  a second receipt against the same PO, which the guards make safe, and
  which the message now says. Folding the lines into the RPC would close
  the window but lose the per-line refusal. Revisit if a store-keeper
  actually hits it.
- `lib/selections/views.ts` stays put until a third consumer appears.
- Full CI browser smoke **costed and declined** (2026-08-03);
  `check:actions` covers the known outage class — revisit only if a
  different runtime action failure reaches production.

## Environment & working notes

- Production: `goodearth-toolbox.vercel.app`. Post-deploy and pre-merge
  verification habits are in CLAUDE.md (probe-user smoke, the
  write-button press).
- Migrations are applied from this machine since 2026-08-04: the
  `toolbox-cli` personal access token sits in git-ignored `.env.local`
  (`SUPABASE_ACCESS_TOKEN`); POST the SQL to the management API's
  `/database/query` endpoint (what Studio's editor does), verify with
  an information_schema count, then `npm run db:types`. Use Node for
  the request — PowerShell's Invoke-RestMethod mangles large JSON
  bodies. Revoke/rotate the token from the Supabase dashboard anytime.
- **Preview deployments sit behind Vercel's SSO wall** — a preview URL
  302s to `vercel.com/sso-api` unless that browser is signed into
  Vercel. So the two-browser probe smoke can't put the probe in a
  private window on a preview: use the private window for **production**
  and your own Vercel-authenticated browser for the preview.
- **The probe's password is never stored.** Set a throwaway one via the
  auth admin API each time (`PUT /auth/v1/admin/users/<id>` with the
  service-role key). Its `@goodearth.test` domain is not real, so
  password-recovery and magic-link emails can never arrive — the
  dashboard's user menu only offers those, and won't get you in.
- **The probe smoke DID run on 2026-08-10**, twice — the password reset
  via the auth admin API was not blocked this time, unlike the two
  sessions before it. So the block is not permanent; try it before
  assuming a browser pass is impossible. Both runs drove the local
  production build as a `/pusher`-only user.
- A three-line Node script that POSTs a `.sql` file to the management
  API's `/database/query` is the whole migration workflow; keep it in the
  session scratchpad. Two traps when generating SQL through JavaScript:
  `String.replace` treats `$$` in the replacement as an escape and will
  silently turn `do $$` into `do $`, and `LIKE 'pusher_%dept%'` is not a
  reliable way to check a table list.
- Pre-push smoke: Playwright installed in the session scratchpad,
  `npm run build && npm start`, drive localhost as the probe user
  (reset its password via the auth admin API; never stored).
- `sharp` can't load its win32 binary locally — Selections' upload
  action fails **locally only**; Vercel is fine. Not an app bug.
- `npm test`'s glob is shell-dependent — check that before assuming
  green. Git Bash rewrites `/budgets`-style args into Windows paths —
  use PowerShell for REST calls with app slugs.
- **CI stops at the first failing step, and Lint is second.** A green
  push is not a green build — two apostrophes hid the whole gate for
  five days. `gh run list` after pushing.
- Lessons that stuck: Server Actions are wrong for reads (catalogue
  search is a Route Handler) and cap bodies at 1 MB; Storage has its
  own RLS and service-role checks prove nothing about real users;
  Postgres view columns come back nullable from the type generator —
  normalise at the read boundary; on Windows kill servers by port, not
  `pkill`; audited tables need a surrogate `id`; PDFs print digits-only
  (`formatAmount` — Helvetica has no ₹).

## Session log

One line per day; full detail in git history and the PLAN.md files.

- **2026-08-10 (Pusher — departments and the project schedule)** — same
  branch, migrations `0038`–`0040` applied. The founder added two things
  to the relay. **Departments**, with the correction that makes the
  design: "a trail can be cross department as well" — so it is a
  many-to-many join, not a column, because a selections handoff really is
  Design _and_ Purchase and a single department would force a lie on
  exactly the trails worth watching. They prefill from the activity's
  last run alongside the legs, sit on the state view as arrays so
  "every cold Design trail" is one server-side filter, and freeze when a
  trail finishes. Six seeded, all renameable. **The project schedule**,
  where the founder chose "dates are worked out, never typed": the only
  stored inputs are a project's start date and each stage's length in
  weeks, and every date on screen is calculated on read. Stretch Design
  from 10 weeks to 20 and Approvals, Construction and Handover all move
  by themselves; two dates can never contradict each other. The overview
  compares work done (weighted by stage length, with partial credit for a
  stage in progress) against plan elapsed — the gap is the slip — and
  calls out trails filed under no stage rather than letting them count
  for nothing silently. 15 new tests on the calculation.
  **Two bugs the browser found and nothing else would have:** `0039`
  attached `audit_row()` to a table with no `id` column, so every write
  to it raised and no schedule could be saved at all — it typechecks, it
  builds, the SQL is valid (`0040` adds the surrogate id, the 0018/0031
  precedent); and `router.refresh()` inside a `useTransition` left
  `isPending` true on a form that stays mounted, greying out the whole
  schedule editor permanently. A sweep confirmed no other audited table
  lacks an `id`. Note for whoever reads this next: the Playwright script
  kept asserting faster than the page could redraw, so four of its checks
  read as failures — each was verified correct directly against the
  database instead. Trust the database check, not that script's tail.
- **2026-08-10 (Pusher Phase 1 — the relay)** — built on
  `feature/pusher-relay`, migrations `0036`–`0037` applied. The founder
  brought a concept and a working mockup for **Pusher**, and it
  supersedes two planned Management tools: it is the whole design- and
  project-management layer, one module. A trail is a task with ordered
  legs, each a person plus expected days; the baton sits with one person
  who can push, bounce (reason + note mandatory) or finish it. Past its
  expected days it goes **cold**, loudly, everywhere.
  **The event log is the state** — every guard rule, and the ability to
  rule on a new event from the last event row alone, falls out of events
  snapshotting the assignee and expected days when the baton lands. All
  18 guard rules were exercised against the live database in a rolled-back
  transaction before a line of app code was written: a non-holder cannot
  push, a stale `from_leg` is refused by name, a bounce with no reason or
  a whitespace note is impossible, the log cannot be edited or deleted
  even by the owner, and the current leg cannot be restretched.
  Four pure modules (`day`, `events`, `chain`, `points`) carry 35 of the
  tests; `day.ts` exists because Vercel and Postgres run UTC and the
  office is +05:30, which is wrong in the _other_ direction for five and
  a half hours of every day. **Driving the running app found three things
  no test would have:** the route SVG was stretched into flat ellipses,
  the leg list read across instead of down, and — the serious one —
  `revalidatePath` left the mover's own page showing the old leg after a
  successful push, now fixed with `router.refresh()` on every write.
  A single-grant probe smoke (30 checks, `/pusher` only) passed against
  the production build, including both bounce refusals, the full
  push/bounce/push/push/finish relay and no sideways scroll at 390px.
  DESIGN.md gains Pusher as its **one stated motion exception** (a stuck
  trail breathes rather than blinks) and, with it, the app's first
  `prefers-reduced-motion` guard — which covers every tool, not just this
  one. Phases 2–4 (stages and the map, the leaderboard, links + Google
  Chat) are in TODO.md.
- **2026-08-10 (independence audit — kernel failure modes)** — audited
  the whole repo against the toolbox doctrine; merged to `master` (PR #1)
  after the founder reproduced the redirect loop on production and
  confirmed the fix on the preview. **The tool boundaries hold:**
  the only cross-tool imports in the app are the two sanctioned ones
  (overview→marathon, budgets quote→selections views), every cross-tool
  table touch is a `SELECT`, the service-role client appears only in
  Marathon and `inviteUser`, and every sequential number is minted in
  plpgsql under a counter row lock. Every finding was in the **shared
  kernel's failure modes**. The live one: `dal.ts` answered a failed
  profile read with `redirect("/login")` while `proxy.ts` bounced any
  session-holder off `/login` back to `/` — an unbounded redirect loop
  ending in `ERR_TOO_MANY_REDIRECTS`, the whole toolbox unreachable, and
  **reachable today by switching off a signed-in colleague** (setActive
  flips a flag and leaves the session alive). Same class as the
  2026-08-05 login loop; that fix added logging and left the mechanism.
  (Housekeeping: the laptop resumed from a 5-day sleep with a stale
  clock, so the first eight commits on this branch are stamped
  2026-08-05. Windows resynced itself mid-session; nothing to fix.)
  A read error now throws, and the `/login` bounce is deleted, so the
  two real turn-aways reach the login page — where the login action
  already names a deactivated account. Also: the home page no longer
  dies with Marathon's service-role env var; **`fetchAll` returns rows
  and throws** instead of handing back a partial array with an error
  only 4 of ~70 call sites checked (net 13 lines fewer); the
  half-recorded-delivery message stopped telling store-keepers to "open
  it to finish" when nothing can; one round trip off the Settings person
  page; and the cross-tool read contract is now a table in CLAUDE.md.
  **CI had been red on every push to master since 2026-08-04** — two
  unescaped apostrophes failing the Lint step, which runs second, so
  Types, Tests, Build and `check:actions` never ran for days; fixed, and
  PR #1 is the first all-green run since. The founder's call on the six
  illustrative Overview cards: leave them (Phase 9 makes them real).
  The authenticated smoke did NOT run — the probe password reset was
  again blocked by the assistant's permission mode — so the redirect
  loop is proven by code path and CI, not by a browser.
- **2026-08-05 (masters & settings upgrade)** — merged to `master`.
  Seven shippable pieces plus two fixes, migrations `0031`–`0035`.
  **Masters:** the last admins-only write (gst_rates) fixed, audit
  trails and `updated_at`/`updated_by` on every master, an off-switch
  for clients/categories/brands, search + filters + paging on vendors /
  clients / plots / units, and detail pages for vendors, clients and
  projects reading only the money-free views. **Settings:** the one
  wide checkbox matrix became People / Roles / Overview — a page per
  person with grouped apps, approval rights and an access history from
  `audit_log`; invite (the one sanctioned service-role call) and
  deactivate, with the last active admin protected at the database;
  bill approval **limits**; and **role templates**, where `has_app()`
  learned about bundles so ~80 RLS policies followed with no policy
  edits. Backward compatibility checked against the live database by
  impersonating each real user. **Two fixes after the founder's
  browser test:** the `roles` embed was ambiguous (three FKs back to
  `profiles`), which made every signed-in person look like nobody and
  produced a login redirect loop — the query now names the FK, and a
  failed profile read is logged rather than silently signing someone
  out; and role-granted approval rights reached the database but not
  the buttons, so the bill and indent deciders now call the same
  `can_approve_*` functions the guards do (`0035` also closes those
  helpers to `anon`). A 4-minute Vercel build was investigated and
  ruled a queue blip — the eight builds around it all ran ~60s.
- **2026-08-04 (management group)** — the founder set the vision for
  the next layer: a **Management** sidebar group above Operations with
  six Coming Soon tools — Dashboard (a leadership view, distinct from
  Overview), Project Management, Design Management, Client Relations,
  Financial Management, Business Planning
  (`feature/management-group`). Each is a registry entry + stub route
  (the Directory pattern); the homepage opens with six vision cards
  drawn from the registry (icon, name, one-liner, Coming Soon badge —
  no fake numbers). Migration `0030` applied: the six slugs join the
  `user_apps_app_known` CHECK so Settings can grant them. Names and
  slugs are now locked in the DB; each tool gets planned with the
  founder one at a time before any is built.
- **2026-08-04 (structure pass)** — the audit's bucket C, merged to
  `master` after the founder's browser pass: new
  `lib/overview/queries.ts` owns the home page's
  five reads (the one module allowed to import other tools' queries);
  catalogue types → `lib/masters/catalogue.ts`; `getPoReceipts` →
  Purchase Orders; inventory reads split into
  `receipts-/stock-/issues-queries.ts` over a shared-lookups core;
  Marathon's `PageHeader`/`AnimatedReveal` → `app/marathon/_components`;
  one `PageLoading` replaces 16 loading.tsx copies; Selections migrated
  onto the shared catalogue picker (space chips and request-item kept,
  421-line copy deleted); `/selections` and `/masters/units` page 50 at
  a time (the unit dialog still gets the complete list for its
  plot-uniqueness check). Post-merge the founder found every
  attribution rendering a dash — not a regression: no profile ever had
  a `full_name` (dashboard-created accounts aren't asked). Fixed the
  data by SQL (both founder accounts "Siddharth", the probe
  "Probe (test)") and Settings gained a per-person name field
  (save-on-blur → `setFullName`) — naming a person there is now part
  of onboarding. The pre-merge probe smoke did NOT run this session:
  resetting the probe password (auth admin API) was blocked by the
  assistant's permission mode; founder verified in the browser instead.
- **2026-08-04 (night)** — **Plot ↔ unit 1:1** (Stream A of the
  founder's three asks; `feature/plot-unit-one-to-one`, migration
  `0029` applied): units.plot_id NOT NULL + unique + same-project FK;
  indents gain the scope XOR (11 test indents carried both — unit
  kept); the four scope forms (indents' two dropdowns, PO, NMR bill,
  contract) collapse onto one shared SitePicker; unit dialog requires
  a free plot; plots list shows its unit; Stock drops the 'unit'
  location kind. Streams B (plot at every goods destination) and C
  (attribution everywhere) are next, per the approved plan.
- **2026-08-04 (evening)** — **Indents revision-safety fix**
  (`feature/indents-revision-guard`, migration `0028` applied): the
  founder reported that the interiors pull offered every approved
  budget, old revisions included, and "already asked" was scoped to one
  budget — the same line could be indented twice across revisions. Pull
  chooser now offers only each unit's issued revision (paused units say
  "R2 issued — budget pending approval"), scoped to the indent's unit;
  dedupe spans all of a unit's budgets by line_key; a DB trigger
  backstops stale pulls; drift badges on indent lines and a
  "affects IND/…, PO/…" impact panel on the Selections diff page warn
  when a revision touches live orders.
- **2026-08-04 (later)** — **Architecture audit** (three parallel
  sweeps: independence, boundaries, performance; verdict: holds).
  Fixed on `feature/audit-fixes`: the Marathon walk-any-bib read, four
  guardless Settings queries, every remaining silent 1,000-row cap
  (worst: selection lines feeding the PDF/CSV/diff), middleware auth
  now verified locally (getClaims) instead of a network call per
  request, the construction full-table read, Bills' double scans and
  over-broad options, inventory history location pushdown, four page
  waterfalls. `0027` written (contract values → `/bills`). Bucket C
  (structure moves) queued in TODO.md for its own session. Probe smoke
  passed locally against the production build.
- **2026-08-04** — **Bills shipped** (`0025` + `0026`, merged after the
  founder's browser gates and a 12-check single-grant probe smoke at
  the RLS boundary): record/approve/send-back/pay, over-billing
  warning, bill approvers in Settings, PO billed picture, Overview
  04–05 real. Founder corrections mid-build (`0026`): labour contracts
  moved from Masters into Bills with their own approval step, and
  **NMR daily-wage bills** added (no anchor, vendor optional). The
  Studio bottleneck fell: migrations now apply from this machine via
  the management API (token in `.env.local`). Also: docs slimmed
  earlier the same day.
- **2026-08-03** — three phases in one day. **Indents** (5 gates) — and
  the production outage found, hotfixed and permanently guarded
  (`check:actions`); margin secrecy proved as a real single-grant user.
  **Purchase Orders** (`0020`–`0022`). **Inventory** (`0023`, then
  `0024` when the founder wanted plots on Stock) — the store-keeper
  smoke caught the catalogue-allowlist 403. `PLAN.md` → `STATUS.md` +
  `TODO.md` split.
- **2026-08-01** — Selections, design views, Budgets shipped; the
  five-stage audit merged (escalation closed, 1,000-row bug killed,
  shared primitives extracted); CI + Prettier added.
- **2026-07-31** — Masters shipped; the real 2,631-item catalogue
  imported and thumbnailed (3 vendor URLs already dead — the link-rot
  that justified our own thumbnails).
