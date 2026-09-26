# TODO — what's next

Only the next build lives here. What exists is `STATUS.md`, the rules are `CLAUDE.md`, history is git.

## The next build: Relay × Google Chat, round two

The bot is built and vetted on staging through Phase 7b (2026-09-03). Its plan, code map, invariants, production ship checklist and the five candidates for the next round live in **`lib/google-chat/PLAN.md`** — read it before touching anything there. **The founder picks a candidate** (Fable's recommendation is #1, the card updating itself after a press); Fable plans it in that file, then Opus and Sonnet build it. Standing instruction: everything lands on `staging`; one merge to `master` after the founder has tested everything, together with the ship checklist.

## Next, in order

- **The Estimator rework is being built** on `feature/estimator-rework` (founder, 2026-09-26: "go ahead and execute your plan") — the rate book, villas measured on their own, one site-check list. Root `plan.md` is the live board. It builds on the measurement sheet (PR #75, `0096`, staging only), whose vet folds into this one; production waits, with `0094` and `0095`.

0. **Production is paused — restore it, then find out why the keep-alive did not keep it alive.** Found `INACTIVE` on 2026-09-25, twenty days after the weekly cron went in. Restore in the Supabase dashboard (or `POST /v1/projects/pajfrgnkapicdgangjey/restore` — a model session is refused this, rightly), then read the cron's runs under Vercel → Settings → Cron Jobs: a red run means `CRON_SECRET` (BUGCATCHER #18), no run at all means the cron never fired. Until it is fixed, item 6 is the only real answer. The founder's call, 2026-09-25: "production later".
1. **Grant `/design-management` to the design team** in Settings. Legal in both CHECKs since `0030`; invisible until granted. Nobody holds it today.
2. **Press one real write button on production** — the last step of the ship protocol, still not done since the Phase 2 / masters releases. Editing one of the 74 price-less materials (item 4) is the natural candidate.
3. **Grant `/supervisors` to the actual site supervisors.** Nothing is visible to staff today, and Design Management's drawings reach site through this grant.
4. **Re-enter 74 material rates in Masters.** The source sheets disagreed about those units, so the import left prices blank. `npx tsx scripts/import-material-master.ts --project <ref>` prints the list. "Hose Coller PVC 32mm" also needs a code (`PLD/836` named two products).
5. **Set up the works** on the Estimator's Works tab: each work's unit, labour rate and recipe. Until then an estimate prices labour only.
6. **Supabase Pro plan** — the founder's call. The weekly keep-alive was meant to stop the free tier pausing production and has not (item 0); only Pro brings backups.

## The skin waits on `staging` (founder, 2026-09-19)

The new skin is merged to `staging` (PR #73) and **does not go to `master` yet**: the founder will add more features first and ship it all together. Two things the ship day must know. **`staging` cannot be merged to `master` as it stands** — it is 121 commits ahead and carries the whole Google Chat bot (migration `0094` is not on production; the bot's own ship checklist is in `lib/google-chat/PLAN.md`) plus unshipped Estimator, Reporter, Selections and Design Management changes, so either that checklist runs first or the skin travels alone on a release branch cut from `master` (cherry-pick the ten skin commits `a096e58`…`3fe4c95`, skip the sweep `f8a9e5c` and re-run it on `master`'s files). **Nobody has yet looked at the signed-in screens in the new skin** — no model session can sign in; the browser checklist at the end of the skin's plan (`git show 42463f8:plan.md` — the root `plan.md` now carries Dexter, 2026-09-25) is still the founder's to walk through on staging.goodearthkannur.org. **Dexter is merged to `staging` (PR #74, 2026-09-25) and confirmed good there** — the founder tried it on the preview, the Fable review ran the same day (two fixes, `plan.md`), and the founder's word is "production later". When that day comes: restore production (item 0), apply `0095` there, `db:compare` empty, then merge. `0095` joins `0094` in the list of migrations production does not have yet, and the route to `master` is the same choice as the skin's above — the bot's checklist first, or a release branch.

## After the skin — the options the founder did not pick on 2026-09-17

The new skin (stone and glass, `plan.md`) restyled every shared part and the home page. Three deeper changes were offered and set aside for now; each is its own small plan when wanted:

- **Phone-first lists and forms.** Tables that turn into stacked cards on a phone (a `priority` on `TableCell`, or a card fallback), sticky Save buttons, bigger tap targets — Indents, Inventory, Supervisors and Directory first. Today a wide table on a phone scrolls sideways; only Relay and Directory's roster are card grids.
- **A real search in the sidebar.** The decorative box was removed with the skin; a quick jump to any tool or screen (⌘K on a laptop, a tap on a phone) over `lib/tools.ts` would replace it, using the existing Radix dialog.
- **The structure underneath.** One heading style (35 raw `<h2>`s in 28 files still carry two hand-typed class strings; `Section` exists with one consumer), one page rhythm (`space-y-4`/`5`/`6` all in use), a shared filter toolbar and a shared notice banner (the `rounded-xl border px-4 py-3` strip is re-typed per detail page), `loading.tsx` on the 43 route segments still missing one (mostly Masters and Marathon admin), and `PageTitle` in either the layout or the page, not both conventions.
- **A cheap guard rail.** An ESLint `no-restricted-syntax` rule against raw palette classes (`text-red-600`, `bg-amber-100`, …) in `className` literals under `app/(dashboard)/**` and `components/**`, with `app/marathon/**` excused. Nothing in CI catches one today.

## Open questions for the founder

- Should a supervisor see only their own plots? Today every supervisor sees every villa (2026-08-20 decision). The same answer now decides who sees which villa's **drawings**.
- The construction budget screens still exist and no longer feed Indents. Retire them, or leave as history?
