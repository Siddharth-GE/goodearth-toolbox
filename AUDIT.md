# Toolbox audit — 11 August 2026

A full read of the codebase, the 48 applied migrations, the live database
and the production deployment, against the founding rule: **each tool is an
independent instrument, connected only through the shell, the shared
database, and shared UI.**

**The headline is one live security hole, not an architecture problem.** The
Marathon kiosk's admin PIN is still the seeded default `2026`, published in
plaintext in a public GitHub repository. That needs ten minutes today. See
SEC-01.

> **Update, evening of 2026-08-11:** the admin PIN has been rotated and
> verified. Two agent accounts remain on the published test PIN `1234` —
> SEC-01 carries the correction and `TODO.md` §1 the remaining steps.

The architecture itself held up better than expected. The line chain is
anchored on real foreign keys at every hop, every table has row-level
security, every server action and route handler checks permission, and no
screen touches the database from the browser. Four of the things this audit
was asked to look for turned out to have been solved already — those are
listed at the end so the next audit doesn't go looking again.

---

## 1. Modularity & independence

### MOD-01 · HIGH · Budgets imports Selections' code

`lib/budgets/quote.ts:3`

```ts
import { downloadSpaceView, listSpaceViews } from "@/lib/selections/views";
```

Used at `quote.ts:71` and `:91` to put the client-facing space photos on the
quote PDF. This is the **only true cross-tool code import in the repo** and
it breaks the rule directly: one tool never imports another tool's code.

Two consequences, one architectural and one a permission smell:

- Delete or break Selections and the Budgets quote PDF stops compiling.
  Every other tool survives its neighbours; this pair does not.
- `getQuote()` only ever checks `/budgets` (via `getBudget()`), and
  `lib/selections/views.ts` has no gate of its own. So a person holding
  `/budgets` and **not** `/selections` runs Selections' storage-download
  code and reads its private bucket. Not a leak of anything they shouldn't
  see — the photos belong on the quote by design — but the boundary is
  being crossed by import rather than by a deliberate shared surface.

Fix is small and there are two honest options; both are your call, not
mine, because both move code between tools. See the roadmap.

### MOD-02 · LOW · Overview reads Marathon's query layer

`lib/overview/queries.ts:3` imports `getMarathonHome` from
`lib/marathon/queries`. I flag it only to close it off: **this is
sanctioned**, and the file says so itself at `queries.ts:6-19` — Overview is
the shell's home, not a tool, and is "the one module allowed to import other
tools' queries (reads only)." It is also defensive about it: `getMarathonPulse`
wraps the call in try/catch (`queries.ts:180-186`) specifically so a missing
Marathon environment variable cannot take down the signed-in home page, which
it once did.

The only gap is documentation — CLAUDE.md's cross-tool table lists Overview's
table reads but not this one. Fixed in the rewritten CLAUDE.md.

### MOD-03 · MEDIUM · Settings writes two other tools' tables

`lib/settings/actions.ts:246, :255, :291, :314, :323` insert into and delete
from `indent_approvers` (declared in Indents' migration 0019) and
`bill_approvers` (declared in Bills' migration 0025).

CLAUDE.md states flatly: "no tool's CODE ever writes another tool's table."
This is a real exception to that sentence. It is almost certainly the right
design — deciding who may approve things is Settings' job, both tables are
RLS-gated to `is_admin()` rather than to `/indents` or `/bills`, and both
migrations describe them as "managed from Settings" — but an undocumented
exception to a rule that strict is how the rule quietly stops being believed.

**Recommendation:** reclassify both tables as Settings-owned in the docs
(like `profiles` and `user_apps`), rather than change any code. Done in the
rewritten CLAUDE.md, flagged here so you know it was a judgement call.

### MOD-04 · PASS · The line chain is anchored in the database, not in code

Traced end to end. Every hand-off is a real constraint:

| Hop                          | Anchor                                | Kind                     |
| ---------------------------- | ------------------------------------- | ------------------------ |
| selection line → budget line | `(selection_id, line_key)`            | composite FK, `0011:120` |
| budget line → indent line    | `(budget_id, line_key)`               | composite FK, `0019:268` |
| indent line → PO line        | `purchase_order_lines.indent_line_id` | FK, not null, `0021` §5  |
| PO line → receipt line       | `goods_receipt_lines.po_line_id`      | FK, not null, `0023:151` |
| PO → bill                    | `bills.po_id`                         | FK, header level only    |

Not one of these is a bare string key, and the two files that decide what
carries forward — `lib/budgets/carry-forward.ts` and
`lib/indents/pull-rules.ts` — are pure functions that import **nothing at
all**. The coupling really does live in the schema. This is the part of the
codebase most likely to have rotted and it hasn't.

### MOD-05 · PASS · Delete-cascade: stronger than the rule asked for

The brief asked me to verify that deleting a design line _flags_ rather than
silently breaks linked budget/indent/PO lines, and to test what actually
happens. What actually happens is that **the delete is refused**:

- `selection_lines_draft_only` (`0017:50-75`) raises unless the parent
  selection is still `draft`. Once a revision is issued it is immutable —
  you create a new revision instead.
- The composite FKs above carry no `ON DELETE` clause, so they are
  `RESTRICT`. Postgres refuses to orphan a budget line even in draft.

Drift is surfaced instead of destruction: `classifyDesignDrift`
(`lib/indents/pull-rules.ts`) marks indent lines `changed`/`removed` against
the latest issued revision, and `getDownstreamImpact`
(`lib/selections/queries.ts:400-466`) shows a designer which indents and POs
already exist for a line before they touch it. No cascade is needed because
nothing can cascade.

### MOD-06 · Failure-ripple test

What breaks in **other** tools if one tool's tables empty, routes die, or
code is deleted:

| If this tool goes | What else notices                                                                                                     |
| ----------------- | --------------------------------------------------------------------------------------------------------------------- |
| Marathon          | Home page live card only, and it is already caught in try/catch (MOD-02). Nothing else.                               |
| Selections        | **Budgets quote PDF stops compiling** (MOD-01). Budgets/Indents lose their upstream data but degrade to empty states. |
| Budgets           | Indents' interiors pull goes empty; nothing crashes.                                                                  |
| Indents           | POs cannot be raised (by design — POs come from indents only). Selections' impact panel goes quiet.                   |
| Purchase Orders   | Inventory has nothing to receive; Bills cannot anchor to a PO; both still load.                                       |
| Inventory         | POs show no receipts. Nothing breaks.                                                                                 |
| Bills             | Nothing reads Bills. Fully leaf.                                                                                      |
| Relay             | Nothing. Reads only shared `projects`/`units`/`profiles`.                                                             |
| Business Planning | Nothing. No FK to any other tool.                                                                                     |
| Masters           | Everything degrades — but Masters is a shared surface, not a peer tool. Expected.                                     |

**One violation of "stays functional when a neighbour is down": MOD-01.**
Everything else is data-empty degradation, which is the design working.

---

## 2. Security

### SEC-01 · CRITICAL · PARTLY RESOLVED 2026-08-11 · The Marathon PINs are published defaults

> **Admin PIN: closed.** Rotated by the founder on the evening of
> 2026-08-11 and verified against production — `2026` no longer matches
> the stored hash, `marathon_config.updated_at` is 09:10 UTC that day.
>
> **Agent PINs: still open**, and the table below was wrong about them.
> The same verification found **Ravi and yema still on the published test
> PIN `1234`**, and "Test Agent" still present (its own PIN since reset).
> The audit recorded all four real agents as having rotated PINs; that was
> not checked against the hashes at the time, only assumed. See `TODO.md`
> §1. An agent reaches entry capture, not the admin panel, so the exposure
> is narrower than what follows — but it is the same published default.
>
> The rest of this finding is left as written, because the reasoning about
> why rotation is the only remedy still stands.

`supabase/migrations/0002_marathon.sql:154-170`, in a **public** repository:

```sql
-- Shared admin PIN, defaults to 2026 (matches the approved mockup).
insert into marathon_config (admin_pin_hash, admin_pin_salt) values (...);

-- One test agent (PIN 1234) ... Delete this row once real field agents
-- are added.
insert into marathon_agents (name, pin_hash, pin_salt) values ('Test Agent', ...);
```

The PINs are scrypt-hashed, which is correct and irrelevant — the comments
state the plaintext. No cracking required, just reading.

**I checked production. Both are still live:**

| Check                                                          | Result                                             |
| -------------------------------------------------------------- | -------------------------------------------------- |
| `marathon_config` admin PIN still the seeded hash **and** salt | ~~yes~~ **rotated 2026-08-11**                     |
| "Test Agent" row still present with the seeded PIN `1234`      | row still there; its PIN reset                     |
| Real agents added since (Mathew, Ravi, rega, yema)             | ~~4, all rotated~~ **Ravi and yema are on `1234`** |

So the migration's own instruction — "delete this row once real field agents
are added" — was never carried out, and the admin PIN was never changed.

**Impact.** `/marathon` is deliberately outside Supabase Auth
(`lib/supabase/proxy.ts:20-32`), so the PIN is the only thing in the way.
Anyone on the internet who reads the repo can open `/marathon/admin` and
reach the entry list — runner **name, mobile number, age, gender** — plus add
or remove agents and reset their PINs. Rate limiting doesn't help: it stops
guessing, and nobody needs to guess.

**Do this today, in the running app — no deploy needed:**

1. `/marathon/admin`, sign in with `2026`, use **Change admin PIN**. Pick
   something not in the repo.
2. Delete the "Test Agent" member on the members screen.
3. Assume anything in Marathon was readable and judge whether the runner
   list needs telling.

Note that rewriting the migration would fix nothing and break the
additive-only rule: the PIN is in public git history permanently. Rotation
is the only remedy. Going forward, seed a placeholder that cannot work and
force a first-run change, rather than a real default.

### SEC-02 · MEDIUM · The fact views bypass RLS by design

`po_facts`, `po_line_facts` (`0022`), `approved_budgets`,
`approved_budget_lines` (`0019:506-520`), `bill_facts`, `po_billing_totals`
(`0025:477-511`), `pusher_chain_state` — none declare `security_invoker`.
They are owned by `postgres`, so they read straight past the RLS on the
tables underneath, and their security is entirely their own `WHERE` clause,
their explicit column list, `security_barrier`, and a `revoke`/`grant` pair.

This is deliberate, heavily commented, and load-bearing — it is exactly how
`/indents` sees budget quantities without seeing budget costs. It is not a
bug and I am not proposing to change it.

The risk is procedural: **one carelessly added column silently crosses the
money boundary**, with no policy and no linter to catch it. The comments say
"NEVER add a money column" because a comment is currently the only guard.
Supabase's own advisor flags every one of these as `security_definer_view`,
which trains you to ignore that warning — worth knowing before you dismiss
it wholesale.

**Recommendation:** a CI check asserting the exact column list of the six
money-adjacent views. Roughly thirty lines, turns tribal knowledge into a
failing build. Listed in the roadmap, not done here — it needs a decision
about where to draw the list.

### SEC-03 · PASS · Everything else in the security brief

I went looking for each item asked for and did not find it:

- **Secrets in the repo.** None. `.env*` is gitignored except the blank
  `.env.local.example`; a full-history scan across every commit for JWTs,
  service-role keys and access tokens found nothing but variable names in
  docs. SEC-01 is a published _default credential_, which is a different
  thing and worse.
- **Client-side database access.** None. All 108 `"use client"` files reach
  the database only through server actions. The one browser client that
  existed was unused — deleted this session.
- **Anon-key exposure.** Confined to auth, as intended.
- **RLS coverage.** Every table has it enabled. Sixteen get it through
  `do $$ ... execute format(...)` loops (`0004:139-159`, `0023:924-948`),
  which defeats a naive grep — worth knowing before someone "discovers"
  they're unprotected.
- **Auth on actions and routes.** Complete. Every exported server action
  calls `requireTool`/`requireUser`/`requireAdmin` first; all seven route
  handlers gate before touching data, including `app/api/catalogue` and the
  private-bucket streamer at `selections/views/[viewId]`.
- **Service-role usage.** Confined to Marathon (which has no other way in)
  plus the single sanctioned `inviteUser` (`lib/settings/actions.ts:88`),
  which touches only the auth-admin API, never a table.
- **Marathon PIN mechanics.** Sound: scrypt with per-row salt,
  `timingSafeEqual`, HMAC-signed httpOnly cookie scoped to `/marathon`,
  8-hour expiry, and DB-backed rate limiting (10 failures → 10-minute
  lockout) checked _before_ the PIN is examined. The mechanism is good; the
  secret was left at its default.
- **IDOR.** The model is role-based, not owner-based — any `/budgets` holder
  may open any budget, deliberately. Where per-caller scoping is genuinely
  required it exists, e.g. `getSavedEntry` (`lib/marathon/queries.ts:69-88`)
  filters on `agent_id` with a comment explaining that without it any agent
  could walk bib numbers.
- **SQL injection.** No raw SQL string interpolation anywhere; everything
  goes through PostgREST builders or parameterised RPCs.
- **Input validation.** Manual rather than schema-based (no zod), but I
  found no action writing a field it hadn't checked, and the database
  carries matching `check` constraints as a second line.

---

## 3. Performance

**The reported numbers are LCP ~5.5s, FCP 2.6s, TTFB 1.3s. I measured
rather than guessed, and the answer is cold starts.** Most of what a
performance audit normally finds is already correct here, so I want to be
precise about what I ruled out and how.

### PERF-01 · HIGH · Cold starts, and essentially nothing else

Timed against production (`goodearth-toolbox.vercel.app`):

| Path                                 | First hit (cold) | Warm       |
| ------------------------------------ | ---------------- | ---------- |
| `/login` (prerendered static)        | **1.14s**        | 0.16–0.41s |
| `/_next/static/...` (proxy excluded) | 0.43s            | 0.14–0.18s |
| `/` (proxy + redirect)               | —                | 0.16–0.18s |

Warm TTFB is ~0.16s and indistinguishable from a static asset — so the proxy
costs nothing measurable, and neither do the queries. Cold TTFB is ~1.14s,
a **7× difference**, and it lands almost exactly on the reported 1.3s. With
~70 staff spread thinly across eleven tools all day, a large share of loads
hit a cold function.

Two structural reasons it bites here:

- Every `(dashboard)` route is dynamic (`ƒ` in the build output), because
  `getCurrentUser` reads `headers()`. Correct for per-user grants, but it
  means no route can ever be served from cache.
- The dashboard `<h1>` — almost certainly the LCP element — sits outside any
  Suspense boundary and renders only after `await requireUser()`, so it
  inherits the whole cold-start cost.

**The honest limit of this finding:** I can measure TTFB from here, but not
real-user LCP on a phone in Kerala. That TTFB is cold-start-dominated is
measured. That LCP follows it is inference — strong, because the remaining
2.9s between FCP and LCP has no other candidate I could find, but inference.
Confirm with Vercel Speed Insights filtered to cold vs warm before spending
real money on it.

**What would actually help, in order:** Fluid compute / keeping a function
warm (a platform setting, not a code change) is the single biggest lever.
After that, moving the greeting `<h1>` above the auth await so the shell
paints before the profile query resolves.

### PERF-02 · MEDIUM · Five missing indexes — preventative, not the cause — **applied**

Migration `0049` went in on 2026-08-11 ahead of `0050`, all five indexes
verified present. The finding below stands as written: it changed nothing
measurable, which was always the point.

`indents.created_at`, `indent_lines.created_at`, `purchase_orders.issued_at`,
`bills.created_at`, `bills.paid_at` are all filtered by the thirteen
Overview counts on every visit to `/`, and none has an index.

**This is not why the site is slow.** I checked the live row counts:

| Table           | Rows |
| --------------- | ---- |
| selection_lines | 79   |
| budget_lines    | 49   |
| indent_lines    | 28   |
| indents         | 16   |
| purchase_orders | 9    |
| bills           | 4    |

At this size Postgres will sequential-scan regardless, and adding indexes
changes nothing today. Migration `0049` is written and committed **but not
applied**, framed as a "before it matters" measure. Apply whenever suits.

(`goods_receipts.received_at` is deliberately not in the list — it is already
indexed from `0023`.)

### PERF-03 · LOW · Marathon per-run counts are N+1

`lib/marathon/queries.ts:31-39` issues one count per run inside `.map`. It is
parallelised, behind Suspense, and running against 11 rows, so the cost today
is one extra round trip. The existing comment explains it replaced something
worse.

Doing it properly needs a `GROUP BY` — which PostgREST can't express, so it
needs a database function. **That is a schema change, so I did not do it**
(the plan put schema out of scope). Left as a recommendation; it is not
urgent.

### PERF-04 · PASS · What I ruled out

Each of these was a plausible cause and each is measurably fine:

- **Client bundle.** 446 KB uncompressed for the shared shell (~145 KB
  gzipped); 2.0 MB across _all_ routes. No charting library, no
  framer-motion; Radix is three primitives. `@react-pdf/renderer` is
  confined to route handlers and does not leak into any page bundle.
- **Fonts.** `next/font/google`, self-hosted, exactly two files preloaded
  (51 KB total). Mono is genuinely used in 83 places, so it earns its place.
- **CSS.** One 56.6 KB stylesheet.
- **Images.** `next/image` throughout; the two raw `<img>` tags are a
  same-origin route handler and a PDF primitive.
- **Region.** Vercel `bom1` and Supabase `ap-south-1` are both Mumbai. This
  was my leading hypothesis for the 1.3s TTFB and it is wrong.
- **Waterfalls.** The homepage has none — six of nine sections are static
  arrays, the two that fetch are behind `<Suspense>`, and all thirteen counts
  run in `Promise.all` batches.
- **Whole-table reads.** Every `select("*")` is paired with `.range()` inside
  `fetchAll` or is a single-row `.single()`.

---

## 4. Code quality & consistency

### QUAL-01 · HIGH · Two failed reads that looked like good news — **fixed**

`lib/budgets/actions.ts:170` and `lib/indents/queries.ts:273` both
destructured only `{ data }` and fell through to an empty list. In both, empty
means the opposite of failure:

- Carry-forward read "no prior budget for this unit" and started a blank
  sheet — silently discarding prices someone had already entered, which is
  precisely the data loss `fetchAll` exists to prevent, arriving by another
  door.
- The indent drift check read "nothing has changed" and cleared every
  design-changed flag, telling the site team an indent was safe to order
  when the design under it had moved.

Fixed this session, each matching what its layer already does: the action
returns a message, the query throws to the error boundary.

### QUAL-02 · LOW · Dead code and a duplicated filter — **fixed**

`listActiveGstRates()` (`lib/masters/gst-rates.ts:29`) was never called, while
the PO detail page fetched every slab and filtered in JavaScript. Now one
caller each.

### QUAL-03 · MEDIUM · Line pulls are not atomic — deliberate, documented

`addDirectLines`, `addConstructionPullLines`, `addConstructionLines`,
`addPoolLines`, and the receipt/issue loops all insert row-by-row in
JavaScript with no transaction. A failure part-way leaves some lines added
and some not.

This is a **considered trade-off, not an oversight**, and every site says so
— e.g. `lib/purchase-orders/actions.ts:158-160`: "One at a time, deliberately:
the qty guard raises per line with the item's remaining figure, and a batch
insert would fail wholesale on the first refusal." Each reports partial
success honestly ("Added 3, then stopped: …").

Worth knowing there is a way to have both: Marathon's bib numbering does the
whole allocation inside one function (`marathon_create_entry`), atomic and
one round trip. The same shape — a function that loops server-side and
returns a per-row summary — would give the pulls atomicity _and_ keep the
per-row messages. Not urgent; noting it because the brief asked whether the
bib pattern was used everywhere it should be. It isn't, but the gap is
reasoned.

### QUAL-04 · LOW · Structural drift

- `lib/masters/` uses one `<entity>.ts` / `<entity>-actions.ts` pair per
  entity (18 files) instead of the `queries.ts` / `actions.ts` convention.
  Sensible for nine entities; just not the stated pattern.
- Every tool in `lib/tools.ts` has a matching route and vice versa,
  including the five Coming Soon stubs. No orphans.
- `replaceFutureLegs`, `editableFromLeg` and `scoreAll` in `lib/relay/` are
  unused **on purpose** — tested write paths not yet wired to a screen.
  Don't let a future cleanup delete them by accident.
- ~35 further call sites destructure `{ data }` without checking `error`.
  The two that mattered are fixed; the rest are display-only lookups (an
  editor's name, a label) where an empty result is genuinely harmless. Worth
  a slow tidy, not a project.

### QUAL-05 · The access model is already what you decided

The brief asks to "note the access model inconsistency: profiles currently
store one team string, but the decided model is per-user per-app grants" and
to assess migration effort.

**There is nothing to migrate — it shipped.** `user_apps` (migration 0003)
plus role bundles `role_apps` (0034) are live, unioned per request in
`lib/auth/dal.ts`, and enforced _in the database_ by `has_app()`, not merely
in the app. `profiles.team` is a vestigial free-text column that `0038:12-13`
already describes as null on every row.

Effort is a dead-column cleanup, not a migration, and even that is optional
under the additive-only rule. Removed from TODO.md.

---

## Fixed in this session

Five commits, each verified:

| #   | Commit    | What                                                                                                          |
| --- | --------- | ------------------------------------------------------------------------------------------------------------- |
| 1   | `51e0154` | Deleted the unused browser Supabase client — the one easy way client-side DB access could return              |
| 2   | `b612415` | Error checks on the two reads whose silent failure looked like good news (QUAL-01)                            |
| 3   | `d105596` | PO screen filters GST rates in the database; dead export retired (QUAL-02)                                    |
| 4   | `f5fda05` | Migration `0049` — five Overview indexes, written here and applied 2026-08-11 (PERF-02)                       |
| 5   | —         | Documentation consolidated: CLAUDE.md, STATUS.md, TODO.md rewritten; README.md, PRODUCT.md, AGENTS.md removed |

Nothing above changes behaviour, except that two previously-silent failures
now speak up.

## Needs your decision

Ranked by what I'd do first.

| #   | Item                                                                                                                                                                                                                | Why it's yours                                                                                         |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| 1   | ~~SEC-01 admin PIN~~ **done 2026-08-11.** What is left: **reset Ravi's and yema's PINs (both `1234`) and delete "Test Agent".**                                                                                     | Live production credentials. Minutes in the running app; I can't and shouldn't do it for you.          |
| 2   | **PERF-01 — cold starts.** Enable Fluid compute / keep-warm on Vercel, then re-measure.                                                                                                                             | A billing and platform decision. Biggest single lever on the slow first load.                          |
| 3   | **MOD-01 — untangle the Budgets → Selections import.** Either move `listSpaceViews`/`downloadSpaceView` into a shared surface (`lib/masters/` or a new `lib/space-views/`), or have Budgets read the bucket itself. | Moves code between tools; the brief says not to without asking. First option is cleaner and ~20 lines. |
| 4   | **SEC-02 — CI check pinning the money-free views' column lists.**                                                                                                                                                   | Needs a decision on where the authoritative list lives.                                                |
| 5   | **MOD-03 — confirm `indent_approvers`/`bill_approvers` are Settings-owned.**                                                                                                                                        | I documented it that way. Say if you disagree and it should move instead.                              |
| 6   | **PERF-03 — Marathon per-run counts via a database function.**                                                                                                                                                      | Schema change, low value at 11 rows.                                                                   |
| 7   | **QUAL-03 — line pulls atomic via server-side loop functions.**                                                                                                                                                     | Real design change to a working, reasoned trade-off.                                                   |

## Already true — things this audit was asked to find and didn't

Recorded so the next pass doesn't re-litigate them:

1. **Per-user per-app grants are live** (0003 + 0034), enforced in the
   database. No migration pending. (QUAL-05)
2. **No client component can reach the database.** Not one.
3. **Every table has RLS enabled** — sixteen via `do $$` loops that a grep
   will miss.
4. **Deleting a linked design line is impossible, not cascading.** Issued
   revisions are immutable and the FKs are RESTRICT; drift is flagged
   instead. (MOD-05)
5. **Vercel and Supabase are in the same region.** Not a TTFB cause.
6. **The client bundle, fonts, CSS and images are all already correct.**
