# Indents — build notes

**Status: in progress** (Phase 5, branch `feature/indents`). Migration
`0019`. M3 of 5 built; M4 (pull paths) and M5 (approval) remain.

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
- [ ] **M4 — pull paths.** Construction stage pull (budgeted qty
      prefilled, "already requested: N", stamps `stage`) and approved
      interiors pull (via the views + `selection_lines`). **The
      margin-secrecy browser check gates this milestone** — sign in with
      `/indents`, without `/budgets`, never the service-role key.
- [ ] **M5 — approval + Overview.** Approve / reject-with-note on
      `canDecide`, Overview pipeline stage 01 real, CI smoke test (press
      a real save button post-build), merge.

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
