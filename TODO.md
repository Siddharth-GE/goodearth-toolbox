# TODO — what's next

Only the next build lives here. What exists is `STATUS.md`, the rules are `CLAUDE.md`, history is git.

## The next build: Relay × Google Chat slash commands

Approved by the founder 2026-08-31; the phased plan is **`plan.md`** at the repo root — read it before touching anything. **Phases 1–2 are done (2026-09-01): the bot is alive on staging** — greets on joining a space, answers DMs and mentions, and the door verifies every request against the project's own service agent. The plan's phase notes carry the four Google traps that cost the debugging rounds; read them before assuming anything about how Chat talks to us.

**Slash commands reach the door as of 2026-09-02** — all seven dispatch in the DM and the test space (the `/court` mystery was an em-dash in its description; plan.md trap (d)). **Phase 3 (Identity) is built (2026-09-02, `feature/google-chat`)** — sender email → toolbox account, five fixed private refusals, greeting by first name; checks green, PR open into `staging`. **Waiting on the founder's staging vet**: the first `/court` in the test space is the probe for where Google puts the email (plan.md, Phase 3 detail). **Phase 4 (Space linking) is built too (2026-09-02, same branch)** — `0094` `google_chat_spaces` applied to staging, name-matching on join, the `/link` dialog; PR into `staging`. **Needs one console tick from the founder**: "Opens a dialog" on the `/link` command in the staging Chat app, then the vet steps in plan.md Phase 4 acceptance (a)–(c). Then **Phase 5 (Reads)** — Fable writes its detail into `plan.md` first.

## Next, in order

1. **Grant `/design-management` to the design team** in Settings. The slug has been legal in both CHECKs since `0030` — but the tool is invisible to everyone until someone is granted it. Nobody holds it today.
2. **Press one real write button on production** — the last step of the ship protocol, still not done from the Phase 2 / masters releases: sign in at toolbox.goodearthkannur.org and save something. Editing one of the 74 price-less materials (item 4) is the natural candidate.
3. **Grants nobody has issued**: `/supervisors` to the actual site supervisors. Nothing is visible to staff today — and Design Management's whole point is that the drawing reaches the supervisor, which needs this grant as much as item 2.
4. **Re-enter 74 material rates in Masters.** The two source sheets disagreed about those materials' units, so the import left prices blank rather than restate a rate against the wrong unit. `npx tsx scripts/import-material-master.ts --project <ref>` prints the list. One material also needs a code: `PLD/836` named two different products, so "Hose Coller PVC 32mm" came in without one.
5. **Set up the works** on the Estimator's Works tab: each work's unit, labour rate and recipe. Until a work has them, an estimate prices labour only.
6. **Indents' pull-from-estimate is blind to post-`0086` estimates** (BUGCATCHER #16, deeper than the Supervisors case): `getEstimatePull` (`lib/indents/queries.ts`) drops every row with a null `material_id`, and the whole pull path is keyed on `material_id`, which post-`0086` rows don't have. Fixing it means re-keying the path on the item (or `material_id ?? item_id`), so it needs its own small plan. Until then, pull path 3 shows "no official estimate" for any estimate whose recipes were authored after 2026-08-20.

## Open questions for the founder

- Should a supervisor see only their own plots? Today every supervisor sees every villa through a picker (their 2026-08-20 decision); assignment is a real feature if wanted. It now also decides who sees which villa's **drawings**, so the two answers have to match.
- The construction budget screens still exist and no longer feed Indents. Retire them, or leave as history?
