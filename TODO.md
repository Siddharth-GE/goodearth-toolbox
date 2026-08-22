# TODO — what's next

Only the next build lives here. What exists is `STATUS.md`, the rules are `CLAUDE.md`, history is git.

## Design Management is built and waiting on staging

The tool the repo-root `plan.md` describes is finished through step 7: migration `0091` applied to **staging only**, all six screens built, released drawings surfacing in Supervisors through the shared `lib/drawings/`. Nothing has gone to production, and nothing should until the founder has tried it.

## Next, in order

1. **The founder's staging vet of Design Management.** The browser checklist is in `plan.md` (seven steps, ending with the probe seeing released drawings and not drafts). It has to be `staging.goodearthkannur.org` — a feature is not visible there until the branch is merged into `staging`, which is step 8's business. One sentence from the founder per feature is the gate; production waits for it.
2. **After the production ship: grant `/design-management` to the design team** in Settings. The slug has been legal in both CHECKs since `0030`, so granting works the moment the tool is live — but the tool is invisible to everyone until someone is granted it. Nobody holds it today.
3. **Press one real write button on production** — the last step of the ship protocol, still not done from the Phase 2 / masters releases: sign in at toolbox.goodearthkannur.org and save something. Editing one of the 74 price-less materials (item 5) is the natural candidate — a real write on the newest code.
4. **Grants nobody has issued**: `/supervisors` to the actual site supervisors. The tool is invisible until granted in Settings, so nothing is visible to staff today — and Design Management's whole point is that the drawing reaches the supervisor, which needs this grant as much as item 2.
5. **Re-enter 74 material rates in Masters.** The two source sheets disagreed about those materials' units (bricks priced per box on one, per piece on the other), so the import brought the unit through and left the price blank rather than restate a rate against the wrong unit. `npx tsx scripts/import-material-master.ts --project <ref>` prints the list. One material also needs a code: `PLD/836` named two different products, so "Hose Coller PVC 32mm" came in without one.
6. **Set up the works** on the Estimator's Works tab: each work's unit, labour rate and recipe. The materials they draw on now exist — until a work has them, an estimate prices labour only.

## Open questions for the founder

- Should a supervisor see only their own plots? Today every supervisor sees every villa through a picker (their 2026-08-20 decision); assignment is a real feature if wanted. It now also decides who sees which villa's **drawings**, so the two answers have to match.
- The construction budget screens still exist and no longer feed Indents. Retire them, or leave as history?
