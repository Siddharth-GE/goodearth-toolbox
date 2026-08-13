# TODO — next tasks, in priority order

Read `STATUS.md` first. Anything finished moves to `STATUS.md`, not struck
through here. Audit findings are in `AUDIT.md` with full reasoning.

## 1. Do today — two Marathon agents are on the published PIN

**The admin PIN is done.** Rotated by the founder on 2026-08-11; verified
against production the same evening — `2026` no longer matches the stored
hash, and `marathon_config.updated_at` is 09:10 UTC that day. `AUDIT.md`
SEC-01's headline is closed.

What the same check turned up, and what is left:

1. **Two active agents still have PIN `1234`** — Ravi and yema. That is the
   seeded test PIN, in plaintext in a **public** repo
   (`supabase/migrations/0002_marathon.sql:151`), and the first PIN anyone
   guesses. `/marathon/admin` → Members → **Reset PIN** on both.
2. **"Test Agent" is still on the list** (5 agents). Its PIN has been reset,
   so it is no longer the published one, but the migration's instruction was
   to delete the row once real agents existed. Delete it.

Smaller than the admin hole — an agent reaches entry capture, not the admin
panel and not the full runner list — but it is the same shape: a published
default, still live. Both are fixes in the running app, no deploy needed.

Rewriting the migration would fix nothing — it is in public git history
permanently, and editing an applied migration breaks the additive-only rule.
Rotation is the only remedy.

## 2. The slow first load is cold starts

`AUDIT.md` PERF-01. Measured: warm TTFB ~0.16s, cold ~1.14s — a 7× gap that
lands on the reported 1.3s. Not queries, not the region (both are Mumbai),
not the bundle.

Enable Fluid compute / keep-warm on Vercel and re-measure. This is a billing
decision, so it needs the founder. Everything else in performance is already
correct, so if this doesn't move the number, the next step is Speed Insights
split by cold vs warm — not more code changes.

## 3. Untangle the one cross-tool import

`AUDIT.md` MOD-01. `lib/budgets/quote.ts:3` imports `lib/selections/views` —
the only place one tool imports another's code. Break Selections and the
Budgets quote PDF stops compiling.

This file already carried a note to move `lib/selections/views.ts` to
`lib/design-views/` "once a third consumer appears". **The count is the wrong
trigger** — the second consumer is already the rule violation. Move it now, or
have Budgets read the bucket itself. Roughly 20 lines either way.

## 4. Relay — what is left, in order

The relay, departments, project schedule, trail types and house screen are
built; see `app/(dashboard)/relay/PLAN.md`.

- **Unit-level stages.** Each unit stage maps to one project stage so a
  villa's progress rolls up into the project picture; plus quests (a current
  stage with nothing running) and clearing a finished stage. Additive on
  `project_stages`. **Build into the existing house screen**
  (`/relay/projects/[projectId]/houses/[unitId]`), don't add a page.
- **The game.** Leaderboard, podium, ranks, the clean streak (a day counts if
  you neither ended it holding an overdue baton nor let one go overdue) and
  active days. `lib/relay/points.ts` is written and tested — this is mostly
  screens plus two scoring views.
- **The seams.** `pusher_chain_links` surfaced both ways, Google Chat
  notifications (fire-and-forget, never block a write), and `getRelayPulse()`
  grown into what the collated Dashboard reads.

Two small known gaps: no inline editor for a queued trail's activities in the
waiting list (the write path `replaceFutureLegs` exists and is current, just
unwired), and no "Open a trail" button on the Projects landing page (one click
away already; not asked for).

## 5. Reporter — next is Stage 8, the remaining datasets

The Reporter is live through Stage 7: builder, dropdown filters, grouping,
subtotals, charts, CSV, saved reports with copyable starting points, **the
money** (`0055`: PO rates, bill amounts, budget cost/client rate/margin via
widened quals; amber warning beside the Settings checkbox) and **sales &
collections** (`0056`: `crm_milestone_facts` + `crm_receipt_facts`, owner
views whose WHERE and column list are the gate — the prose columns never
leave the CRM). Two datasets, never one join: a milestone with three
receipts would triple a sum; the view's own `received_amount` aggregate is
the one sanctioned crossing. Before Stage 6 merged, only one non-admin held
`/reporter` (the probe) — worth remembering when granting it next.

**Three starting points ship so far** (Site & procurement, Spend vs budget,
Sales & collections). The rest each need a dataset that does not exist yet; a
starter ships with its data. No client receipts are recorded yet, so the
receipts dataset shows an honest empty state until Client Relations records
one.

The full plan is **`app/(dashboard)/reporter/PLAN.md`**. Read it before
touching anything below. Three stages remain, each shippable and
browser-testable on its own:

8. **The remaining datasets** and their starters.
9. **PDF** — Recharts → `sharp` → PNG → react-pdf.
10. **Plan vs actual** — `0057`, Business Planning publishes targets.

Three things the founder decided that are easy to lose:

- **Reporter shows full line-level money, including client rate and margin %.**
  After Stages 6 and 7, granting `/reporter` shows every vendor rate, every bill
  amount and the markup on every quoted line. One grant, grantable to anyone in
  Settings — so the Settings copy beside the checkbox must say so. This is the
  widest permission change the app has made.
- **It is a builder, not a fixed shelf of reports.** Seven starting points ship
  as code constants you can bend and "Save a copy" of.
- **Charts are core, not a nice-to-have**, and a report is a composed page —
  headline figures, chart, then the table with subtotals.

**Financial Management is now the one Management stub with no plan**, and it gets
its own session with the founder before any code. It has an obvious first
question: Client Relations already holds every rupee coming in, and Bills holds
every rupee going out. Whatever that tool becomes, it reads those two rather than
re-recording either — and CRM's tables are grant-gated on SELECT, so it needs a
money-free view with a hand-written column list, never a second policy. Note that
Reporter's `0056` will already have built two such CRM fact views; check them
before writing a third.

Two follow-ups the founder asked to defer on Client Relations:

- **Grant `/client-relations` in Settings** to Anu, Sayooj and Sebastina.
  Until then only admins can see the tool at all.
- **The sheet's "Blocked" plots (34, 35, 43) are `reserved`** — the schema has
  no blocked status and `import-saarang.ts` mapped them across. Nobody has
  confirmed that reads right on screen.

## 6. Business Planning follow-ups

Neither blocking, both for when the founder next uses it in anger:

- **Grant it to whoever needs it.** Admin-only today. It carries land cost,
  profit and peak funding, so the grant is the whole boundary — SELECT is
  gated, not just writes.
- **Carry the peak-funding finding into how plans are discussed.** The
  workbook's "peak funding ₹5.91 Cr" is `-MIN(closing cash)` and comes out
  negative: cash never goes below zero, so that is headroom at the worst
  month, not money to raise. The tool reports peak funding as zero and the
  trough separately.

Wanted later, none asked for yet: a one-page PDF of a plan; itemised charge
and running-cost lines on a HOLD line; a cash curve.

**The cash curve's instruction has changed.** This line used to say "hand-rolled
inline SVG per `DESIGN.md`, not a chart library". Reporter's Stage 3 adds
`recharts` and the shared `components/ui/chart/*` wrappers, so once that lands
the cash curve uses those like every other chart — a second, hand-rolled charting
approach in the same app is exactly the drift the shared components exist to
prevent. If Business Planning gets there first, build the wrappers as part of it
and Reporter reuses them.

## 7. From the audit — lower priority

- **CI check pinning the money-free views' column lists** (`AUDIT.md` SEC-02).
  Those views bypass RLS by design; their column list _is_ the boundary and a
  comment is currently the only guard. ~30 lines. Needs a decision on where
  the authoritative list lives.
- **Confirm `indent_approvers`/`bill_approvers` are Settings-owned**
  (`AUDIT.md` MOD-03). Documented that way in `CLAUDE.md`; say if you'd rather
  the code moved instead.
- **Marathon per-run counts** are N+1 (`AUDIT.md` PERF-03). Needs a database
  function to fix properly. Trivial at 11 rows.
- **Line pulls could be atomic** (`AUDIT.md` QUAL-03) using the pattern
  Marathon's bib numbering already uses — a server-side loop in one function,
  keeping the per-row refusal messages. Real design change to a working,
  reasoned trade-off.

## 8. Not yet planned

- **Phase 9** — Overview fully real, plus one real project run end to end.
  No approved plan; this file gets one when the founder approves it.
- **Backups.** Supabase managed backups only, with no independent export.
- **Staging environment.** Preview URLs cover most of it today.
- **Downtime mode.**

## Smaller, any session

- PO-anchor picker in the Bills record form: move to server-side search (the
  `/api/catalogue` pattern) once the PO list makes the form payload
  noticeable — it currently ships every issued/completed PO.
- ~35 remaining `{ data }` destructures with no `error` check
  (`AUDIT.md` QUAL-04). The two that mattered are fixed; the rest are
  display-only lookups. A slow tidy, not a project.
