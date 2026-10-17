# TODO — what's next

Only what is next. What exists is `STATUS.md`, the rules are `CLAUDE.md`, history is git.

## Production

0. **Restore production, then find out why the keep-alive did not keep it awake** — still `INACTIVE` on 2026-10-08. Restore in the Supabase dashboard (a model session is refused the API call, rightly), then read the cron's runs under Vercel → Settings → Cron Jobs: a red run means `CRON_SECRET` (BUGCATCHER #18), no run means it never fired. The founder's call: "production later".
1. **Supabase Pro** — the founder's call. The only real answer to pausing, and the only way to get backups.
2. **Press one real write button on production** — the ship protocol's last step, still not done since the masters releases. Editing one of the 74 price-less materials (item 8) is the natural one.

## Waiting on staging for the founder's vet

Everything below is on `staging.goodearthkannur.org`. Each ships only after the founder says they have tried it there.

- **The ERP corrections** (`0101`–`0112`, merged 2026-10-10) — the whole purchase-to-payment chain. **The founder's checklist is `plan.md`, _Verification_**; on production, `0108` and `0112` go in one run.
- **Indents wait for the estimator; POs only from indents** (`0113`, merged 2026-10-11) — the founder's checklist is `plan.md`, _Verification (second build)_. Its Fable review was skipped on the founder's word for staging and **is due before production**. On production, every indent already submitted with lines outside the estimate will wait for the estimator.

- **Teams in the sidebar** (`0114`, 2026-10-13) — closed teams, Settings → Teams. The founder's checklist is `plan.md`, _Verification (fourth piece)_. Its Fable review was skipped on the founder's word for staging and **is due before production**.

- **Birdwing — the Hospitality team** (`0115`–`0117`, 2026-10-13): Birdwing Stays, Birdwing Books, a Birdwing tab in Financial Management, two Reporter datasets, and the old sheets imported. **The founder's checklist is `plan.md`, _Verification (fifth piece)_.** Its Fable review was skipped on the founder's word for staging and **is due before production**. On production: `0115`–`0117`, then `scripts/import-birdwing.ts --project pajfrgnkapicdgangjey --seed data/birdwing-seed.json`, dry run first (it adds Maloor Eco Farms to Masters → Companies if missing). Before real use: switch on the rate card, give Amal, Appu and Bijeeth pay rules, grant the people.
- **From a SketchUp model** (`0118`, 2026-10-15) — Goodearth QS for SketchUp sends a model's takeoff to the Estimator's **From the model** page, which measures a villa's working estimate from it. **The founder's checklist is `plan.md`, _Verification (sixth piece)_.** Its Fable review was skipped on the founder's word for staging and **is due before production**. On production: `0118` before the masters workbook import (the importer now writes `model_measure`), then a new `.rbz` for the team with the extension's default address switched to `toolbox.goodearthkannur.org`. Two rate-book questions stay open in `plan.md` (Superstructure units; what FD.16, FD.22 and FD.29–32 measure).
- **The Saarang tracker in Client Relations** (`0119`, `0120`, 2026-10-16) — Actions, the Plots grid, each plot's chips, build progress in Masters, Saarang West's 27 plots and the buyers who changed, the tracker's 15 Oct data imported. **The founder's checklist is `plan.md`, _Verification (seventh piece)_.** Before the team uses it: `/client-relations` for Anu, Sayooj and Sebastina. Its Fable review was skipped on the founder's word for staging and **is due before production**. On production, on cutover day: the tracker stops taking changes, a fresh `/api/export`, `0119`/`0120`, then `scripts/update-saarang-register.ts` and `scripts/import-saarang-tracker.ts` (dry run first), then the self-hosted tracker switched off.
- **Client Relations: each person sees their own work** (`0122`, `0123`, 2026-10-17) — a member sees the plots they own or hold an open action on, and those plots' actions and payments; admins and team leads (Settings, beside the grant) see everything. **The founder's checklist is `plan.md`, _Verification (tenth piece)_.** Before the team uses it: tick a team lead if there is one. Its Fable review was skipped on the founder's word for staging and **is due before production**. On production: `0122` and `0123` after `0121`, before the tracker import (so imported plots land with their owners already scoped).
- **The final masters workbook** — loaded on staging 2026-10-07, after every record there was cleared. Waiting for the founder's look through Masters → Vendors, Works, Items and Stages. On ship day, on production: `scripts/import-masters-workbook.ts --project pajfrgnkapicdgangjey --xlsx <workbook>`, dry run first. It stops while production's own records point at masters it drops, and the wipe script refuses production by design, so what happens to those records is the founder's call that day.
- **Catalogue pictures** — **vetted by the founder 2026-09-26**, and the close calls sorted in Masters. On ship day, on production: `scripts/import-catalogue-sheet.ts --project pajfrgnkapicdgangjey --xlsx <workbook>` and `scripts/fetch-catalogue-images.ts --project pajfrgnkapicdgangjey`, dry run first.
- **The Estimator rework** (`0096`–`0098`). Its approval pass by Fable was deferred by the founder and is due before production.
- **Relay × Google Chat round two** — the founder's steps and the checks are in `lib/google-chat/PLAN.md`; production has its own checklist there.
- **The skin** — nobody has looked at the signed-in screens in it yet; the browser checklist is `git show 42463f8:plan.md`.
- **Dexter** (`0095`, `0100`) — the links were tried and confirmed good; **saved answers (`0100`) are waiting for the founder's vet**: open the "Dexter answers test" deck's link in a private window, type, close, reopen — the answers are back; the deck's row shows In progress, then Sent after Send; Clear answers empties it. **The WhatsApp preview is waiting too** (no migration): paste a deck link into a chat and see the Kaadal K. Production needs both migrations.
- **Settings refreshes every page after a change** — **vetted by the founder 2026-09-26**.
- **Design Management's simpler transmittal flow** (PR #81, on staging) — waiting for the founder's vet and the Fable review it skipped.
- **Design Management: sets by stage, sheets by code** (`0099`) — on staging, waiting for the founder's vet. Staging's drawings were wiped for it. **The Fable review of `0099` was skipped for staging and is due before production**; production then needs `scripts/wipe-drawings.ts` (dry run first) and `0099`.
- **Design Management: WorkDrive links, TB numbers, the designer's revision number** (`0124`) — the founder's checklist is `plan.md`, _Verification (eleventh piece)_. The folder is read the way WorkDrive's own share page does it, with no key: if Zoho changes that page, the list stops and the link alone still issues (Design Management's `PLAN.md`).
- **Design Management: the Board** (`0126`, branch `feature/design-pipeline`) — each villa passed from stage to stage, people on each stage, send-backs, history, the design team's Actions. **Not on staging yet: `0126` waits for Fable's review or the founder's word**, then staging, then the founder's checklist, `plan.md`, _Verification (thirteenth piece)_. Before the team uses it: bring each villa already under way in with **Set where it is**.

**Getting it to `master`.** `staging` is ~185 commits ahead and carries `0094`–`0118`. Either the Chat door's ship checklist runs first and everything goes together, or a piece travels alone on a release branch cut from `master` (the skin: cherry-pick `a096e58`…`3fe4c95`, skip the sweep `f8a9e5c` and re-run it on `master`). Every route needs production restored first, then the migrations applied there and `db:compare` empty.

## Setup the tools are waiting on

3. **Grant `/design-management` to the whole design team** — some of them already issue on staging (six transmittals, 2026-10-16); Jiljith, Navarang and Vaishnav hold it (2026-10-17). Only grant holders can be put on a stage or own a design action.
4. **Grant `/supervisors` to the site supervisors** — nothing is visible to staff, and drawings reach site through it.
5. **Rebuild the rate book's materials** (staging) — no work has any material today, so no estimate can carry a material to Indents or Supervisors until a person enters them (Estimator → Works). 135 of 270 works have a labour rate; the Rate book's "Used but not priced" list shows the rest as estimates use them.
6. **The workbook's "Project IDs" sheet** — projects, plots and cost centres such as Rent House and Access Road (subprojects were set aside by the founder 2026-10-08). Its own step, not loaded: it renames Saarang to "Saarang Villas" and leaves out Plots 11–16, which have villas and clients.
7. **Tidy in Masters what the workbook left for a person** (staging): the look-alike vendors kept apart (Santhosh K / K Santhosh, C Saju / Saju C, Prabhakaran M / Prabhakaran, Rijesh / Rijesh K P, Madhu / Madhu M A, GeoBricks / Geo Bricks); Perfetto Industries and Chendayad Granites share one bank account and address — check with accounts; works F.1.38 / F.1.40 and F.1.39 / F.1.41 share a name at different rates; eight materials came with no unit and got `nos` (CAR/06A, MIS/28, MIS/30, MIS/35, PLD/103B, PLD/114, TILE/44, TILE/52), and MIS/28 "Non Data Available" and MIS/30 "Others" look like placeholders.
8. **Production only: re-enter 74 material rates** — superseded on ship day by the workbook, which prices every material.

## Next builds — the founder picks

- **Client Relations onto the shared action pieces** — `lib/next-steps/`, `lib/masters/plot-number.ts`, `components/ui/pill.tsx` and `undo-bar.tsx`, born from its own copies in the thirteenth piece. Wait until Client Relations' work in flight has landed (`feature/client-relations-one-owner`, 2026-10-17, edits those files); behaviour and tests unchanged. Relay's `celebrate.tsx` toast moves onto the Undo bar when next touched.
- **Client Relations' design checks from the board** — the CRM team types "client confirmed design", "permit" and "working drawing" on each plot; the design board now knows them. A cross-tool read with its contract-table row.

- **Set aside from the ERP corrections (founder, 2026-10-08), planned later:** subprojects; the works schedule (the PDF asked for a Gantt and cash flow — the founder: "I don't like Gantt", so its shape is open); drawing requests.
- **The Google Chat door, round three** — three candidates in `lib/google-chat/PLAN.md`.
- **Birdwing, later** (the build plan's own list): the guest's own check-in link (the first new public prefix since `/deck/` — `SECURITY.md` first), a Relay "Room turnover" trail type, arrival reminders, OTA channel sync, online payments, credit notes and IGST.
- **Phone-first lists and forms** — tables that become stacked cards on a phone, sticky Save, bigger tap targets; Indents, Inventory, Supervisors and Directory first.
- **A real sidebar search** — jump to any tool or screen over `lib/tools.ts`.
- **The structure underneath** — one heading style (35 raw `<h2>`s in 28 files), one page rhythm, a shared notice banner, `PageTitle` in one place.
- **A lint rule against raw palette classes** (`text-red-600`, …) in `app/(dashboard)/**` and `components/**`; nothing in CI catches one today.
- **A spinner inside a paragraph** — Budgets' margins browser (`margins-browser.tsx`) puts the shared `Spinner`, a `<div>`, inside a `<p>`: a hydration error whenever it searches. Make the line a `<div>` (From the model had the same; its probe caught it).
- **Check `error` on every single-row read** (found by the 2026-09-26 audit). About 30 reads take `data` and ignore `error`, so a failed read shows "not found" instead of an error screen — the red line in CLAUDE.md. Most are fetch-one-by-id: `lib/masters/{client,project,vendor}-detail.ts`, `lib/bills/queries.ts`, `lib/budgets/{actions,queries}.ts`, `lib/purchase-orders/queries.ts`, `lib/inventory/{issues,receipts}-queries.ts`, `lib/design-management/actions.ts`, `lib/relay/actions.ts`, `lib/selections/views-actions.ts`, and the three file routes under `app/(dashboard)/`. Storage downloads and `getClaims()` are fine as they are.

## Open questions for the founder

- Should a supervisor see only their own plots? Today every supervisor sees every villa, and the same answer decides who sees which villa's drawings. The mechanism exists since `0122` (a `scoped` tool with team leads, as Client Relations is); Supervisors would first need to record which supervisor is on which villa.
- The construction budget screens no longer feed Indents. Retire them, or keep them as history?
