# TODO — what's next

Only the next build lives here. What exists is `STATUS.md`, the rules are `CLAUDE.md`, history is git.

## The next build: Relay × Google Chat, round two

The bot is built and vetted on staging through Phase 7b (2026-09-03). Its plan, code map, invariants, production ship checklist and the five candidates for the next round live in **`lib/google-chat/PLAN.md`** — read it before touching anything there. **The founder picks a candidate** (Fable's recommendation is #1, the card updating itself after a press); Fable plans it in that file, then Opus and Sonnet build it. Standing instruction: everything lands on `staging`; one merge to `master` after the founder has tested everything, together with the ship checklist.

## Next, in order

1. **Grant `/design-management` to the design team** in Settings. Legal in both CHECKs since `0030`; invisible until granted. Nobody holds it today.
2. **Press one real write button on production** — the last step of the ship protocol, still not done since the Phase 2 / masters releases. Editing one of the 74 price-less materials (item 4) is the natural candidate.
3. **Grant `/supervisors` to the actual site supervisors.** Nothing is visible to staff today, and Design Management's drawings reach site through this grant.
4. **Re-enter 74 material rates in Masters.** The source sheets disagreed about those units, so the import left prices blank. `npx tsx scripts/import-material-master.ts --project <ref>` prints the list. "Hose Coller PVC 32mm" also needs a code (`PLD/836` named two products).
5. **Set up the works** on the Estimator's Works tab: each work's unit, labour rate and recipe. Until then an estimate prices labour only.
6. **Indents' pull-from-estimate is blind to post-`0086` estimates** (BUGCATCHER #16): `getEstimatePull` (`lib/indents/queries.ts`) is keyed on `material_id`, which post-`0086` rows don't have. Re-key on the item; needs its own small plan.
7. **Supabase Pro plan** — the founder's call. The weekly keep-alive stops the free tier pausing production; only Pro brings backups.

## Open questions for the founder

- Should a supervisor see only their own plots? Today every supervisor sees every villa (2026-08-20 decision). The same answer now decides who sees which villa's **drawings**.
- The construction budget screens still exist and no longer feed Indents. Retire them, or leave as history?
