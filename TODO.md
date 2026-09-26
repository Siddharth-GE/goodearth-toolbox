# TODO — what's next

Only what is next. What exists is `STATUS.md`, the rules are `CLAUDE.md`, history is git.

## Production

0. **Restore production, then find out why the keep-alive did not keep it awake.** Found `INACTIVE` 2026-09-25, twenty days after the weekly cron went in. Restore in the Supabase dashboard (a model session is refused the API call, rightly), then read the cron's runs under Vercel → Settings → Cron Jobs: a red run means `CRON_SECRET` (BUGCATCHER #18), no run means it never fired. The founder's call: "production later".
1. **Supabase Pro** — the founder's call. The only real answer to pausing, and the only way to get backups.
2. **Press one real write button on production** — the ship protocol's last step, still not done since the masters releases. Editing one of the 74 price-less materials (item 6) is the natural one.

## Waiting on staging for the founder's vet

Everything below is on `staging.goodearthkannur.org`. Each ships only after the founder says they have tried it there.

- **Catalogue pictures** — **vetted by the founder 2026-09-26**, and the close calls sorted in Masters. On ship day, on production: `scripts/import-catalogue-sheet.ts --project pajfrgnkapicdgangjey --xlsx <workbook>` and `scripts/fetch-catalogue-images.ts --project pajfrgnkapicdgangjey`, dry run first.
- **The Estimator rework** (`0096`–`0098`). Its approval pass by Fable was deferred by the founder and is due before production.
- **Relay × Google Chat round two** — the founder's steps and the checks are in `lib/google-chat/PLAN.md`; production has its own checklist there.
- **The skin** — nobody has looked at the signed-in screens in it yet; the browser checklist is `git show 42463f8:plan.md`.
- **Dexter** (`0095`) — tried and confirmed good; production needs `0095` first.
- **Settings refreshes every page after a change** — **vetted by the founder 2026-09-26**.

**Getting it to `master`.** `staging` is ~150 commits ahead and carries `0094`–`0098`. Either the Chat door's ship checklist runs first and everything goes together, or a piece travels alone on a release branch cut from `master` (the skin: cherry-pick `a096e58`…`3fe4c95`, skip the sweep `f8a9e5c` and re-run it on `master`). Every route needs production restored first, then the migrations applied there and `db:compare` empty.

## Setup the tools are waiting on

3. **Grant `/design-management` to the design team** — nobody holds it.
4. **Grant `/supervisors` to the site supervisors** — nothing is visible to staff, and drawings reach site through it.
5. **Price the works an estimate uses** — the Rate book's "Used but not priced" list; the 25–40 bulk-material works first.
6. **Re-enter 74 material rates in Masters** — the source sheets disagreed about their units. `npx tsx scripts/import-material-master.ts --project <ref>` prints the list; "Hose Coller PVC 32mm" also needs a code (`PLD/836` named two products).

## Next builds — the founder picks

- **The Google Chat door, round three** — three candidates in `lib/google-chat/PLAN.md`.
- **Phone-first lists and forms** — tables that become stacked cards on a phone, sticky Save, bigger tap targets; Indents, Inventory, Supervisors and Directory first.
- **A real sidebar search** — jump to any tool or screen over `lib/tools.ts`.
- **The structure underneath** — one heading style (35 raw `<h2>`s in 28 files), one page rhythm, a shared filter toolbar and notice banner, `PageTitle` in one place.
- **A lint rule against raw palette classes** (`text-red-600`, …) in `app/(dashboard)/**` and `components/**`; nothing in CI catches one today.
- **Check `error` on every single-row read** (found by the 2026-09-26 audit). About 30 reads take `data` and ignore `error`, so a failed read shows "not found" instead of an error screen — the red line in CLAUDE.md. Most are fetch-one-by-id: `lib/masters/{client,project,vendor}-detail.ts`, `lib/bills/queries.ts`, `lib/budgets/{actions,queries}.ts`, `lib/purchase-orders/queries.ts`, `lib/inventory/{issues,receipts}-queries.ts`, `lib/design-management/actions.ts`, `lib/relay/actions.ts`, `lib/selections/views-actions.ts`, and the three file routes under `app/(dashboard)/`. Storage downloads and `getClaims()` are fine as they are.

## Open questions for the founder

- Should a supervisor see only their own plots? Today every supervisor sees every villa, and the same answer decides who sees which villa's drawings.
- The construction budget screens no longer feed Indents. Retire them, or keep them as history?
