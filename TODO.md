# TODO — what's next

Only what is next. What exists is `STATUS.md`, the rules are `CLAUDE.md`, history is git.

## Building now

**The ERP corrections** — `plan.md`: indents from the estimate, PO from an indent, itemised bills from the labour log, work orders, payments with advances and a weekly cash request, store batches with rates, search/filter/total bars, prints. On `feature/erp-corrections`: Part A built (try it on the branch's preview); Part B's migrations `0101`–`0109` on the staging database; B1 (Companies and Terms) and B2 (PO discounts, charges and the GST split) built. **Next: B3**, spelled out at the top of `plan.md`. Then Fable review #2 and the founder's vet on staging — which needs the founder's staging account granted Masters, Bills, Inventory, Supervisors and the Estimator first (their call).

## Production

0. **Restore production, then find out why the keep-alive did not keep it awake** — still `INACTIVE` on 2026-10-08. Restore in the Supabase dashboard (a model session is refused the API call, rightly), then read the cron's runs under Vercel → Settings → Cron Jobs: a red run means `CRON_SECRET` (BUGCATCHER #18), no run means it never fired. The founder's call: "production later".
1. **Supabase Pro** — the founder's call. The only real answer to pausing, and the only way to get backups.
2. **Press one real write button on production** — the ship protocol's last step, still not done since the masters releases. Editing one of the 74 price-less materials (item 8) is the natural one.

## Waiting on staging for the founder's vet

Everything below is on `staging.goodearthkannur.org`. Each ships only after the founder says they have tried it there.

- **The final masters workbook** — loaded on staging 2026-10-07, after every record there was cleared. Waiting for the founder's look through Masters → Vendors, Works, Items and Stages. On ship day, on production: `scripts/import-masters-workbook.ts --project pajfrgnkapicdgangjey --xlsx <workbook>`, dry run first. It stops while production's own records point at masters it drops, and the wipe script refuses production by design, so what happens to those records is the founder's call that day.
- **Catalogue pictures** — **vetted by the founder 2026-09-26**, and the close calls sorted in Masters. On ship day, on production: `scripts/import-catalogue-sheet.ts --project pajfrgnkapicdgangjey --xlsx <workbook>` and `scripts/fetch-catalogue-images.ts --project pajfrgnkapicdgangjey`, dry run first.
- **The Estimator rework** (`0096`–`0098`). Its approval pass by Fable was deferred by the founder and is due before production.
- **Relay × Google Chat round two** — the founder's steps and the checks are in `lib/google-chat/PLAN.md`; production has its own checklist there.
- **The skin** — nobody has looked at the signed-in screens in it yet; the browser checklist is `git show 42463f8:plan.md`.
- **Dexter** (`0095`, `0100`) — the links were tried and confirmed good; **saved answers (`0100`) are waiting for the founder's vet**: open the "Dexter answers test" deck's link in a private window, type, close, reopen — the answers are back; the deck's row shows In progress, then Sent after Send; Clear answers empties it. **The WhatsApp preview is waiting too** (no migration): paste a deck link into a chat and see the Kaadal K. Production needs both migrations.
- **Settings refreshes every page after a change** — **vetted by the founder 2026-09-26**.
- **Design Management's simpler transmittal flow** (PR #81, on staging) — waiting for the founder's vet and the Fable review it skipped.
- **Design Management: sets by stage, sheets by code** (`0099`) — on staging, waiting for the founder's vet. Staging's drawings were wiped for it. **The Fable review of `0099` was skipped for staging and is due before production**; production then needs `scripts/wipe-drawings.ts` (dry run first) and `0099`.

**Getting it to `master`.** `staging` is ~150 commits ahead and carries `0094`–`0100`. Either the Chat door's ship checklist runs first and everything goes together, or a piece travels alone on a release branch cut from `master` (the skin: cherry-pick `a096e58`…`3fe4c95`, skip the sweep `f8a9e5c` and re-run it on `master`). Every route needs production restored first, then the migrations applied there and `db:compare` empty.

## Setup the tools are waiting on

3. **Grant `/design-management` to the design team** — nobody holds it.
4. **Grant `/supervisors` to the site supervisors** — nothing is visible to staff, and drawings reach site through it.
5. **Rebuild the rate book's materials** (staging) — no work has any material today, so no estimate can carry a material to Indents or Supervisors until a person enters them (Estimator → Works). 135 of 270 works have a labour rate; the Rate book's "Used but not priced" list shows the rest as estimates use them.
6. **The workbook's "Project IDs" sheet** — projects, plots and cost centres such as Rent House and Access Road (subprojects were set aside by the founder 2026-10-08). Its own step, not loaded: it renames Saarang to "Saarang Villas" and leaves out Plots 11–16, which have villas and clients.
7. **Tidy in Masters what the workbook left for a person** (staging): the look-alike vendors kept apart (Santhosh K / K Santhosh, C Saju / Saju C, Prabhakaran M / Prabhakaran, Rijesh / Rijesh K P, Madhu / Madhu M A, GeoBricks / Geo Bricks); Perfetto Industries and Chendayad Granites share one bank account and address — check with accounts; works F.1.38 / F.1.40 and F.1.39 / F.1.41 share a name at different rates; eight materials came with no unit and got `nos` (CAR/06A, MIS/28, MIS/30, MIS/35, PLD/103B, PLD/114, TILE/44, TILE/52), and MIS/28 "Non Data Available" and MIS/30 "Others" look like placeholders.
8. **Production only: re-enter 74 material rates** — superseded on ship day by the workbook, which prices every material.

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
