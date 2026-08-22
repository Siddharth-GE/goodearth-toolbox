# plan.md — Supervisors app hides estimate works linked via the items master

**Written by Fable (Architect), approved by the founder 2026-08-22. A
Sonnet session implements the tagged steps and ticks them off here; Fable
reviews the diff before anything merges. Founder vets on staging, as
always.**

## What's wrong, in plain language

Villa 10's estimate (EST/SAA/003 on staging) includes "Dry rubble
masonry", but the Supervisors app shows nothing for it — no materials, no
quick-pick, so no request can be raised.

The estimate itself is fine. Fable checked every link in the chain live
on the staging database: the work's recipe exists, the estimate line
exists, the submit snapshot wrote all three material rows (120×60cm
blocks, cement, 2mm), and the `estimate_takeoff_facts` view — the one
bridge Supervisors reads per STATUS.md — serves them correctly.

The bug is one line of over-strict filtering in the Supervisors code.
Since migration `0086_materials_are_items.sql`, a recipe built against
the shared items master carries `item_id` and a **null** `material_id` —
that's by design. But `getVillaDetail()` in `lib/supervisors/queries.ts`
(the `takeoffRows` filter, ~L251–270) still demands
`material_id !== null` on every takeoff row, a leftover from before 0086. Every row of Villa 10's estimate has `material_id` null, so all of
them are silently dropped and the villa page believes there is no
estimate at all.

**Scope of the blast:** any work whose recipe was authored after 0086 is
invisible to Supervisors on any villa — a code bug affecting both
databases, not a Villa 10 data problem. Downstream code never actually
reads `materialId` (`lib/supervisors/site-materials.ts` uses only
`itemId`/`itemUomFactor`; `quickPicks` keys off `item_id`), so the fix
is safe and small.

No migration, no RLS, no view change, no money — pure app-layer filter.

## Steps

- [x] **[Sonnet]** In `lib/supervisors/queries.ts`, remove
      `row.material_id !== null` from the `takeoffRows` narrowing
      predicate (~L251–270) and drop `material_id: string` from its
      narrowed type. Keep every other non-null guard (`reference`,
      `submitted_at`, `work_item_id`, `material_name`, `uom`,
      `quantity`) exactly as is.
- [x] **[Sonnet]** In `lib/supervisors/site-materials.ts`, widen
      `SiteTakeoffRow.materialId` from `string` to `string | null`.
      No logic change — the field is carried, never read.
- [x] **[Sonnet]** Run the gate locally: `npm test` (the
      `site-materials.test.ts` fixtures stay valid under the widened
      type) and `npm run typecheck`. If typecheck surfaces any other
      place assuming `materialId` is non-null, **stop and write the
      question below** — do not improvise.
- [x] **[Sonnet]** Commit on `staging` with a plain-English message
      (e.g. "The supervisors' villa page stops hiding works estimated
      through the items master") and push; confirm the CI run is green
      with `gh run list`, not just the push.
- [x] **[Fable]** Review the diff against this plan, SECURITY.md and
      BUGCATCHER.md; give the merge overview. **Verdict: approved.** The
      diff is exactly the two changes the plan named, nothing else moved,
      556/556 tests and a clean typecheck. No policy, view or money
      surface is touched. Two findings from the review, recorded where
      they belong: the same null-`material_id` blindness exists in the
      Indents estimate-pull path (now in TODO.md — it is real work, not a
      one-line filter, because that path is keyed on `material_id`
      end-to-end), and the pattern itself is BUGCATCHER #16.
- [ ] **[Founder]** Vet on staging.goodearthkannur.org: open
      Supervisors → Villa 10 → "Dry rubble masonry" should now show its
      three materials with estimated quantities, and the Request
      dialog's "From the estimate" list should offer them. Also open one
      villa that was already working, to see nothing regressed.

## Questions for the tier above

- **CI never ran for this push, by design of the workflow — not a
  failure.** `.github/workflows/ci.yml` triggers only on
  `push: branches: [master]` and on `pull_request`; a direct push to
  `staging` fires neither. Checked `gh run list` against the last four
  direct-to-`staging` commits (`ed257a2`, `eff3145`, `f4fbc99`,
  `e4aadda`) — none has a CI run either, so this push (`2d64f93`)
  matching that pattern is expected, not a regression. Ran the gate
  locally instead: `npm test` — 556/556 pass; `npm run typecheck` —
  clean, no output. Flagging because plan step 4 asked me to "confirm
  the CI run is green with `gh run list`," which isn't obtainable for
  a plain push under the current trigger config — opening a PR myself
  to force one felt like scope I wasn't asked for. Should staging
  pushes get their own `push: branches: [staging]` trigger, or is
  local `npm test` + `npm run typecheck` the accepted gate for
  direct-to-staging commits (with CI proper reserved for the
  staging→master PR)?

**[Fable] Answer on CI:** working as designed — SHIPPING.md puts the CI
gate on **pull requests**, not on branch pushes ("A merge that skips the
PR skips the gate — which is the one good reason to always use one").
A direct push to `staging` runs no workflow, so for this no-migration
fix the local gate (`npm test` + `npm run typecheck`, both green) is the
accepted cover, and CI proper runs on the eventual `staging` → `master`
PR. Do not add a `staging` push trigger off your own bat; if the founder
wants one it is a one-line workflow change to propose separately.
