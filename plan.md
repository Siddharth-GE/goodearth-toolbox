# Estimator — the rework: a rate book, villas measured on their own, one list for site

_Planned 2026-09-25/26 by Opus on the founder's instruction ("step out, have a larger view and come up with a plan", then "go ahead and execute your plan"). Branch `feature/estimator-rework` off `staging`. Evidence: eight deep reads of the code, migrations and staging data, five competing redesigns scored by three judges; the synthesis below is what the founder approved in conversation._

## Progress — the live board

- [x] 0. Branch and plan (Opus, 2026-09-26)
- [x] 1. Indents pulls from any official estimate `[Opus]` — no migration
- [x] 2. Clear the ground `[Opus]` — no migration
- [ ] 3. The row explains itself; Works becomes the Rate book `[Opus]` — no migration
- [ ] 4. Measure first `[Opus drafts M1, Fable reviews before db:apply]`
- [ ] 5. One estimate per villa `[Opus drafts M2, Fable reviews before db:apply]` — **founder confirms the lifecycle first**
- [ ] 6. Site check and the villa comparison `[Opus]` — no migration
- [ ] 7. Approval pass `[Fable]` — diff against this plan, SECURITY.md, BUGCATCHER.md

Each step is committed and pushed on its own; the branch merges to `staging` only after the founder has looked at the preview.

## Why

The Estimator's arithmetic is sound; what it hangs on is not. It grew by sixteen migrations in about 28 hours (19–20 August), each a correction to the model before, and it shows:

- **Library before value.** Mixes → 172 works → recipes → prices in Masters (another grant) before any believable number. Five weeks later: 5 works set up, all practice data.
- **Unpredictable inheritance.** A villa is a one-time copy of a template, but recipes and prices follow live, and three override layers each have their own "blank means the master" rule.
- **Quantities last.** A throwaway number is typed, then measured over.
- **Dialogs.** One dialog per row; every blur re-runs 30–43 reads.
- **Opaque rates.** No screen shows why a rate is what it is; overrides are invisible where they act.
- **Buried site control.** Over-estimate and outside-the-estimate sit at the bottom of each villa's estimate.
- **Residue.** A pre-`0086` material layer kept for two practice rows, which also broke Indents' pull.

## The shape (founder, 2026-09-26)

**Every villa is different** — "finishes are different, foundations can be different". So there is no house type that villas follow. What is shared is **how a work is priced**, not how much of it a villa has.

- **Rate book** (today's Works tab, with Mixes folded in): per work, its unit, labour ₹/unit and standard materials per unit. Prices come from the items master. Tiles are in the rate list.
- **Villa**: its own list of works, each measured for that villa. It uses the rate book unless it has its own labour rate, materials or price for a work. Grey follows the rate book, black is this villa's own, ↺ puts it back.
  - Different foundations → different works (the list already has rubble / isolated / pile).
  - Different finishes → **Swap** the material on that villa's row (the rate book's material stands in as an allowance until the villa's choice is made). Held in the existing per-line materials table (`0087`).
- **Official**: a frozen, numbered copy (EST/SAA/NNN), what the stores and site check against.
- **Site check**: one list across villas.

Selections and Budgets are interiors and stay out of this (founder, 2026-09-26).

## Steps

### 1. Indents pulls from any official estimate `[Opus]` ✓

`getEstimatePull` and `addEstimatePullLines` keyed on `material_id`, which is null on every takeoff row since `0086`, so the pull saw no estimate at all (BUGCATCHER #16, then TODO's item 6). Re-keyed on `item_id` through the pure `groupEstimatePull` (older rows still convert fact by fact); "already requested" now counts estimate-anchored lines on **every** indent of the villa (`requestedByItem`), so a re-issued estimate no longer reopens double-buying. Tests in `pull-rules.test.ts`.

**Check on the preview:** an indent for Villa 10 → Pull from the estimate lists EST/SAA/004's materials. An indent for Villa 1 → cement shows "already requested 15 bag" (5 against 001 + 10 against 002).

### 2. Clear the ground `[Opus]`

- Remove the pre-`0086` material paths from the Estimator's code: `listMaterialsRaw`, `materialLinks`, the hand-built identity links, the item-or-legacy id sets (`itemIds`/`extraItemIds` — also fixes the villa-only material whose price would not save), `link.ts`. (`reference.ts` stays: every tool keeps a tested TS mirror of its database numbering.) Old frozen rows still display by their frozen name. Tables and columns stay (additive only).
- Fix the wording that lies: the Copy dialog ("nothing else to copy"), the welcome's "unit and a recipe" and "comparison tab", the Works page's "changes here update every one of them", the successor banner on copied templates, the price box's `/[,s₹]/`.
- A searchable material picker in place of the 2,058-option dropdowns.
- `submitEstimate` returns `ActionState` instead of throwing when a read fails.
- (Moved to step 3, which rebuilds the page: the estimate page loads only what its state shows.)

### 3. The row explains itself; Works becomes the Rate book `[Opus]`

- Tap a row → its rate build-up inline: labour + each material × price = rate, each figure tagged Rate book / This villa, with ↺.
- Labour typed there; **Swap** a material for this villa; a Masters price edited in place when the person holds `/masters`.
- Works and Mixes become one **Rate book** tab with search, a "used but not priced" list as the only setup to-do, and "copy this rate to…" for the ground / first / attic twins.
- Quantity and rate cells save without re-running the page (the Budgets `saveLine` precedent).
- The welcome stops numbering a setup path.

### 4. Measure first `[Opus drafts M1, Fable reviews]`

- **M1:** `estimator_estimate_lines.qty` drops NOT NULL (`check (qty > 0)` already passes null). Null = "to measure".
- Add works in bulk (search, tick single works or whole groups). The sheet is where a quantity comes from, computed from its rows on read (no second write). Rows can be copied to another work (a wall's length and height feed masonry, plaster and paint). Phone cards for the sheet. A work's unit locks once any quantity uses it. Submit refuses while anything is "to measure", naming it.

### 5. One estimate per villa `[Opus drafts M2, Fable reviews]` — founder confirms first

- One always-open working estimate per villa; **Make official** takes a numbered frozen copy (lines, costs, takeoff and measurement sheets) in one invoker RPC that checks the snapshot covers the working lines; Revise, Copy to villa, Customise and Variation go.
- **Start from another villa** — a one-time head start (its works, optionally its quantities), labelled as a copy. Templates retire from the screens.
- A villas grid: not started / working / official, today's total against the official one.
- Delete a draft in one atomic call (the `delete_draft_*` precedent).
- `estimate_takeoff_facts` unchanged, byte for byte.

### 6. Site check and the villa comparison `[Opus]`

- One cross-villa list of over-estimate and outside-the-estimate rows, Approve on the row, phone cards; % drawn per work; "where does all the cement go". An approval stays approved on the villa's later officials (read across the villa's estimates; no migration).
- A comparison grid, villas down and works across, to catch a mistyped measurement.

## Later doors, not built

A work-done record (measurement book) — the only honest basis for checking material against progress and paying labour by measured work; Excel paste; a printable estimate and rate analysis; wastage and contingency; deduction rows in the sheet; tidying the 172-work list (a Masters project).

## Risks and how they are held

- **Staging's practice data** (11 estimates, 16 lines, two older-generation takeoff rows) keeps displaying; nothing on production needs moving — it has no estimator rows.
- **The two migrations** are relaxations and additions only; each gets Fable's review before `db:apply`, staging first.
- **Downstream contract:** Indents, Inventory and Supervisors read the same frozen `(villa, work, item, quantity)` rows throughout; the view manifest is untouched.
- **A green build proves nothing about a `select` string** — every step opens its pages on the preview (BUGCATCHER #2).
