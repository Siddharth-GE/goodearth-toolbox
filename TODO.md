# TODO — what's next

Only the next build lives here. What exists is `STATUS.md`, the rules are `CLAUDE.md`, history is git.

## Phase 2 is live on production

Shipped 2026-08-20 (founder's instruction): migrations `0084`–`0088` applied to production, `db:compare` empty across schema, storage and all 236 auth settings, `staging` → `master` merged at `8f8232c`, and Vercel's newest Production deployment confirmed for that exact commit. What went live is recorded in `STATUS.md`.

## Next, in order

1. **Press one real write button on production** — the last step of the ship protocol, and the only one not yet done: sign in at toolbox.goodearthkannur.org and save something (a labour log once `/supervisors` is granted, or any existing tool's save). Nobody has used the new code on production yet.
2. **Grants nobody has issued**: `/supervisors` to the actual site supervisors — the tool is invisible until granted in Settings, so nothing is visible to staff today.
3. **Enter the construction materials in Masters** as `kind='material'` items **with their indicative prices**. That one entry now feeds mixes, work recipes, estimates, requests and comparisons — production's estimator tables are empty, so this is where the Estimator starts.
4. **Set up the works** on the Estimator's Works tab: each work's unit, labour rate and recipe. Until a work has materials, an estimate prices labour only.

## Open questions for the founder

- Should a supervisor see only their own plots? Today every supervisor sees every villa through a picker (their 2026-08-20 decision); assignment is a real feature if wanted.
- The construction budget screens still exist and no longer feed Indents. Retire them, or leave as history?
