# Goodearth Toolbox — build plan & session log

The living roadmap for rebuilding Goodearth's whole operational system
here, replacing the AppSheet suite. Source of truth for **where we are**
and **what's next**.

> **How this file works.** It gets updated at the end of every working
> session: tick off what shipped, correct the plan where reality
> disagreed with it, and leave the "Next up" section detailed enough
> that a cold start needs no explanation. Per-tool detail lives in
> `app/(dashboard)/<tool>/PLAN.md`; this file is the level above.

---

## Where we are right now

**Masters, the catalogue, Selections, design views and Budgets are all
shipped. Indents is next.**

The Selections → Budgets chain now works end to end: a designer
specifies a unit space by space, issues it, the budget team prices it,
and a client quotation comes out the other side. That's the spine of the
AppSheet replacement.

|                     |                                                                             |
| ------------------- | --------------------------------------------------------------------------- |
| Last worked         | 2026-08-01                                                                  |
| Branch              | `master` — all five audit stages merged (`0cc5f8c`)                         |
| Migrations applied  | `0001`–`0016` (next new one is `0017`)                                      |
| Items in database   | **2,633** (2,631 imported catalogue + 2 material seeds)                     |
| Categories / brands | 14 / 21                                                                     |
| Thumbnails          | **897** in Supabase Storage; 3 dead vendor links, 1,733 items have no image |
| Built tools         | Marathon, Settings, Masters, Selections, Budgets                            |
| Tests               | `npm test` — 25, covering pricing, carry-forward and formatting             |

---

## Phase status

| #   | Phase                                                                                                  | Status                                                 |
| --- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------ |
| 0   | Platform hardening — `user_apps` grants, `requireApp()`, generated Supabase types, migration rules     | ✅ Done                                                |
| 1   | **Masters** — projects, plots, units, clients, vendors, stores, items, categories, brands, space types | ✅ Shipped, Gate 1 approved                            |
| 3   | **Catalogue import** — the real 2,631-item catalogue                                                   | ✅ Done — **pulled forward, out of order** (see below) |
| 3b  | **Thumbnail pass** — catalogue images into Supabase Storage                                            | ✅ Done                                                |
| 2   | **Selections** — per-unit design workspace + the catalogue picker                                      | ✅ Shipped, merged 2026-08-01                          |
| 2b  | **Design views** — renders per space, in the design document                                           | ✅ Shipped, merged 2026-08-01                          |
| 4   | **Budgets** — cost + margin → client rate, approval, two documents                                     | ✅ Shipped, merged 2026-08-01                          |
| 5   | Indents — pull-from-budget _and_ direct site request                                                   | ⬜ **NEXT**                                            |
| 6   | Purchase Orders — vendor grouping + letterhead PDF                                                     | ⬜ Not started                                         |
| 7   | Inventory / Store — goods receipt, stock on hand, issues                                               | ⬜ Not started                                         |
| 8   | Bills — against POs and labour contracts                                                               | ⬜ Not started                                         |
| 9   | Overview wired to real data + one real project end-to-end                                              | ⬜ Not started                                         |

**Why 3 came before 2:** the original plan built the catalogue picker on
5 sample items and imported the real catalogue afterwards. We flipped
it, so the picker gets designed against 2,631 real items from day one
rather than looking good on samples and falling over later. Same work,
better order.

---

## Images — settled, nothing left to do

`scripts/fetch-catalogue-images.ts` has run. **897 thumbnails** are in
the public `catalogue` Supabase Storage bucket at
`items/<item id>.webp`, with `items.thumb_url` pointing at each.
Roughly 5 KB apiece (a 218 KB, 1920px vendor JPEG becomes a 4.8 KB,
300px WebP — a 45× saving), so the whole set is about 4.5 MB.

What the picker needs to know:

- **Grid tiles load `thumb_url` only.** Never `image_url` — 30 full
  vendor images per page is ~15 MB against ~150 KB of thumbs.
- **`image_url` stays a link to the vendor's CDN**, for a detail/zoom
  view only. Not stored, because ~360 MB isn't worth it for something
  opened rarely.
- **1,736 items need a placeholder** — 1,733 that never had an image,
  plus 3 whose vendor URLs are now dead (`HANL095`, `HANL114`,
  `WALL337`, all 404). Use `lib/color-hash.ts` (already used for
  avatars — Marathon's category badges have their own separate palette
  keyed on a colour name in the database): the item's code on a stable
  colour. Zero bytes,
  zero requests, and reads as deliberate rather than broken. **This is
  the majority case — design the tile for it first, not as a fallback.**
- **`next.config.ts` already allows the Supabase Storage host** in
  `images.remotePatterns`. If a detail view later renders the full
  vendor image, `cdn.shopify.com` has to be added there too — it isn't
  yet, deliberately, since nothing renders it.
- The script is re-runnable and skips anything already done, so it's
  safe to run again whenever new catalogue rows arrive.

## The Selections → Budgets handoff (settled)

What the budget team receives when a designer presses **Issue**. Agreed
before Budgets existed so both sides were built against the same contract.

> **Corrected 2026-08-01, when Budgets was actually built.** This section
> used to say Budgets calls `getBudgetHandoff()` in
> `lib/selections/queries.ts`. It can't: every function in that module
> opens with `requireApp(user, "/selections")`, so a budget-team member
> without the design grant would be redirected off their own screen.
> Budgets reads the selection tables **directly, under `/budgets`** —
> the same rule that lets any tool read `lib/masters/*` without holding
> `/masters`. The contract below is still exactly right; only who
> assembles it changed.

- **The revision** — unit, project, R-number, who issued it and when,
  plus the designer's note saying _why_ this revision exists. That note
  is the first thing the budget team reads.
- **Every line, grouped by space** — item, code, brand, quantity, unit,
  and `indicative_rate_snapshot`: the figure the item carried the day it
  was picked. Not an opinion about cost; it exists so an issued revision
  doesn't silently re-price when a master price is edited later.
- **What changed** — for R1 onward: added / removed / quantity-changed
  against the previous issued revision.

**That last part is the point of `line_key`.** `create_next_revision()`
copies each line forward carrying its key, so Budgets keys pricing to the
key rather than the row id. An unchanged sofa keeps the price it was
already given; only new or changed lines enter the budget queue. Copy
with fresh keys instead and issuing R1 quietly asks the team to re-price
all 200 lines — which is how people abandon a tool.

**Never crosses the boundary:** cost, margin, client rate. Those are
Budgets' alone (`lib/budgets/queries.ts` when it exists), and they never
appear in Selections or on a client-facing document.

## Next up

### Phase 5 — Indents (branch `feature/indents`)

Turning an approved budget into requests for the commercials team, who
split them into purchase orders by vendor. This is why
`budget_lines.expected_vendor_id` has existed since migration `0011`.

Two sources feed it and the tool has to handle both: **pull from an
approved budget** (the common path) and **a direct site request** for
something nobody designed.

**Context a cold start needs:**

- Follow the "Adding a new tool" checklist in `CLAUDE.md`. The Coming
  Soon stub, route and sidebar entry already exist — flip `built: true`
  in `lib/tools.ts` and replace that route's `page.tsx`.
- **Read `lib/budgets/` first, not Selections.** It's the newest and
  cleanest data layer, and Indents consumes it exactly as Budgets
  consumes Selections. Cross-stage reads belong to the DOWNSTREAM tool,
  under its own grant — never call another tool's gated queries.
- **Anchor on `line_key`**, as Budgets does. It is the only identifier
  that survives a revision.
- **Indents must not show cost or margin.** Reads on `budget_lines` are
  gated to `/budgets` (migration `0011`), so an Indents query joining
  that table returns nothing — by design, not by accident. Indents needs
  quantity, item, space and vendor, none of which are secret. If a
  screen genuinely needs a value from behind that boundary, that's a
  conversation, not a policy edit.
- **Every transactional table links to a project/plot**, per CLAUDE.md.

---

## Decisions locked in

- **One `items` table** for catalogue products and raw materials, split
  by `kind`.
- **Prices are snapshotted** onto lines at pick time; master price edits
  never rewrite existing lines.
- **Lines in a DRAFT revision are deleted outright; an ISSUED revision is
  immutable and its lines cannot be touched at all.** Corrected
  2026-08-01 — this used to promise a soft delete via a `line_status`
  column, which was never built and never needed. Immutability turned out
  to be the stronger guarantee: a database trigger refuses every write to
  an issued revision's lines (migration `0006`), so history is preserved
  by the revision itself rather than by flags on rows. The audit log
  keeps the rest. **Do not build downstream tools expecting soft
  deletes.**
- **Margin is Budgets-only** — `margin_pct` and `client_rate` may be
  selected only by `lib/budgets/queries.ts`. POs never show them.
- **Access = per-user app grants.** `requireApp()` first in every action
  and query; sidebar visibility is cosmetic only.
- **Item codes:** Goodearth's real convention is a 4-letter _sub-type_
  prefix + 3-digit sequence (`BENS001`, `SOFS…`, `HANL…`) — finer than
  category, since one "Seating" category spans BENS/CHAS/ARMS/SOFS.
  Nothing auto-generates codes today; whenever that's built it must
  follow this convention and cannot key off `item_categories`.
- **Images:** thumbnails are ours (Supabase Storage), full images stay
  borrowed links, image-less items get a colour placeholder. Image
  fetching is never bundled into a data import — ~900 fetches against
  other people's servers produce timeouts and 404s, and that must not be
  able to damage a clean data load. See the images section above.

## Open decisions — ask at the phase that needs them

| Phase | Question                                                               |
| ----- | ---------------------------------------------------------------------- |
| 2     | Can a design start on an unsold unit (`client_id` null)?               |
| 4     | Default margin prefill — global, per category, or none?                |
| 6     | PO / indent numbering format; letterhead assets (logo, address, terms) |
| 8     | Does bill approval need a different person than the recorder?          |

Also still unconfirmed from Phase 1: the `status` value lists for
projects (`planning`/`active`/`completed`) and plots/units
(`available`/`reserved`/`sold`) were chosen as sensible defaults, not
specified by the founder. Easy to extend — say if they don't match how
Goodearth actually talks about status.

---

## The three documents

The system's real output. Agreed 2026-08-01, and the reason Budgets is
shaped the way it is.

|                         | Produced by | Contains                                                                              | Audience                    |
| ----------------------- | ----------- | ------------------------------------------------------------------------------------- | --------------------------- |
| **A · Design document** | Selections  | Spaces view by view — uploaded renders — with the items specified in each. No prices. | Client, for design sign-off |
| **B · Budget sheet**    | Budgets     | Every element with quantity, **cost, margin** and client rate                         | Internal only               |
| **C · Client quote**    | Budgets     | Views, items, quantity, **client rate and amount**, totals                            | Client                      |

**B and C are the same data, filtered.** Cost and margin appear on B and
must never appear on C. That's why margin lives in a Budgets-owned table
with its own RLS rather than on `items` — a mistake in the C template
can't reach for a number it was never handed.

**All three are now built.** The separation between B and C ended up
stronger than "hide two columns": C renders from `QuoteData`
(`lib/budgets/quote.ts`), a type that has **no cost or margin field at
all**. A template can't print what its props don't contain, so the
failure mode is a compile error rather than a leaked margin.

## Codebase hardening — audit of 2026-08-01

A full audit (architecture, performance, docs, database) was run once
Selections and Budgets began depending on each other, ahead of bringing
a maintainer onto the project. Findings were sorted into five stages.
**All five stages are shipped and merged to `master`.** The sections
below record what each stage found and did.

### Stage 1 — security & correctness ✅ shipped (migrations `0013`, `0014`)

- **Any staff user could make themselves an admin.** `profiles` lets you
  edit your own row and `role` lives on it, with the anon key in every
  browser. One request bought every app grant, including `/budgets` —
  the one boundary the schema treats as secret. Roles are now an
  admin-only change, enforced by a trigger.
- **Granting `/masters` never worked.** The app checked the grant; the
  database demanded `is_admin()`. Every non-admin write failed as
  "Could not create project. Try again." Unnoticed because the only user
  was an admin.
- `sharp` was undeclared and resolving only as one of Next's _optional_
  dependencies — design-view uploads were one install away from breaking.
- The `x-user-id` header was forwardable on paths the proxy matcher
  skipped (anything ending `.png`, which a dynamic route can).
- A failed save in the Selections line grid marked the row saved before
  the write, so the edit was lost and could never be retried.

### Stage 2 — remaining bugs ✅ shipped (migration `0015`)

All fixed. What they were:

- **Silent 1,000-row truncation, the catalogue bug a third time.** Marathon
  tallied every entry row in JS to get per-run counts, so on race day the
  breakdown would have frozen at 1000 while the total beside it kept
  climbing — two numbers on one screen contradicting each other. The
  Budgets inbox did the same and would have reported "0 lines waiting"
  from about the sixth issued revision. Both now use exact database
  counts; lists carry an explicit `MARATHON_LIST_LIMIT` and say when
  they're showing a subset. **The rule: never derive a count from
  `rows.length`** — ask the database, and make any cap a decision the
  code states rather than one the transport imposes silently.
- `item_margins` was read whole on every budget render; now scoped to the
  items on that budget. Past 1000 configured margins, lines would have
  silently arrived blank — and a blank margin that gets saved is a line
  sold at cost.
- **Marathon PIN guessing.** A public kiosk URL with no limit on attempts
  against a 4-digit PIN. Now locks a target for 10 minutes after 10 wrong
  tries (`marathon_pin_attempts`, migration `0015`), and the admin PIN
  and any agent's PIN can be changed from the Members screen — both
  shipped as defaults published in git.
- `startPricing` discarded the error from its own cleanup delete, so a
  failed carry-forward can leave a zombie budget that blocks every retry.
- `lib/settings/actions.ts` threw instead of returning `ActionState`, and
  `grant-checkbox.tsx` swallowed the result, so a failed permission change
  left the box ticked and an admin believing someone had access they
  didn't. Now returns like every other tool's actions, and the checkbox is
  controlled and rolls back.

**Also added here, since a maintainer is joining:** CI
(`.github/workflows/ci.yml`) running format, lint, types, tests and build
on every push to `master` and every pull request, and Prettier
(`npm run format`). Both were previously declined as over-engineering for
one person — what changed is a second developer plus `master`
auto-deploying to production, which meant the only gate was remembering
to run four commands. The whole repo was reformatted in a single separate
commit so it never hides a real change.

> **The `npm test` glob is shell-dependent** (`tsx --test lib/**/*.test.ts`).
> It works on Windows and on CI's bash today. If tests ever appear not to
> run, check that before assuming they pass.

### Stage 3 — shared foundations ✅ shipped

What was done: **`lib/format.ts`** is now the single answer for money,
quantities, percentages and dates, on screens and in PDFs alike (with its
own tests). Four missing primitives added — `Textarea`, `Pagination`,
`IconButton`, `FormMessage` — each of which was being hand-rolled two to
four times. **`RecordFormDialog`** replaced the seven near-identical
Masters dialogs. Two hooks, **`useDebouncedSearch`** and
**`useSaveOnBlur`**, replaced three copies each; the save hook makes the
retry bug that Stage 1 fixed structurally impossible rather than fixed in
three places independently. `error.tsx` and `not-found.tsx` exist for the
first time. Five dead modules deleted.

**Two bugs found while doing it**, both invisible until looked for: the
`npm test` glob was unquoted, so the shell expanded it and CI would have
silently skipped any test file outside `lib/<dir>/`; and `disabled` had
no visual effect on secondary or ghost buttons, so every disabled
pagination control looked clickable.

The original findings, for reference:

Selections and Budgets currently solve the same problems three different
ways each. Consolidate:

- **One `lib/format.ts`.** `items.indicative_price` renders as `₹12,345`,
  `₹12,345` and `12,345` in three different screens today, and
  `formatQty` in `lib/pdf/theme.ts` doesn't group digits despite its own
  comment saying it should — so PDFs and screens disagree.
- Missing primitives being hand-rolled: `Textarea` (2 copies), pagination
  (3 incompatible versions), icon button (4), inline error text (20+).
  `Button`'s `secondary`/`ghost` variants have no disabled style;
  `Badge`'s `default` variant renders as bare text.
- Two shared hooks would delete ~150 lines: debounced abortable search
  (3 copies) and save-on-blur (3 copies, one of which had the Stage 1 bug
  the other two had already fixed).
- **No `error.tsx` or `not-found.tsx` exists anywhere**, though four
  pages call `notFound()`. Selections and Marathon have no `loading.tsx`,
  which DESIGN.md requires.

### Stage 4 — database patterns ✅ shipped (migration 0016)

- `items` has no index on `is_active` or `name`, so every catalogue
  keystroke is a sequential scan and sort over 2,633 rows.
- Unindexed foreign keys across most tables; four redundant indexes
  fully covered by a unique constraint.
- `updated_at` exists on five tables and is maintained by hand on three —
  no trigger. A maintainer cannot trust the column.
- `audit_log` stores whole rows as jsonb on every write to six tables,
  with no retention policy. It will become the largest table.
- **Write the conventions down**, including the one learned here: a
  migration must be re-runnable, because they're applied by hand and a
  partial failure needs "run it again" to be a safe answer.

### Stage 5 — maintainer handover ✅ shipped

- CLAUDE.md still says Selections and Budgets aren't built, and describes
  Budgets as "budget vs actual per project".
- PLAN.md's "Decisions locked in" promises soft-deleted lines via
  `line_status` — a column that has never existed; the code hard-deletes.
- No `PLAN.md` for Selections, Budgets or Settings, though CLAUDE.md's
  own checklist requires one per tool.
- No documented path for: creating the first admin, what
  `MARATHON_SESSION_SECRET` is, running the import scripts, or recovering
  from a bad migration.
- `REPO-MAP.md` is gitignored and two phases stale — it exists only on
  one machine, where it actively misleads. Delete it.
- Dead code: `components/ui/tooltip.tsx`, three `components/masters/`
  pickers, `lib/masters/space-types.ts`, and five unused exports.

**Deliberately not doing:** pre-commit hooks (CI is the gate — CI and
Prettier themselves _were_ added in Stage 2, reversing the earlier
one-person-era call); Marathon's service-role kiosk design;
per-project permissions — the app boundary _is_ the permission boundary,
which is a real decision, just previously undocumented as a limit.

## Session log

### 2026-08-01 (later still) — Budgets shipped (Phase 4), merged

**Approved in the browser and merged to `master`.** Two things to pick up
next session, neither blocking:

- **Layout and visual design** of the two documents — the founder's words
  were "we'll get to designing the layout as we go." Structure and figures
  are right; the typography isn't finished, and it still uses a
  placeholder letterhead, Helvetica and stand-in terms text.
- **Margin secrecy has not been verified as a non-budgets user.** The RLS
  is written and only `lib/budgets/` touches those tables, but nobody has
  signed in without the grant and confirmed zero rows. Do NOT verify this
  with the service-role key — it bypasses exactly the rules being tested,
  which is how the design-views bug got missed.

Migration `0011`: `item_margins`, `budgets`, `budget_lines`. Then the
inbox, the pricing screen, per-product margins, approval, both documents,
and carry-forward — B1 through B4, the whole tool.

**Carry-forward finally cashes in `line_key`.** Starting a budget for R+1
copies the previous revision's pricing across, matched on the key rather
than the row id. An unchanged line arrives priced, keeping the budget
team's own adjusted quantity; a line the designer resized takes the
designer's new quantity, keeps its unit cost and is flagged for review;
a new line arrives with only its default margin. Rules live in
`lib/budgets/carry-forward.ts` — pure, and the most heavily tested code
in the repo, including the 200-lines-two-touched case.

**Reads are gated too, for the first time.** Every other table in the
schema is readable by any authenticated staff member. These three require
`/budgets` to _select_, not just to write — so a careless join from a
future Indents or PO screen returns zero rows instead of leaking markup.

**`client_rate` is a generated column**, computed by Postgres from cost
and margin. The internal sheet and the client quote therefore cannot
disagree; `lib/budgets/math.ts` reimplements the same formula only so the
screen can show the figure live before saving.

**The repo has tests now** — `npm test`, `node:test` via `tsx`, no new
framework, covering `lib/budgets/math.ts` only. The cases that matter:
an unpriced line never reads as free, a 0% margin charges exactly cost,
and totals sum unrounded values so a column adds up to its own total.

**Approval is reversible.** An approved budget locks its lines (trigger),
but can be re-opened — a cost estimate is fallible in a way a design
specification is not, and the alternative was a whole new revision to fix
one wrong rate. Every re-opening is in the audit log.

**Two numbering systems, and they mean different things** (migration
`0012`). The **R-number** comes from the design and says what was
specified. The **version** belongs to the budget and says which pricing of
it — documents are stamped `R2-v1`, and re-opening starts v2. Added
because reversible approval made references ambiguous: approve, send the
quote, re-open, fix a rate, approve again, and both quotations said
`QT/PLOT6/R2`. The version increments on **re-open**, not on approval, so
the number on screen while pricing is the number that reaches the
document. It can only go up, enforced by the guard trigger.

Two smaller things worth keeping:

- **`item_margins` needed a surrogate `id`.** The shared `audit_row()`
  trigger records `new.id`; a table keyed only on `item_id` would have
  raised at runtime on the first save. Any new audited table needs an
  `id` column.
- **Helvetica has no ₹ glyph.** react-pdf would print a blank box on
  every amount, so `formatAmount()` in `lib/pdf/theme.ts` emits Indian-
  grouped digits with no symbol, and documents state the currency once.
  Don't reuse the app's `formatMoney()` in a PDF.

### 2026-08-01 (later) — Design views (Phase 2b)

Designers upload renders and elevations per space; they appear in the
editor and at the top of each space's sheet in the design document.
Migrations `0009`–`0010`.

One spec in `lib/pdf/theme.ts` (`designView`) drives upload, editor
preview and PDF: **16:9, 1600×900, JPEG, letterboxed not cropped**. Change
it there and all three follow. JPEG specifically because
`@react-pdf/renderer` embeds PNG and JPEG only — the catalogue thumbnails
are WebP because they never leave the browser.

The bucket is **private**, unlike the public `catalogue` one, with its own
storage policies.

Three things worth remembering, all learned by getting them wrong:

- **Server Actions cap the request body at 1MB.** A real render never
  reached the action; it failed inside the framework as an opaque server
  error. The browser now normalises to ~300KB before sending, and the
  server re-normalises since an action is a public endpoint.
- **Supabase Storage has its own RLS**, in `storage.objects`, separate
  from the table. A private bucket starts with _no_ policies — rows exist
  and every image 404s.
- **Verifying with the service-role key proves nothing about a signed-in
  user.** The upload probe passed while the feature was broken for
  everyone, because service role bypasses exactly the rules that were
  missing.

### 2026-08-01 — Selections built (Phase 2)

Branch `feature/selections`, migrations `0006`–`0008` applied. Everything
in the founder's Selections spec is built except paste-from-Excel.

- **Spaces** set up several at a time, with names suggested per type
  (`Bedroom 1`, `Bedroom 2`) and editable before committing.
- **The picker** over all 2,633 items — search on name, code _and_ brand,
  filters for category, brand and placement, tiles designed around the
  fact that two-thirds have no photo. The basket is local, so clicking
  costs nothing and one action writes the lot; spaces are chosen as chips
  so four identical bathrooms fill in one pass. An item already in a
  space has its quantity raised rather than being duplicated.
- **Revisions** — issue (irreversible, guarded in the database), branch
  R+1 carrying `line_key`, and a line-by-line diff.
- **Item requests** — a designer creates a missing item from inside the
  picker and keeps working; Masters resolves it later, with a catalogue
  search seeded on the requested name so duplicates surface first.
  Merging never repoints existing lines: the provisional item survives as
  an alias, because issued revisions are immutable.
- **PDF and CSV** — A4, one sheet per space, drafts watermarked, no rates
  anywhere.

Two things learned the hard way, both worth remembering:

- **Server Actions are the wrong tool for reads.** They dispatch one at a
  time per client, and a revalidating action re-renders the whole route —
  so the picker's search queued behind itself and re-ran four unrelated
  page queries per keystroke. Moved to a Route Handler, which the Next
  docs recommend for exactly this.
- **`useState(prop)` is a bug waiting to happen** in a component that
  survives navigation. The picker's target space was seeded that way and
  kept pointing at whichever space was open when the page first loaded,
  so items silently landed in the wrong room.

Still open: paste-from-Excel; the PDF's real letterhead (logo, address,
GST, terms) and a Geist `.ttf` to replace Helvetica; and the wider
admins-only RLS mismatch on the other master tables (see the note in
migration `0008`).

### 2026-07-31 — Masters shipped, catalogue loaded

Shipped, tested and pushed to `master`:

- **Masters (Phase 1) merged** — Gate 1 approved in the browser.
- **Item codes made usable** — the `code` column existed and was
  editable but was invisible: no column in the table, and search matched
  name only. Added the column and widened search to name-or-code.
- **Catalogue imported (Phase 3, pulled forward)** — 2,631 items, 12
  categories, 18 brands. Data arrived exceptionally clean: no duplicate
  codes, no blanks, and all four constrained columns already using the
  exact values the database allows. `scripts/import-catalogue.ts` is
  dry-run by default and skips codes already present, so it's safe to
  re-run. Verified: 2,633 total, 10 random spot-checks matching on every
  field, and the 44-without-price / 900-with-image counts reconciling
  against the CSV exactly.
- **Migration `0005`** removed the 3 fictional catalogue seed items whose
  categories (`Sofas`/`Dining Tables`/`Lighting`) would have sat beside
  the real `Seating`/`Tables`/`Lighting & Electrical Fixtures`. The two
  material seeds were kept — they're realistic and the only material-side
  data so far.
- **Items list paginated** — with real data the page silently showed
  1,000 of 2,633 (Supabase caps un-ranged queries). Now 50 per page with
  an honest count, a Category filter, and Indian digit grouping on
  prices. Verified by walking all 53 pages: 2,633 distinct rows, zero
  duplicates.

- **Thumbnail pass run** — 897 of 900 uploaded to the `catalogue`
  storage bucket. The 3 that failed (`HANL095`, `HANL114`, `WALL337`)
  return 404 from the vendor's CDN; the source images are simply gone,
  so they fall back to the colour placeholder like any other image-less
  item. This is exactly the link-rot the "store our own thumbnails"
  decision was made to guard against — it showed up on day one.
- **`next.config.ts`** now allows the Supabase Storage host for
  `next/image`, derived from the env var so preview and production each
  resolve to their own project.

Notes for next time:

- The source CSVs live in `data/`, which is **git-ignored** — business
  data belongs in the database, not git history. Say if you'd rather
  have them versioned so the import is reproducible.
- Two decisions got made this session that changed earlier assumptions:
  the item-code convention (above) and the image architecture (above).
  Both are recorded so they don't get re-opened.
