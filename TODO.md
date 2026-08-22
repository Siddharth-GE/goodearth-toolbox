# TODO — what's next

Only the next build lives here. What exists is `STATUS.md`, the rules are `CLAUDE.md`, history is git.

## Design Management is live on production

Shipped 2026-08-22 on the founder's instruction after their staging vet: migrations `0091`–`0093` applied to production, `db:compare` clean across 4,000+ objects and all 236 auth settings, `staging` merged to `master`. The founder's vet reshaped it live: everything plot-level, sets born inside transmittals, per-villa TR numbers, mandatory files and change notes, revision logs behind buttons on both sides.

## Next, in order

1. **Grant `/design-management` to the design team** in Settings. The slug has been legal in both CHECKs since `0030`, so granting works the moment the tool is live — but the tool is invisible to everyone until someone is granted it. Nobody holds it today.
2. **Press one real write button on production** — the last step of the ship protocol, still not done from the Phase 2 / masters releases: sign in at toolbox.goodearthkannur.org and save something. Editing one of the 74 price-less materials (item 5) is the natural candidate — a real write on the newest code.
3. **Grants nobody has issued**: `/supervisors` to the actual site supervisors. The tool is invisible until granted in Settings, so nothing is visible to staff today — and Design Management's whole point is that the drawing reaches the supervisor, which needs this grant as much as item 2.
4. **Re-enter 74 material rates in Masters.** The two source sheets disagreed about those materials' units (bricks priced per box on one, per piece on the other), so the import brought the unit through and left the price blank rather than restate a rate against the wrong unit. `npx tsx scripts/import-material-master.ts --project <ref>` prints the list. One material also needs a code: `PLD/836` named two different products, so "Hose Coller PVC 32mm" came in without one.
5. **Set up the works** on the Estimator's Works tab: each work's unit, labour rate and recipe. The materials they draw on now exist — until a work has them, an estimate prices labour only.

6. **Indents' pull-from-estimate is blind to post-`0086` estimates** — the same null-`material_id` bug just fixed in Supervisors (BUGCATCHER #16), but deeper: `getEstimatePull` (`lib/indents/queries.ts`) drops every row with a null `material_id`, and the whole pull path — client basket, `addEstimatePullLines`, its server re-read — is keyed on `material_id`, which post-`0086` rows don't have. Fixing it means re-keying the path on the item (or `material_id ?? item_id`), not deleting a guard, so it needs its own small plan. Until then, pull path 3 shows "no official estimate" for any estimate whose recipes were authored after 2026-08-20.

## Open questions for the founder

- Should a supervisor see only their own plots? Today every supervisor sees every villa through a picker (their 2026-08-20 decision); assignment is a real feature if wanted. It now also decides who sees which villa's **drawings**, so the two answers have to match.
- The construction budget screens still exist and no longer feed Indents. Retire them, or leave as history?
