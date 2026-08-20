# Indents — the rules

**Shipped 2026-08-03.** Migration `0019`, revision safety in `0028`.

Site teams request materials, numbered per project, approved before purchase. **No money anywhere in this tool** — an indent carries items, quantities and units, never cost, margin or rate.

_Trimmed 2026-08-14: the milestone log lives in git._

## The idea in one paragraph

Anyone with `/indents` raises an indent on a project (plot/unit/stage optional), gets a permanent number (`IND/<code>/001`, minted in the database at creation — deleted drafts leave gaps, accepted), fills it with lines from up to three sources, and submits it. A named approver or an admin approves it; a rejection sends it back to draft with a note. Approved indents are what Purchase Orders consume.

## The rules everything rests on

1. **The status machine lives in the database** (`indents_guard` + `indent_lines_draft_only`): draft → submitted → approved, lines and header editable only in draft, approver checked DB-side. `lib/indents/workflow.ts` mirrors it **for buttons only**.
2. **Four line sources, one item master**: a construction budget stage (which stamps the indent's `stage`), an approved interiors budget line (composite FK `(budget_id, line_key)`), **the villa's official estimate** (`0078` — anchor C, below), or a direct pick through the shared catalogue picker. Every line carries its own item/qty/uom — **provenance anchors are just provenance.**
   - **Anchor C** (`0078`): `estimate_id` → `estimator_estimates` plus the line's own `item_id`; `unique (indent_id, estimate_id, item_id)` is the double-buy rule, and the named CHECK `indent_lines_one_anchor` keeps the three anchors mutually exclusive (the two 0019 CHECKs are unnamed and stay — additive only). The pull reads `estimate_takeoff_facts` (frozen quantities + the material→item link, never a rate), aggregates per material across works, and refuses unlinked materials by name. Quantities land in the ITEM's unit: a person-entered `item_uom_factor` converts, matching unit labels convert 1:1 ('nos' = 'each'), and anything else asks the operator — `classifyEstimatePull` in `pull-rules.ts` is that rule, pinned by tests. An indent may also name the work it serves (`indents.work_item_id`, optional, works masters). **The construction-stage picker is retired** (founder, 2026-08-20: one vocabulary): new indents carry a work, never a stage; `indents.stage`, its 0053 FK and saved values stay as read-only history, and the construction pull still stamps it until Step F removes that path.
3. **The interiors pull sees money-free views only.** `approved_budgets` / `approved_budget_lines` expose no cost, margin or rate; `lib/indents/queries.ts` physically cannot select them.
4. **Numbers are permanent.** `reference` is stored at mint, `delete_draft_indent()` is the only sanctioned delete, and the counter never rewinds.

## Revision safety — the double-buy bug

A unit's design is revised over time and every issued revision gets its own approved budget; **`line_key` is the same line across all of them.** The original pull screen offered every approved budget and scoped "already asked" to one `budget_id` — so the same line could be pulled from R1's budget and again from R2's, **and bought twice.**

The fix has four parts, and all four matter:

- The pull chooser offers only each unit's **issued** revision's budget (`classifyBudgetChooser` in `pull-rules.ts` — pure and tested). A unit whose new revision awaits budget approval shows a greyed pending row.
- **"Already asked" and the add-action dedupe span _all_ of the unit's budgets by `line_key`**, not just the one on screen. Both sides read `approved_budgets` for the sibling list — and **that read must be error-checked**, because an empty result reads as "nothing has ever been ordered" and reopens the double-buy bug through a single database blip. It was doing exactly that until 2026-08-14; it throws now.
- `getBudgetPull` and `addBudgetPullLines` refuse superseded-revision budgets and cross-unit pulls; the `indent_lines_budget_current` trigger (`0028`, security definer) is the boundary that holds against stale tabs and pasted URLs.
- Lines anchored to a revision superseded AFTER they were pulled get a warning badge via `classifyDesignDrift`. Selections' diff page shows the mirror warning with the affected IND/PO references.

## Things that will bite

- **The drift reads must throw, not fall through.** Every lookup feeding `classifyDesignDrift` has the property that an empty result looks like good news — "nothing changed", "nothing superseded", "nothing already ordered". A failed read that returns `[]` tells the site team an indent is safe to order when the design under it has moved. All of them now throw to the error boundary; keep it that way if you add another.
- **Reads cross-tool tables directly — never another tool's gated queries module.** `lib/indents/queries.ts` reads `approved_budgets`, `selections`, `selection_lines`, `po_line_facts` itself.
- **Line pulls insert row-by-row, deliberately — and this is a settled decision, not an open one.** `addDirectLines`, `addConstructionPullLines`, `addConstructionLines` and `addPoolLines` (plus the receipt and issue loops in Inventory) insert one line at a time with no transaction, so a failure part-way leaves some lines added and some not.

  Why it is that way: the quantity guard raises **per line**, with that item's own remaining figure in the message, and a batch insert would fail wholesale on the first refusal — one over-ordered line would silently discard nine good ones and say nothing useful about which. Each pull therefore reports partial success honestly ("Added 3, then stopped: …") and the person fixes the one line and pulls again.

  What the atomic version would look like, if it is ever worth building: one database function that loops server-side and returns a per-row summary — atomic, one round trip, and still able to say which line was refused and why. Marathon's `marathon_create_entry` is that shape already. **Reviewed and accepted as-is on 2026-08-17**: the trade is a real one, every site says so in its own comment, and rewriting four money-adjacent write paths to buy atomicity nobody has yet been hurt by is not a good use of a day. Revisit it if a partial pull ever confuses somebody in practice.

- **Approvers are a named list** (`indent_approvers`), managed from **Settings**, not here; admins always may. The approver tick doesn't grant the app.
- `lib/indents/reference.ts` mirrors the SQL mint (`lpad` vs `padStart`, pinned by test). If one changes, both change.
