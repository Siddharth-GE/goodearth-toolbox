# TODO — what's next

Only the next build lives here (founder, 2026-08-20: this page holds Phase 2 and nothing else). What exists is `STATUS.md`, the rules are `CLAUDE.md`, history is git.

## Phase 2 — built, waiting on the staging vet

Everything approved on 2026-08-20 is on staging (`plan.md` holds the build record): the Supervisors app, the store-keeper's request queue, the over-issue warnings, and the founder's mid-build correction — the items master is the one material list (`0085`).

1. **Founder vets on staging.goodearthkannur.org** — the hard gate. The browser checklist is in the session summary; nothing below happens first.
2. **Production promotion, after the vet**: `npm run db:apply -- --project pajfrgnkapicdgangjey --commit` (applies `0084`, `0085` in order) → `npm run db:types` → `npm run db:compare` must report no differences → merge `staging → master` → press one real write button on production (record a labour log).
3. **Grants nobody has issued yet**: `/supervisors` to the actual site supervisors, once the founder says who.

**Data task (Masters + Estimator, not code):** enter the construction raw materials as `kind='material'` items, and link the Estimator's pre-`0085` unlinked materials to them on the Materials screen (each shows a link-me chip). New materials are forced to start from the master; comparisons, requests and warnings only bite for linked ones.
