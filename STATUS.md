# Goodearth Toolbox — status & session log

Source of truth for **where we are**: what's shipped, which decisions
are settled, and the session log. (This file was `PLAN.md` until
2026-08-03; the forward-looking half now lives in **`TODO.md`** — the
detailed, pick-up-cold plan for the next phases.)

> **How this file works.** Updated at the end of every working session:
> record what shipped, correct where reality disagreed with the plan,
> move finished items out of TODO.md into here. Per-tool detail lives in
> `app/(dashboard)/<tool>/PLAN.md` (and `app/marathon/PLAN.md`); durable
> rules live in CLAUDE.md; full history lives in git. This file stays
> lean — pruned 2026-08-03 after Phase 5, and again whenever finished
> work stops being useful context.

---

## Where we are right now

**Phase 6 (Purchase Orders) shipped and merged on 2026-08-03** — the
same day it was planned and built. The chain now runs design → price →
indent → **PO with GST and a printable document**: approved indent
lines become one-vendor, one-plot/unit POs (`PO/SAA/V12A/001`), priced
against a managed GST slab list, issued, printed on the (still
placeholder) letterhead, with an admin-approved deletion flow, avatars
on every line, and "ordered X of Y" back on the indents.

**Phase 7 (Inventory) is built on `feature/inventory`, migration `0023`
is applied, and the whole verification chain is green** (typecheck,
build, 74 tests, `check:actions`). What remains is the founder's three
browser gates on the preview, then the merge. See
`app/(dashboard)/inventory/PLAN.md`.

|                     |                                                                                                                    |
| ------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Last worked         | 2026-08-03                                                                                                         |
| Branch              | `feature/inventory` — built, not yet merged                                                                        |
| Migrations applied  | `0001`–`0023` (next new one is `0024`)                                                                             |
| Items in database   | **2,633** (2,631 imported catalogue + 2 material seeds)                                                            |
| Categories / brands | 14 / 21                                                                                                            |
| Thumbnails          | **897** in Supabase Storage; 1,736 items use the colour placeholder                                                |
| Built tools         | Marathon, Settings, Masters, Selections, Budgets (Interiors + Construction), Indents, **Purchase Orders**          |
| Tests               | `npm test` — 74: pricing, carry-forward, diff, references + workflows, PO GST math, stock arithmetic, PIN, formats |

## Phase status

| #   | Phase                                                                                                  | Status                                    |
| --- | ------------------------------------------------------------------------------------------------------ | ----------------------------------------- |
| 0   | Platform hardening — `user_apps` grants, `requireApp()`, generated Supabase types, migration rules     | ✅ Done                                   |
| 1   | **Masters** — projects, plots, units, clients, vendors, stores, items, categories, brands, space types | ✅ Shipped 2026-07-31                     |
| 3   | **Catalogue import** — the real 2,631-item catalogue                                                   | ✅ Done — pulled forward                  |
| 3b  | **Thumbnail pass** — catalogue images into Supabase Storage                                            | ✅ Done                                   |
| 2   | **Selections** — per-unit design workspace + the catalogue picker                                      | ✅ Shipped, merged 2026-08-01             |
| 2b  | **Design views** — renders per space, in the design document                                           | ✅ Shipped, merged 2026-08-01             |
| 4   | **Budgets** — cost + margin → client rate, approval, two documents                                     | ✅ Shipped, merged 2026-08-01             |
| 5   | **Indents + Construction tree** — three line sources, QS stage-wise plans, approval                    | ✅ Shipped, merged 2026-08-03             |
| 6   | **Purchase Orders** — scope-numbered POs from approved indents, GST, guarded deletion, PDF             | ✅ Shipped, merged 2026-08-03             |
| 7   | **Inventory** — goods receipt, stock on hand, issues, adjustments                                      | 🔨 Built + `0023` applied, awaiting gates |
| 8   | Bills — against POs and labour contracts                                                               | ⬜ Planned — see TODO.md                  |
| 9   | Overview wired to real data + one real project end-to-end                                              | ⬜ Not started                            |

**Why 3 came before 2:** the catalogue picker was designed against
2,631 real items from day one instead of five samples. Same work,
better order.

## Next up

### Load the founder's master data

Agreed 2026-08-01, still pending: the founder will supply lists to load
into Masters — clients, plots, units, and whatever else is ready
(spreadsheet/CSV preferred, one per master). Do it the way
`scripts/import-catalogue.ts` did: a re-runnable script, dry-run by
default, skip rows already present, verify counts and spot-checks
after. Things to watch:

- Plots and units need their project named per row, and
  `unique (project_id, name)` (migration `0017`) will refuse duplicates
  within a project — clean the list rather than the constraint.
- Status value lists (`planning/active/completed`,
  `available/reserved/sold`) are still my defaults, never confirmed —
  ask whether they match how Goodearth actually talks before importing.
- Source files go in `data/` (git-ignored, like the catalogue CSVs).

### Phase 7 — Inventory: walk the gates, then merge

`0023` is applied and the types are regenerated and committed. One step
remains: **walk the three founder gates in the browser** on the
`feature/inventory` Vercel preview (grant yourself `/inventory` in
Settings first) — see `app/(dashboard)/inventory/PLAN.md`. Merge to
`master` only after they pass, with a local Playwright smoke before the
merge and one real write-button press on production after the deploy.

### Letterhead assets (any session, before the next PDF-heavy phase)

The whole PDF layer still prints on a placeholder letterhead in
Helvetica (no ₹ glyph — amounts are digits-only via `formatAmount`).
When the founder supplies the logo, registered address, company GST
number and standard PO terms, swap them into `lib/pdf/document.tsx`'s
`Letterhead` (one place); a Geist `.ttf` registered there lifts every
document at once. Deliberately did not block the Phase 6 merge.

### Smaller pending items (any session)

- Migrate Selections onto the shared
  `components/masters/catalogue-picker.tsx` — it kept its own copy
  (space chips, request-item extras) when the shared picker was
  extracted in Phase 5.
- Selections: paste-from-Excel (deferred from Phase 2).
- The wider admins-only RLS mismatch on master tables — see the note in
  migration `0008`.
- **Database clean-up once the app is fully rolling** (founder's call,
  2026-08-03): test indents `IND/SAA/001`–`005` and the inert
  `claude-preview-probe@goodearth.test` account. Approved indents and
  the probe user need SQL in Studio — the app refuses both by design
  (see "Deferred" below on actor FKs).

## Decisions locked in

- **One `items` table** for catalogue products and raw materials, split
  by `kind`.
- **Prices are snapshotted** onto lines at pick time; master price
  edits never rewrite existing lines.
- **An ISSUED selection revision is immutable** — a database trigger
  refuses every write to its lines (migration `0006`). Draft lines are
  deleted outright; there are no soft deletes, and downstream tools
  must not expect them. History is preserved by the revision itself
  plus the audit log.
- **`line_key` is a line's cross-revision identity.**
  `create_next_revision()` copies lines forward carrying their keys, so
  Budgets prices against the key, never the row id — an unchanged line
  keeps its price across revisions instead of being re-priced from
  scratch. Downstream anchors use the composite `(budget_id, line_key)`.
- **Margin is Budgets-only** — `budgets`, `budget_lines` and
  `item_margins` require `/budgets` to _select_, not just write. The
  **one** sanctioned window through that RLS is the
  `approved_budgets` / `approved_budget_lines` security-barrier views
  (migration `0019`), whose column lists ARE the boundary: no
  `unit_cost`, `margin_pct` or `client_rate`, ever. Never add a column
  to them without checking which side of the boundary it sits on, and
  never add a second row-level SELECT policy on `budget_lines`
  (permissive policies OR together).
- **Access = per-user app grants.** `requireApp()`/`requireTool()`
  first in every action and query; sidebar visibility is cosmetic only.
- **Indents carry no money, anywhere.** They are items, quantities and
  units; value enters the system at the PO.
- **Indent numbering** is `IND/<projects.code>/NNN`, minted in the
  database at creation and stored; deleted drafts leave permanent gaps
  (accepted). A code-less project refuses indent creation with a
  friendly message. **Approved is terminal** — the document POs are
  raised from; there is no path back and no delete.
- **Construction plans** (Budgets · Construction) are materials +
  quantities only: free-form text stages, no approval, no revisions,
  one living plan per unit (unique `unit_id`), QS-owned under
  `/budgets`.
- **Indent approvers are a named list** (`indent_approvers`, managed
  from Settings; admins always may), enforced by the database guard —
  like every status rule: the triggers are the boundary, buttons are a
  courtesy.
- **POs come from approved indents only** — no direct POs; a purchase
  always has an approved request behind it. One PO = one vendor + one
  plot/unit ("GEN" for general), because the scope is part of the
  number: `PO/<project code>/<plot-or-unit code>/NNN`, numbers running
  per scope, minted in `create_purchase_order()`. Plot/unit short codes
  live in Masters like `projects.code`.
- **PO money is gated; PO facts are not.** SELECT on
  `purchase_orders`/`purchase_order_lines` requires `/purchase-orders`
  (the Budgets precedent). The one sanctioned money-free window is the
  `po_facts` / `po_line_facts` views (migration `0022`) — quantities,
  references and statuses, **never a rate**; their column lists are the
  boundary, exactly like `approved_budget_lines`.
- **Over-ordering is impossible at the database**: unique
  `(po_id, indent_line_id)` + the advisory-lock-serialised
  `po_lines_qty_guard` cap every indent line at its approved quantity
  across all non-cancelled POs. A PO line's uom is not editable — it
  stays the indent line's unit so the guard's comparison stays honest.
- **GST slabs are a managed master** (`gst_rates`, Masters tab), picked
  per PO line and snapshotted into `gst_pct` — no FK, the
  price-snapshot principle. PO amounts are computed, never stored.
- **Deleting an issued PO takes an admin's yes** — request with a
  mandatory note → admin approves (→ cancelled, quantities return to
  the pool) or refuses; the requester may withdraw. Draft POs are their
  creator's (or an admin's) to delete. Trigger-enforced.
- **Attribution everywhere** — every line grid and status banner shows
  the acting user's avatar (name on hover) via
  `components/ui/attribution.tsx`; actions stamp `updated_by`.
- **Item codes:** Goodearth's real convention is a 4-letter _sub-type_
  prefix + 3-digit sequence (`BENS001`, `SOFS…`) — finer than category.
  Nothing auto-generates codes today; whenever that's built it must
  follow this convention and cannot key off `item_categories`.
- **Images:** thumbnails are ours, full images stay borrowed links,
  image-less items get a colour placeholder (see below). Image fetching
  is never bundled into a data import — remote fetches must not be able
  to damage a clean load.

## Images — the settled rules

897 thumbnails live in the public `catalogue` Storage bucket
(`items/<item id>.webp`, ~5 KB each) via the re-runnable
`scripts/fetch-catalogue-images.ts`; safe to re-run when new catalogue
rows arrive.

- **Grid tiles load `thumb_url` only**, never `image_url` (30 full
  vendor images per page ≈ 15 MB vs ~150 KB of thumbs).
- `image_url` stays a link to the vendor's CDN for a future detail/zoom
  view. If one is ever built, `cdn.shopify.com` must be added to
  `next.config.ts` `images.remotePatterns` — deliberately absent today.
- **1,736 items have no image** and render the `lib/color-hash.ts`
  placeholder (item code on a stable colour). That's the majority case
  — tiles are designed for it first, not as a fallback.

## The three documents

The system's real output, and the reason Budgets is shaped the way it
is. All three are built.

|                         | Produced by | Contains                                                                              | Audience                    |
| ----------------------- | ----------- | ------------------------------------------------------------------------------------- | --------------------------- |
| **A · Design document** | Selections  | Spaces view by view — uploaded renders — with the items specified in each. No prices. | Client, for design sign-off |
| **B · Budget sheet**    | Budgets     | Every element with quantity, **cost, margin** and client rate                         | Internal only               |
| **C · Client quote**    | Budgets     | Views, items, quantity, **client rate and amount**, totals                            | Client                      |

B and C are the same data, filtered — and the separation is structural,
not cosmetic: C renders from `QuoteData` (`lib/budgets/quote.ts`), a
type with **no cost or margin field at all**, so a template mistake is
a compile error rather than a leaked margin.

## Open decisions — ask at the phase that needs them

| Phase | Question                                                      |
| ----- | ------------------------------------------------------------- |
| 2     | Can a design start on an unsold unit (`client_id` null)?      |
| 6     | PO numbering format; letterhead assets (logo, address, terms) |
| 8     | Does bill approval need a different person than the recorder? |

Also still unconfirmed from Phase 1: the `status` value lists for
projects (`planning`/`active`/`completed`) and plots/units
(`available`/`reserved`/`sold`) were chosen as sensible defaults, not
specified by the founder — confirm before the master-data import.

## Deferred, with the trigger for revisiting

Two audit passes ran on 2026-08-01 (five stages, then a second pass)
before the maintainer joined; everything they found is fixed and
merged, and the durable rules they produced are in CLAUDE.md (fetchAll
vs stated-limit reads, never count from `rows.length`, the shared
plumbing, migration conventions). What's still **live** from them:

- **`audit_log` retention**: it will become the biggest table, and that
  is fine for years at this scale. Revisit (monthly partitioning on
  `at`, or pruning `old_data`/`new_data` beyond ~12 months) when it
  passes a few million rows or Studio queries on it feel slow.
- **Actions trust the relationships in their inputs** (the DB
  constraints are the boundary; ~200 trusted staff is the threat
  model). Revisit only if the platform ever faces outsiders.
- **Actor foreign keys** (`created_by`, `issued_by`, `priced_by`…) are
  `NO ACTION`, so a person who has ever touched anything cannot be
  deleted from auth — this is why the probe test user is inert rather
  than gone. Fix as one migration flipping them to
  `on delete set null` whenever offboarding first needs it.
- **Audit triggers on `items`/`vendors`/`item_requests`**: none today.
  Must land **before Purchase Orders ship**.
- **`space_views` storage orphans**: deleting a space cascades its view
  rows but nothing deletes the JPEGs from the private bucket. Cheap
  disk, invisible; fix by `on delete restrict` or a reaper, someday.
- **Two accepted small races**: `moveSpaceView`'s sort swap can
  transiently duplicate a sort_order (self-heals on next save), and
  Marathon's PIN `recordFailure` is read-then-write so a scripted
  attacker gets a couple of extra guesses before lockout. The Marathon
  one rides the next Marathon migration as a DB-side increment.
- **`lib/selections/views.ts` stays where it is** (shared surface,
  documented in the file and CLAUDE.md) — move it only if a third
  consumer appears.
- **The full CI browser smoke test was costed and declined**
  (2026-08-03, ~200-user call): it needed a permanent login in GitHub
  secrets, wrote to the live database on every push, and could fail for
  unrelated reasons. The lean guard that shipped instead
  (`npm run check:actions`) catches the outage class; revisit only if a
  _different_ runtime action failure ever reaches production.

## Environment & working notes

- **Production**: `goodearth-toolbox.vercel.app`, auto-deploys from
  `master`. After any deploy that changes server actions, **press one
  real write-button on production** — the outage habit. CI's
  `check:actions` guards the known crash class; a human press guards
  the unknown ones.
- **Pre-push habit for server-action work**: local Playwright smoke —
  install in the session scratchpad (`npm i playwright`,
  `npx playwright install chromium`), `npm run build && npm start`,
  drive `localhost:3000` as the probe user (reset its password via the
  Supabase auth admin API; it's never stored), then clean up any rows
  created.
- `sharp` can't load its win32 binary on the dev machine, so
  Selections' actions module (design-view uploads) fails **locally
  only** — Vercel/linux is fine. Don't chase it as an app bug.
- The `npm test` glob is shell-dependent (`tsx --test "lib/**/*.test.ts"`)
  — if tests ever appear not to run, check that before assuming green.
- Git Bash rewrites leading-slash strings like `/budgets` into Windows
  paths (MSYS path conversion) — use PowerShell for REST calls whose
  arguments contain app slugs.
- Source CSVs for imports live in `data/`, git-ignored — business data
  belongs in the database, not git history.

## Session log

### 2026-08-03 (later still) — Phase 7 built in one sitting

The founder answered the three kickoff questions and Inventory was
built end to end on `feature/inventory`: migration `0023` (goods
receipts, stock issues, adjustments, the computed `stock_on_hand` view,
five guards and two minting functions), two pure modules with 13 new
tests, the whole data layer, and all four screens — Receive, Stock,
Issues, Adjustments — plus a deliveries section on the PO detail page
and Overview pipeline stage 03 going real.

**One decision changed the plan:** TODO.md assumed issues went to a
"manufacturing" bucket. The founder's answer was that a location is
either a store or a plot, so `stock_issues` sends material to another
store (a transfer, with both halves showing in stock) or to a plot
(consumed there). There is no manufacturing destination.

**Two things the plan didn't foresee.** The PO completion trigger is
`security definer` and the guard re-checks the outstanding quantities
itself, so the transition is self-validating and no RLS policy had to
widen. And every column of a Postgres view is typed nullable by the
Supabase generator — the `po_facts`/`po_line_facts` reads normalise the
row shape once at the boundary rather than defending against nulls at
every use.

Nothing is merged: `0023` is unapplied, and all three gates are
unwalked.

Compact by design — one entry per working day. Full detail: git
history and the per-tool PLAN.md files.

### 2026-08-03 (later) — Phase 6 planned, built, founder-tested and merged in one sitting

The founder approved the full Phases 6–8 feature overview (POs /
Inventory / Bills), then Phase 6 shipped through all four milestones on
`feature/purchase-orders`: migrations `0020` (audit prerequisite) +
`0021` (PO schema, guards, per-scope numbering) + `0022` (money-free
fact views), pure modules with 15 new tests, Masters groundwork
(plot/unit codes, GST Rates tab), the raise-and-price flow, the
issue/deletion status machine, attribution avatars, indent fulfilment,
the PO PDF and a real Overview stage 02. Two founder-found fixes: the
qty input was squeezed (column widened, uom moved under it), and the
Issue button read a stale server snapshot after on-blur rate saves — it
stayed dead until an unrelated navigation. The button now needs only
lines to exist; pricing is checked at click time server-side, where the
saved rates are visible. Merged to `master` same day, branch deleted;
letterhead assets still pending (see "Next up"). This file was renamed
`PLAN.md` → `STATUS.md`, and the forward plan for Phases 7–8 moved to
the new `TODO.md`.

### 2026-08-03 — Phase 5 shipped end to end; an outage found, fixed and guarded

**Phase 5 built and merged in one day**, five founder-gated milestones
on `feature/indents`: migration `0019` + Masters project codes +
Settings approver column (M1); the Construction tree in Budgets (M2);
the Indents app with direct catalogue lines (M3); both pull paths
sharing one `PullBasket` (M4); approve/send-back and a real Overview
pipeline stage 01 (M5). The founder corrected the scope at kickoff —
Budgets grew the Construction tree because house construction needs
quantity plans, not client quotes. Everything durable from the phase is
now in "Decisions locked in" and the indents/budgets PLAN.md files.

**The production outage.** Every write-button on production had been
dead for two days while every page rendered: a bare
`export type { ActionState };` in a `"use server"` file survives into
the compiled chunk's runtime export list, where the name doesn't exist,
killing every action in the chunk at module load. `tsc`, ESLint, tests
and `next build` were all green throughout. Hotfixed to `master`;
the rule and its **automatic enforcement** (`npm run check:actions`,
in CI after the build — source pass + compiled-fingerprint pass, the
fingerprint derived by rebuilding the bug on purpose and verified in
both directions) are in CLAUDE.md. The full browser smoke test was
considered and declined — see "Deferred".

**Margin secrecy finally proved** (outstanding since Budgets shipped):
as a real staff user holding `/indents` without `/budgets` — never the
service-role key — `budgets`/`budget_lines`/`item_margins` return zero
rows, the approved-only views return rows with no money columns, and no
rupee figure appears anywhere in Indents. Recorded in budgets/PLAN.md.

**Verification habits that paid off:** Playwright smoke passes before
every push (13/13, 17/17, 5/5-on-production); assertions checked
against the database and screenshots before "fixing" anything
(`innerText` doesn't return `<input>` values — two false failures);
test data cleaned up through the guard's own paths, which proved the
status machine holds from every direction.

**Leftovers, deliberate:** `IND/SAA/001`–`004` are the founder's
production tests (004 approved), `005` mine (approved, undeletable by
design), `006` a burnt number from the post-deploy check; the probe
user is inert (all grants revoked). All cleaned up together when the
founder calls the general database clean-up.

### 2026-08-01 — audits, mobile shell, Selections, design views, Budgets

**Selections (Phase 2)**: spaces, the picker over 2,633 real items,
issue/revision/diff on `line_key`, item requests, PDF + CSV. Lessons
that stuck: Server Actions are the wrong tool for reads (the catalogue
search moved to a Route Handler); `useState(prop)` in a component that
survives navigation silently targets the wrong record.

**Design views (Phase 2b)**: renders per space, one spec
(`lib/pdf/theme.ts` `designView`) driving upload, preview and PDF.
Lessons: Server Actions cap request bodies at 1 MB (normalise images
client-side first); Supabase Storage has its **own** RLS in
`storage.objects` and a private bucket starts with none; verifying with
the service-role key proves nothing about a signed-in user.

**Budgets (Phase 4)**: pricing on `line_key` with carry-forward,
per-product default margins, reversible approval with a version number
(`R2-v1`; version bumps on re-open, not approval), both documents, and
the first tests in the repo. Two rules that generalise: any audited
table needs a surrogate `id` (the shared `audit_row()` trigger reads
`new.id`), and Helvetica has no ₹ glyph — PDFs print digits-only via
`formatAmount`, never the app's `formatMoney`.

**The audits** (five stages + a second pass, all merged after
founder-tested gates): privilege escalation closed, the 1,000-row
truncation bug killed in six places, PIN rate-limiting, `lib/format.ts`
and the shared primitives/hooks extracted, database indexes and
`updated_at` triggers, docs corrected, dead code deleted; CI + Prettier
added now that `master` auto-deploys and a maintainer is joining. One
production hotfix from the same day's browser testing: a Server
Component can't pass a function to a Client Component — the pager takes
precomputed href strings, and consolidations that change who renders a
component need their consumers opened in a browser, not just built.
What's still live from the audits is the "Deferred" list above.

### 2026-07-31 — Masters shipped, catalogue loaded

Masters (Phase 1) merged after Gate 1. The real catalogue imported —
2,631 items, exceptionally clean, via the dry-run-by-default
re-runnable `scripts/import-catalogue.ts`; verified by count
reconciliation and spot-checks. Items list paginated with honest counts
(the first sighting of the 1,000-row cap). Thumbnail pass: 897 of 900
fetched, 3 vendor URLs already dead — the link-rot that justified
storing our own thumbnails showed up on day one.
