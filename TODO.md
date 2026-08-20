# TODO — what's next

Only the next build lives here. What exists is `STATUS.md`, the rules are `CLAUDE.md`, history is git.

## Phase 2 and the masters data are live on production

Shipped 2026-08-20 (founder's instruction): migrations `0084`–`0088` applied to production, `db:compare` empty across schema, storage and all 236 auth settings, `staging` → `master` merged at `8f8232c`, and Vercel's newest Production deployment confirmed for that exact commit.

Later the same day, the Masters data import followed the same road: `0089`–`0090` applied to production, both importers run there (2,057 materials, 82 new suppliers, 72 bank-detail rows), a re-run of each writing nothing, `db:compare` empty again, `staging` → `master` merged at `4664269`. What went live is recorded in `STATUS.md`.

## Next, in order

1. **Press one real write button on production** — the last step of the ship protocol, still not done: sign in at toolbox.goodearthkannur.org and save something. Editing one of the 74 price-less materials (item 3) is now the natural candidate — it is a real write on the newest code.
2. **Grants nobody has issued**: `/supervisors` to the actual site supervisors — the tool is invisible until granted in Settings, so nothing is visible to staff today.
3. **Re-enter 74 material rates in Masters.** The two source sheets disagreed about those materials' units (bricks priced per box on one, per piece on the other), so the import brought the unit through and left the price blank rather than restate a rate against the wrong unit. `npx tsx scripts/import-material-master.ts --project <ref>` prints the list. One material also needs a code: `PLD/836` named two different products, so "Hose Coller PVC 32mm" came in without one.
4. **Set up the works** on the Estimator's Works tab: each work's unit, labour rate and recipe. The materials they draw on now exist — until a work has them, an estimate prices labour only.

## Open questions for the founder

- Should a supervisor see only their own plots? Today every supervisor sees every villa through a picker (their 2026-08-20 decision); assignment is a real feature if wanted.
- The construction budget screens still exist and no longer feed Indents. Retire them, or leave as history?
