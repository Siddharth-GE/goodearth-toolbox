# TODO — what's next

Only the next build lives here (founder, 2026-08-20: this page holds Phase 2 and nothing else). What exists is `STATUS.md`, the rules are `CLAUDE.md`, history is git.

## Phase 2 — built, waiting on the staging vet

Everything approved on 2026-08-20 is on staging (`plan.md` holds the build record): the Supervisors app, the store-keeper's request queue, the over-issue warnings, and the founder's corrections — the items master IS the material list (`0085`, then `0086`: no Materials tab at all; mixes and recipes hold items, rates are Masters' indicative prices, quantities speak each item's unit).

1. **Founder vets on staging.goodearthkannur.org** — the hard gate. The browser checklist is in the session summary; nothing below happens first.
2. **Production promotion, after the vet**: `npm run db:apply -- --project pajfrgnkapicdgangjey --commit` (applies `0084`–`0087` in order) → `npm run db:types` → `npm run db:compare` must report no differences → merge `staging → master` → press one real write button on production (record a labour log).
3. **Grants nobody has issued yet**: `/supervisors` to the actual site supervisors, once the founder says who.

**Data task (Masters, not code):** enter the construction raw materials as `kind='material'` items **with their indicative prices** — that one entry now feeds mixes, recipes, estimates, requests and comparisons. Staging's practice mix has one component still on the retired list (chip says "Old list — re-add from Masters"); remove and re-add it from the master when convenient.
