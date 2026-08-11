# TODO — next tasks, in priority order

Read `STATUS.md` first. Anything finished moves to `STATUS.md`, not struck
through here. Audit findings are in `AUDIT.md` with full reasoning.

## 1. Do today — the Marathon PINs are live defaults

`AUDIT.md` SEC-01. The kiosk admin PIN is still the seeded `2026`, and its
plaintext sits in a comment in a **public** GitHub repo
(`supabase/migrations/0002_marathon.sql:154`). Verified still live in
production on 2026-08-11. Anyone who reads the repo can open
`/marathon/admin` and see every runner's name, mobile, age and gender.

In the running app, no deploy needed:

1. `/marathon/admin` → sign in with `2026` → **Change admin PIN**.
2. Delete the seeded **"Test Agent"** member (PIN `1234`, still present; the
   migration said to delete it once real agents existed — four now do).
3. Decide whether the runner list needs telling.

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

## 5. Management group — plan one tool at a time

Three stubs remain: Dashboard, Client Relations, Financial Management. Each
gets its own planning session with the founder before any code. **No order
agreed — ask which comes first.**

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
and running-cost lines on a HOLD line; a cash curve (hand-rolled inline SVG
per `DESIGN.md`, not a chart library).

## 7. From the audit — lower priority

- **Apply migration `0049`** (five Overview indexes). Preventative only —
  tables hold under 100 rows, so it changes nothing today. Nothing waits on it.
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
