# Indents — build notes

**Status: shipped** (Phase 5, merged 2026-08-03). Migration `0019`.
All five milestones built and founder-tested.

Site teams request materials, numbered per project, approved before
purchase. **No money anywhere in this tool** — an indent carries items,
quantities and units, never cost, margin or rate.

## The idea in one paragraph

Anyone with `/indents` raises an indent on a project (plot/unit/stage
optional), gets a permanent number (`IND/<code>/001`, minted in the
database at creation — deleted drafts leave gaps, accepted), fills it
with lines from up to three sources, and submits it. A named approver
(or an admin) approves it; a rejection sends it back to draft with a
note. Approved indents are what Purchase Orders (Phase 6) consume.

## The rules everything rests on

1. **The status machine lives in the database** (`indents_guard` +
   `indent_lines_draft_only`, migration `0019`): draft → submitted →
   approved, lines and header editable only in draft, approver checked
   DB-side. `lib/indents/workflow.ts` mirrors it for buttons only.
2. **Three line sources, one item master**: a construction budget stage
   (stamps the indent's `stage`), an approved interiors budget line
   (composite FK `(budget_id, line_key)`), or a direct pick through the
   shared catalogue picker. Every line carries its own item/qty/uom —
   provenance anchors are just provenance.
3. **The interiors pull sees money-free views only.**
   `approved_budgets` / `approved_budget_lines` expose no cost, margin
   or rate; `lib/indents/queries.ts` physically cannot select them.
4. **Numbers are permanent.** `reference` is stored at mint;
   `delete_draft_indent()` is the only sanctioned delete, and the
   counter never rewinds.

## Milestones

- [x] **M3 — raise an indent (direct lines).** List
      (`INDENTS_LIST_LIMIT`, exact counts, status tabs), new-indent form
      (code-less projects refused with a pointer to Masters), detail
      with save-on-blur line grid + header fields, direct add via the
      shared picker (`/indents` added to `/api/catalogue`'s allowed
      list), submit / delete-draft with the DB guard's messages
      surfaced.
- [x] **M4 — pull paths.** Both shipped, sharing one `PullBasket`
      component (tick lines or take a whole group, quantities prefilled
      from the plan/budget and editable, nothing written until Add).
      Construction pull stamps the indent's `stage` when a single stage
      is taken and the indent doesn't already name one; interiors pull
      is a two-step route (`?budget=`) over the approved-only views,
      grouped by space with the expected vendor. Lines already on the
      indent are shown, disabled and labelled rather than silently
      skipped. **Margin-secrecy gate passed** — see budgets/PLAN.md for
      exactly what was checked and how.
- [x] **M5 — approval + Overview.** Approve and "Send back" (a
      rejection needs a note — the guard refuses one without) shown only
      to admins and named approvers; the submitted banner tells an
      approver it's theirs to decide. Overview pipeline stage 01 is
      real: indents raised this month and their line count, **no
      invented rupee figure** — an indent carries no money, so it
      reports lines. The CI smoke test was deliberately split out of
      this milestone (founder's call) — see root PLAN.md's "Next up".

## Notes

- Data layer: `lib/indents/queries.ts` (reads, `server-only`) +
  `actions.ts` (writes, file-level `"use server"`), every function
  opening `requireTool("/indents")`. Reads cross-tool tables directly —
  never another tool's gated queries module.
- `lib/indents/reference.ts` mirrors the SQL mint (`lpad` vs `padStart`
  pinned by test); `workflow.ts` is the pure status machine. Both
  tested.
- Approvers are a named list (`indent_approvers`), managed from
  Settings; admins always may. The approver tick doesn't grant the app —
  the Settings header hint covers it.
