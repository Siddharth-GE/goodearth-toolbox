# TODO — what's next

Only what is next. What exists is `STATUS.md`, the rules are `CLAUDE.md`, history is git.

## OS process updates — building now

The operations team's 18 requests: `plan.md`, top section. Waves 1 and 2 are on staging (#119, #120). **Next session starts at "Next session, in order" there**: the masters import, then applying `0133`–`0136` and building their screens.

## Native apps on iPhone and Android — next build

- **Now: the Capacitor app's native features, Android first.** The shell and Google sign-in are on staging; next are B (Face ID and fingerprint), D (the camera) and C (push), the top section of `plan.md`.
- **Meanwhile: the Play wrapper's version 1.** Built and signed; the founder's steps (Play Console, the reviewer account, the screenshots) and the fingerprint still to add are the launch steps in `android/PLAN.md`. The Capacitor app replaces it later as an update.
- **Waiting on the founder:** trying Google sign-in in the app; a Firebase project (phase C); Apple's Organization enrolment; what staff would scan (phase D).

## The switch: staging's database becomes production

The founder's decision (2026-10-16):

- Staging's database (`ipstebqawrvhkyntctrv`) becomes production.
- The old production project is deleted.
- A new, empty project becomes the practice database.
- The app is Kaadal Toolbox, at `toolbox.kaadalgroup.com`.

The founder gives the steps. Before the switch:

1. ~~The refactor before production~~ — done and vetted 2026-10-18 (`plan.md`).
2. The vet list below, tried or accepted as is.
3. Fable's pass over the reviews skipped for staging (`0096`–`0126`, each piece's section in `plan.md`), unless the founder waives it, as for the refactor's own migrations.
4. **Supabase Pro** for the new production database. It's the only way to get backups, and it ends the pausing.
5. At the switch:
   - `toolbox.kaadalgroup.com` already serves `staging` (Vercel domain on the `staging` branch, DNS a Cloudflare CNAME, DNS only); it moves to the production deployment, and staging's Supabase Site URL follows;
   - `lib/environment.ts` names the new production and practice databases; `npm test` then lists every other place that must follow (CI and `package.json`);
   - a new `.rbz` for Goodearth QS for SketchUp, with its default address on the production domain;
   - the Google Chat app pointed at production (the checklist is in `lib/google-chat/PLAN.md`).

## The founder's vet list (staging)

Each checklist is in `plan.md`, under the heading named.

- **The ERP corrections** (`0101`–`0112`): _Verification_.
- **Indents wait for the estimator; POs only from indents** (`0113`): _second build_.
- **Teams in the sidebar** (`0114`): _fourth piece_.
- **Birdwing** (`0115`–`0117`): _fifth piece_. Before real use, switch on the rate card, give Amal, Appu and Bijeeth pay rules, and grant the people.
- **From a SketchUp model** (`0118`): _sixth piece_. Two rate-book questions stay open there.
- **The Saarang tracker in Client Relations** (`0119`–`0121`): _seventh_ and _eighth pieces_.
  - Before the team uses it, grant `/client-relations` to Anu, Sayooj and Sebastina.
  - On cutover day, the self-hosted tracker stops taking changes.
  - A fresh `/api/export` then goes through `scripts/update-saarang-register.ts` and `scripts/import-saarang-tracker.ts`, dry run first.
  - Then the tracker is switched off.
- **Client Relations, each person sees their own work** (`0122`, `0123`): _tenth piece_. Tick a team lead if there is one.
- **Client Relations, two sides of a plot, one owner each** (`0125`): _twelfth_ and _fourteenth pieces_.
- **Design Management** (`0099`, `0124`, `0126`): _eleventh_ and _thirteenth pieces_. Bring each villa already under way in with **Set where it is**.
- **Relay × Google Chat, round two**: the checks are in `lib/google-chat/PLAN.md`.
- **The Kaadal look** (no migration): _the Kaadal look_.
- **Dexter saved answers** (`0100`):
  - Open the "Dexter answers test" deck's link in a private window, type, close and reopen. The answers are back.
  - Send marks it Sent, and Clear answers empties it.
  - A deck link pasted into WhatsApp shows the Kaadal K.
- **The final masters workbook**: a look through Masters → Vendors, Works, Items and Stages.

## Five stale trials

These `scripts/trials/` fail against today's staging data, with or without the latest migrations (checked 2026-10-18). Each needs its setup brought up to date, not the code:

- `birdwing-stays.sql`, step 6: "issued with no company" — the Birdwing company is missing or renamed.
- `client-actions-setter.sql`: steps now move with their side's owner (`0125`).
- `client-actions.sql`, step 1: the staff account sees no plots since `0123` scoped the tool.
- `client-relations-scope.sql`: the trial accounts already hold real actions.
- `takeoff-working-date.sql`: the trial villa already has an official estimate.

## Setup the tools are waiting on

1. **Grant `/design-management` to the whole design team.** Jiljith, Navarang and Vaishnav hold it. Only grant holders can be put on a stage or own a design action.
2. **Grant `/supervisors` to the site supervisors.** Drawings reach the site through it.
3. **Rebuild the rate book's materials.** No work has a material yet, so no estimate can carry one to Indents or Supervisors. 135 of 270 works have a labour rate; the Rate book's "Used but not priced" list shows the rest.
4. **The workbook's "Project IDs" sheet** is not loaded. It renames Saarang to "Saarang Villas" and leaves out Plots 11–16, which have villas and clients.
5. **Tidy in Masters what the workbook left for a person.**
   - Look-alike vendors: Santhosh K / K Santhosh, C Saju / Saju C, Prabhakaran M / Prabhakaran, Rijesh / Rijesh K P, Madhu / Madhu M A, GeoBricks / Geo Bricks.
   - Perfetto Industries and Chendayad Granites share one bank account and address; check with accounts.
   - Works F.1.38 / F.1.40 and F.1.39 / F.1.41 share a name at different rates.
   - Eight materials came with no unit and got `nos`: CAR/06A, MIS/28, MIS/30, MIS/35, PLD/103B, PLD/114, TILE/44 and TILE/52.
   - MIS/28 "Non Data Available" and MIS/30 "Others" look like placeholders.

## Next builds — the founder picks

- **Client Relations' design checks from the board.** The design board now knows "client confirmed design", "permit" and "working drawing". This is a cross-tool read, so it needs its contract-table row.
- **Set aside on 2026-10-08:** subprojects, a works schedule (not a Gantt), and drawing requests.
- **The Google Chat door, round three:** three candidates in `lib/google-chat/PLAN.md`.
- **Birdwing, later:**
  - the guest's own check-in link (a new public prefix, so `SECURITY.md` first);
  - room-turnover trails;
  - arrival reminders;
  - OTA sync;
  - online payments;
  - credit notes and IGST.
- **Phone-first lists and forms.** Indents, Inventory, Supervisors and Directory first.
- **A sidebar search** over `lib/tools.ts`.
- **The structure underneath:**
  - the remaining raw `<h2>` headings (small card headings and labels) onto `Section`, `Heading` and the label style;
  - one page rhythm;
  - a shared notice banner.

## Open questions for the founder

- Should a supervisor see only their own plots? Today every supervisor sees every villa, and the same answer decides who sees which villa's drawings. The mechanism exists since `0122` (a `scoped` tool with team leads); Supervisors would first need to record which supervisor is on which villa.
- Does the Training stub stay, or go until there is a plan for it?
