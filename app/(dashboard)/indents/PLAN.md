# Indents — the rules

Site teams request materials, numbered per project, approved before purchase. Grant `/indents`. Migrations `0019`, `0028`, `0078`. **No money anywhere in this tool** — items, quantities and units, never cost, margin or rate.

## The idea

Anyone with `/indents` raises an indent on a project (plot, unit and the **work** it serves optional), gets a permanent number (`IND/<code>/001`, minted in the database — deleted drafts leave gaps, accepted), fills it from up to three sources, and submits it. A named approver or an admin approves it; a rejection sends it back to draft with a note. Approved indents are what Purchase Orders consume.

## The rules everything rests on

1. **The status machine lives in the database** (`indents_guard` + `indent_lines_draft_only`): draft → submitted → approved, editable only in draft, approver checked there. `lib/indents/workflow.ts` mirrors it for buttons only.
2. **Three line sources, one item master**, and every line carries its own item, quantity and unit — anchors are provenance only:
   - an **approved interiors budget** line — composite FK `(budget_id, line_key)`;
   - **the villa's official estimate** (`0078`) — `estimate_id` plus the line's `item_id`; `unique (indent_id, estimate_id, item_id)` is the double-buy rule;
   - a **direct pick** through the shared catalogue picker.
     `indent_lines_one_anchor` keeps the anchors exclusive. The retired construction-plan source, `construction_line_id`, `indents.stage` and their saved rows stay forever as read-only history — retirement is UI-only, never schema.
3. **The estimate pull** reads the **official** estimate only — the screen names it and its date, and says the QS's later changes arrive once they make it official again. An indent raised for a work offers **that work's materials** (`factsForWork`; "Show every work" widens it) — listing the whole villa under Footing is how sand, jelly and steel read as missing (2026-10-08). It reads `estimate_takeoff_facts` (frozen quantities and the item each is bought as, never a rate) and groups **per item** across works (`groupEstimatePull`, keyed on `item_id` — `material_id` is null on every row since `0086`, BUGCATCHER #16). "Already requested" counts estimate-anchored lines on **every indent of the villa** (`requestedByItem`), so a re-issued official never reopens double-buying; a pull for one work also shows that work's own figure beside it. Estimates from before `0086` convert fact by fact (`classifyEstimatePull`, tested); a row with no item cannot be picked.
4. **The interiors pull sees money-free views only** — `approved_budgets(_lines)`; `lib/indents/queries.ts` cannot select a cost.
5. **Numbers are permanent.** `delete_draft_indent()` is the only delete, and the counter never rewinds. `lib/indents/reference.ts` mirrors the SQL mint under test.

## Revision safety — the double-buy bug

Every issued revision of a unit's design gets its own budget, and **`line_key` is the same line across all of them** — so one line could once be pulled from R1's budget and again from R2's, and bought twice. Four parts close it, and all four matter:

- The chooser offers only each unit's **issued** revision's budget (`classifyBudgetChooser`, tested); a revision awaiting its budget shows greyed.
- **"Already asked" spans all of the unit's budgets by `line_key`** — and that read is error-checked, because an empty result reads as "nothing ordered" and reopens the bug through one database blip.
- `getBudgetPull`/`addBudgetPullLines` refuse superseded budgets and cross-unit pulls; the `indent_lines_budget_current` trigger (`0028`) holds against stale tabs and pasted URLs.
- Lines whose revision was superseded after the pull get a warning badge (`classifyDesignDrift`); Selections' diff page shows the mirror warning.

6. **A material moves in its Masters unit.** Every line except an interiors one is saved in the item's `default_uom` whatever the browser sends (`updateLine` re-reads it; the grid shows it as text) — a cement line switched to cft once rode onto the PO, the receipt and the stock sum beside bags. Interiors lines keep the selection's unit (a tile per sqft). Adjustments and issues follow the same rule (Inventory). `scripts/report-unit-mismatches.ts` lists anything saved before it.
7. **Still to buy** = requested less what live POs ordered (`stillToBuy`, never negative), shown per line, as a count on an approved indent, and on the printed indent (`/indents/[id]/pdf`, inline — no money).

## Things that will bite

- **Drift reads must throw, not fall through** — every lookup feeding `classifyDesignDrift` returns good news when empty.
- **It reads other tools' tables directly, never their query modules** (the STATUS.md contract row).
- **Line pulls insert row by row, deliberately** (settled 2026-08-17) — `addDirectLines`, `addBudgetPullLines`, `addEstimatePullLines` and Purchase Orders' `addPoolLines`. The quantity guard refuses per line with that item's own figure; a batch would discard nine good lines for one bad one. Each reports partial success honestly ("Added 3, then stopped: …"). If atomicity is ever needed, the shape is one database function returning a per-row summary (Marathon's `marathon_create_entry`).
- **Approvers are a named list** (`indent_approvers`) managed from Settings; admins always may; the tick doesn't grant the app.
