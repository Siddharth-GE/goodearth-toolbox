# Estimator — the measurement sheet (QS layer)

_Planned by Fable, 2026-09-25. Branch `feature/estimator-measurements` off `staging`. Migration `0096`._

## Progress — the live board

- [x] 0. Branch and plan (Opus, 2026-09-25)
- [ ] 1. Migration `0096` — **written, not applied.** Waiting for the Fable review MODELS.md requires before any RLS migration reaches `db:apply`. After that: apply to staging, then `npm run db:types:staging`. The new table's types were added to `lib/supabase/database.types.ts` by hand in the generator's exact shape so the code typechecks now; the regeneration should produce no diff there.
- [x] 2. `calc.ts` arithmetic + 9 tests
- [x] 3. Read — `getEstimateMeasurements`
- [x] 4. Writes — add / update / remove a row, the quantity sync, the typed-quantity refusal, deletes, and copies on template and Revise
- [x] 5. Screen — `measurement-forms.tsx` and the estimate page
- [x] 6. Docs — Estimator `PLAN.md` decision 9 and its warning, `STATUS.md`
- [ ] 7. Fable's approval pass

### Questions for the tier above

- **For Fable:** the migration adds `revoke execute on function estimator_line_measurements_draft_only() from public, anon, authenticated`, following SECURITY.md's "every new function" rule. The 0087 sibling function has no such revoke. Postgres checks EXECUTE on a trigger function only at `create trigger`, which the migration does as the owner before the revoke, so firing is unaffected — but it differs from its sibling, so worth a look.

## Context

Today an estimate line is one work and one typed quantity: "Brickwork in CM 1:6 — 40 cum". A quantity surveyor never arrives at 40 that way. They fill a measurement sheet: one row per wall or slab or footing, each with a description, a number-of, a length, a breadth and a depth, and the sheet's total is the BOQ quantity. The founder asked for that layer (2026-09-25: "a qs layer where you can enter the number of lengths and volumes for each work").

Founder's decisions on the same day:

1. **Standard sheet shape.** Every row has Nos, Length, Breadth, Depth. A blank box is skipped, so "12 nos" = 12; "12 × 3.0" = 36; "1 × 4 × 3 × 0.15" = 1.8. The work's unit from the Works tab is shown beside the total as a reminder; the app never converts units.
2. **Additions only.** No deduction rows. Openings are measured net by hand.

Outcome: on a draft estimate each work gets a **Measure** button. Rows entered there add up, and that sum becomes the line's quantity. A work with no rows keeps its typed quantity exactly as today, so nothing existing changes shape. Submit, the frozen snapshot, indent pulls, supervisors' comparisons and every downstream read stay untouched, because they all read `estimator_estimate_lines.qty`, which the sheet now maintains.

## The shape

- **New table** `estimator_estimate_line_measurements` — one row per measurement, `line_id` → `estimator_estimate_lines` (RESTRICT, app deletes children first, the `0087` shape). Columns: `description text` (optional, `TEXT_LIMIT`), `nos numeric`, `length numeric`, `breadth numeric`, `depth numeric` (each nullable, each `> 0` when present, CHECK that at least one is present), `sort_order int not null`, plus the standard audit four. `/estimator`-gated on all four policies, SELECT included.
- **Quantity stays on the line.** `estimator_estimate_lines.qty` remains the one figure everything reads. Whenever a measurement row is added, edited or removed, the action re-reads the line's rows, sums them in `calc.ts`, and writes `qty`. A line with rows is "measured": its inline quantity box becomes read-only and the typed-qty action refuses with a plain message. Remove the last row and the line keeps its last total as a typed quantity again.
- **Draft-only**, enforced in the database with the `0087` trigger shape one join out (`estimator_line_measurements_draft_only`, FOR SHARE on the estimate). After submit the rows are frozen by the same rule that freezes the line, so they double as the audit trail of where 40 cum came from. No snapshot copy is needed.
- **Arithmetic in `calc.ts` only**: `measurementQuantity(row)` (product of the non-null boxes) and `sheetTotal(rows)`. SQL never re-implements it (the Estimator's standing rule).
- **Templates and revisions carry the sheet.** Saarang has 43 near-identical villas; the template's sheet is the starting point. `copyTemplateToUnit` and `reviseEstimate` copy rows by work, the `copyLineVariations` shape.

## Steps

### 0. Set up `[Opus]`

- Branch `feature/estimator-measurements` from `staging`. Copy this file to the repo root as `plan.md` (Dexter's plan there is finished; its content lives in STATUS/PLAN).

### 1. Migration `0096_estimate_line_measurements.sql` `[Sonnet drafts, Fable reviews before db:apply]`

Model it line-for-line on `supabase/migrations/0087_estimate_line_variations.sql`:

- Table as described above. CHECKs: `nos > 0`, `length > 0`, `breadth > 0`, `depth > 0` (each only when not null), and `num_nonnulls(nos, length, breadth, depth) >= 1`. `description` may be null. Index on `line_id`.
- Draft-only trigger function `estimator_line_measurements_draft_only()` — copy `estimator_line_components_draft_only()` and change the table, the message ("a work's measurements can only change while it is a draft").
- The `0074` loop: audit, `set_updated_at`, RLS, four `/estimator` policies.
- "Prove it landed" block: RLS on, 4 policies, trigger present, the non-null CHECK present.
- Apply: `npm run db:apply -- --project ipstebqawrvhkyntctrv --commit` (staging), then `npm run db:types:staging`. Production waits (it is paused; TODO item 0), and joins `0094`/`0095` in the list production does not have yet.

### 2. `lib/estimator/calc.ts` + tests `[Sonnet]`

```ts
export type MeasurementInput = {
  nos: number | null;
  length: number | null;
  breadth: number | null;
  depth: number | null;
};
/** Nos × L × B × D with every blank box skipped; a row with nothing in it is 0. */
export function measurementQuantity(row: MeasurementInput): number;
/** The sheet's total — what the line's qty becomes. */
export function sheetTotal(rows: MeasurementInput[]): number;
```

Tests in `calc.test.ts`: nos only; nos × length; all four; blanks skipped in the middle (length and depth, no breadth); an empty sheet is 0; floating-point rounding (1 × 4 × 3 × 0.15 → 1.8, compare with a tolerance or round to 6 places inside `sheetTotal`, and document which).

### 3. Reads — `lib/estimator/estimate-queries.ts` `[Sonnet]`

- New type `MeasurementRow = { id, description, nos, length, breadth, depth, sortOrder }`.
- `getEstimateMeasurements(estimateId): Promise<Map<lineId, MeasurementRow[]>>` — `requireTool(GRANT)`, one `fetchAll` over the table filtered by the estimate's line ids (read the ids the way `getEstimateVariations` does), ordered by `sort_order, id`. Rows returned raw; the screen computes each row's quantity through `calc.ts`.
- Add `measured: boolean` to `EstimateLineRow`? No — the page already fetches the measurements map; `measurements.has(line.id)` is the flag. Keep the line type unchanged.

### 4. Writes — `lib/estimator/estimate-actions.ts` `[Sonnet, Opus reviews]`

All return `ActionState`, `requireTool(GRANT)` first, `revalidatePath("/estimator", "layout")` on success, `P0001` passes the trigger's own message through, the existing style throughout.

- `addLineMeasurement(lineId, _state, formData)` — reads `description`, `nos`, `length`, `breadth`, `depth` through `parseNumber`; blank is null, each present value must be finite and `> 0`, at least one present ("Enter at least one of number, length, breadth or depth"). Inserts with `sort_order` = current max + 1, then calls `syncLineQty`.
- `updateLineMeasurement(id, fields)` — same validation, update, then `syncLineQty`.
- `removeLineMeasurement(id)` — delete, then `syncLineQty`; when no rows remain, leave `qty` as it is (the line keeps its last total).
- `syncLineQty(supabase, lineId, userId)` (module-private) — re-read the line's rows, `sheetTotal`, and if `> 0` update `estimator_estimate_lines.qty`. A total of 0 cannot happen with the CHECKs, but guard it anyway with a plain message rather than letting the `qty > 0` CHECK speak.
- `updateEstimateLineQty` — before writing, count the line's measurement rows; if any, refuse: "This quantity comes from its measurement sheet — change the rows there instead."
- `removeEstimateLine`, `deleteEstimate`, `discardCopiedEstimate` — delete the line's measurement rows before its variation rows (RESTRICT, not cascade), in the same style as the existing variation deletes.
- `copyLineMeasurements(supabase, sourceEstimateId, targetEstimateId, userId)` — the `copyLineVariations` shape, mapping by `work_item_id`; wire it into `copyTemplateToUnit` and `reviseEstimate` in the same `??` chain, so a failure discards the half-made copy the existing way.

Order matters in a measured copy: the copied `qty` already equals the sheet total (it was synced on the source), so no re-sync is needed after the copy.

### 5. Screen — `app/(dashboard)/estimator/estimates/[estimateId]/` `[Sonnet, Opus reviews]`

New `_components/measurement-forms.tsx` (client), modelled on `variation-forms.tsx`:

- `MeasurementSheetDialog({ lineId, workName, workUom, rows, readOnly })` — `Dialog` with a title "Brickwork — measurements". A `Table` with columns Description · Nos · Length · Breadth · Depth · Quantity · (remove). Each numeric cell is an inline save-on-blur input (the `ComponentQtyField` shape, but blank allowed and meaning "not used"). Below the table: **Total** in `Figure` size `lg` with the work's unit, and a caption "Blank means not used. Enter dimensions in the units the work is measured in — the app does not convert." An `AddMeasurementForm` (the `AddComponentForm` shape: `useActionState`, form reset on success) with five boxes that wrap on a phone (`grid grid-cols-2 sm:grid-cols-5 gap-2`). `readOnly` (submitted or superseded) shows the rows and total with no inputs.
- The trigger button reads "Measure" and carries a `Badge variant="info"` "Measured" once rows exist, the "Variation / Varied" pattern.

`page.tsx`:

- Fetch `getEstimateMeasurements(estimateId)` in the existing `Promise.all`.
- In the quantity cell, when the line has rows: show `formatQuantity(line.qty)` + unit + the Measured badge instead of `LineQtyField` (draft and frozen alike). When it has none, unchanged.
- In the actions cell (draft): add `MeasurementSheetDialog` beside `LineVariationDialog`. For a non-draft estimate with rows, render the dialog `readOnly` in a new trailing cell so the sheet stays openable as history (add the header cell for it when any line is measured).
- Rows for the dialog are the raw `MeasurementRow`s; the dialog computes each row's quantity and the total with `measurementQuantity` / `sheetTotal` (pure, importable client-side).

No new route, so no new `loading.tsx`. Every control from `components/ui/*`; no raw colour classes.

### 6. Docs `[Sonnet, Haiku for the sweep]`

- `app/(dashboard)/estimator/PLAN.md`: a founder decision 9 (the measurement sheet: shape, additions only, quantity stays on the line and is synced by the app, rows frozen with the line) and a "things that will bite" note: the sheet never converts units, so a length typed in feet on a cum work is wrong quietly — the unit reminder is the only guard.
- `STATUS.md`: the Estimator row gains one sentence; the contract table is untouched (no cross-tool read changes). Migration line: `0096` on staging only.
- `TODO.md`: nothing new unless a question surfaces.
- `SECURITY.md` needs no change (a new `/estimator`-gated table in the tool's own band, no view, no money column beyond what the band already gates).

### 7. Fable's approval pass `[Fable]`

Diff against this plan, `SECURITY.md`, `BUGCATCHER.md`; the migration reviewed before step 1's `db:apply`; then the merge overview for the founder.

## Files

- New: `supabase/migrations/0096_estimate_line_measurements.sql`, `app/(dashboard)/estimator/estimates/[estimateId]/_components/measurement-forms.tsx`
- Changed: `lib/estimator/calc.ts`, `lib/estimator/calc.test.ts`, `lib/estimator/estimate-queries.ts`, `lib/estimator/estimate-actions.ts`, `app/(dashboard)/estimator/estimates/[estimateId]/page.tsx`, `lib/supabase/database.types.ts` (generated), `app/(dashboard)/estimator/PLAN.md`, `STATUS.md`
- Reused as-is: `parseNumber`/`text` (`lib/form-data.ts`), `formatQuantity` (`lib/format.ts`), `fetchAll`, `RecordFormDialog`/`Dialog`/`Table`/`Figure`/`Badge`, the `0087` trigger and policy loop, `copyLineVariations`/`discardCopiedEstimate` shapes.

## Risks and how they are held

- **Drift between rows and `qty`** if the sync write fails after a row write. The next row edit re-syncs; the dialog always shows the live total from rows, and the BOQ shows `qty`. Acceptable at this scale; a definer function would make it atomic and is not worth the surface (the `copyTemplateToUnit` reasoning).
- **A measured line's qty edited elsewhere** — only `updateEstimateLineQty` writes qty, and it now refuses when rows exist.
- **Existing estimates** — none have rows, so nothing changes for them; the typed path is byte-for-byte the current behaviour.
- **Green build proves nothing about the new `select` strings** — open the page (BUGCATCHER #2).

## Verification

1. `npm test` — the new calc tests pass; `npm run lint`, `npm run typecheck`, `npm run build`, `npm run check:actions`.
2. Apply `0096` to staging; `npm run db:types:staging`; confirm the trigger and 4 policies in the migration's own prove-it block output.
3. Push, confirm with `gh run list` that CI is green.
4. Browser, on the preview URL (staging data), as the founder — a model session cannot sign in:
   - Open a draft estimate → a work → **Measure**. Add "Front wall, 1 × 12 × 0.23 × 3" → the row shows 8.28, the total 8.28 cum, the BOQ line's quantity becomes 8.28 with a Measured badge, and the amount recalculates.
   - Add "Doors, 3 nos" on an m-work line with no other boxes → quantity 3.
   - Leave all four boxes blank → refused with the plain message.
   - Try typing in the BOQ quantity box of a measured line → the box is gone; the badge explains.
   - Remove the last row → the quantity box returns, still showing the last total.
   - Copy a template that has a sheet onto a villa → the villa's line has the same rows.
   - Submit → the sheet opens read-only; adding a row is refused by the database's message.
   - Revise → the new draft carries the rows and they are editable again.
   - On a phone width: the add form wraps into two columns and the dialog is a bottom sheet with the Add button reachable.
5. Probe account (`/inventory` only) → `/estimator` still redirects; nothing new is readable without the grant.
