# Design Management — build plan

## Context

The design team issues drawings to site today outside the toolbox — there is no record of which drawing revision a supervisor is building from, and no transmittal trail. Relay deliberately refuses this territory (its PLAN.md: "nothing here stores a drawing, a decision or a document" — it tracks accountability only). This tool holds the artefacts Relay refuses: a **drawing-set master** linked to the works master, per-villa **revisions** with notes, **transmittals** issued per design stage, and the released drawing surfacing in the **Supervisors app** against each work. One drawing set serves many works/activities.

Founder decisions taken 2026-08-22 (this session): own customizable design-stage list (coexists with Relay's stages, the works-vs-construction-stages precedent from `0073`); revisions live **per drawing set per villa** (R0, R1… with a note — the Selections model); a revision may hold **several files**; sharing is **in-app + a letterhead PDF cover sheet** to forward manually. Reviving the tool partially reverses the "Relay replaced Design Management" settled decision — the boundary now is: **Relay keeps who-has-the-baton; Design Management keeps the drawings themselves.** STATUS.md's settled-decisions line gets amended to say so.

## Facts already established (do not re-derive)

- **`/design-management` is already a legal slug** in both `user_apps_app_known` and `role_apps_app_known` (since `0030`, restated through `0084`). **No CHECK migration needed.**
- Next migration number: **`0091`**. Highest applied is `0090`.
- Anchor: design side anchors **`unit_id`** (like Selections/Estimator); Supervisors bridges plot→unit via the `0029` 1:1 exactly as `lib/supervisors/queries.ts:211` already does.
- No money anywhere in this tool — no fact view needed; plain tables with widened SELECT quals (the `issue_requests` pattern from `0084`), **no view-manifest change**.
- Server-action body cap is 4 MB (`next.config.ts`) and Vercel caps request bodies ~4.5 MB — so **each drawing file is capped at 4 MB**; a big set is uploaded as several sheet files (multiple files per revision makes this workable). If real drawings outgrow this, the later escape hatch is signed upload URLs direct to storage — not now.

## Migration `0091_design_management.sql` — one migration, everything below

Copy `0084_supervisors.sql`'s structure: numbered sections, audit + `set_updated_at` triggers, RLS on every table, revokes in the same migration, closing `do $$` assertion block (RLS on, policy counts, trigger presence, bucket shape).

**Tables** (all RLS on; writes gated `has_app('/design-management')` unless noted):

1. `design_stages` — id, name (unique on `lower(name)`), sort_order, is_active, audit cols. Seed: Concept, Approvals, Working Drawings, Structural, MEP, Interiors. SELECT open to authenticated (names only, the works-masters shape).
2. `drawing_sets` (the drawing master) — id, code (unique, optional), name, description, sort_order, is_active, audit cols. SELECT open.
3. `drawing_set_works` — set_id → drawing_sets, work_item_id → work_items, unique pair. The master's **default** work links. SELECT open.
4. `drawing_revisions` — id, unit_id → units, drawing_set_id, revision_no int ≥ 0, note text, status `draft|released|superseded`, released_at, released_by → profiles, superseded_by → drawing_revisions, created_by, timestamps. `unique (unit_id, drawing_set_id, revision_no)`; partial unique index: **one draft per (unit, set)**; `unique (id, unit_id)` as composite-FK target (the `0006` selections shape). SELECT qual: `has_app('/design-management') or (has_app('/supervisors') and status <> 'draft')` — **one policy, widened qual, never a second**.
5. `drawing_revision_works` — revision_id, work_item_id, unique pair, plus denormalised unit consistency if trivial. **Copied from `drawing_set_works` when the revision is created, editable while draft** — this is "customizable on release". Draft-only trigger (the `selection_lines_draft_only` pattern from `0006:177`). SELECT via `exists` on the parent revision's qual.
6. `drawing_revision_files` — id, revision_id, storage_path (object key, never a URL), file_name, content_type, sort_order, uploaded_by, created_at. Draft-only insert/delete. SELECT via `exists` like above.
7. `transmittals` — id, unit_id → units, design_stage_id → design_stages, number text unique (`TR-0001` — reuse the existing document-number mechanism POs use; if it is PO-specific, add a row/branch of the same shape), note, status `draft|issued`, issued_at, issued_by, created_by, timestamps; `unique (id, unit_id)`. SELECT qual: `has_app('/design-management') or (has_app('/supervisors') and status = 'issued')`. Draft deletable; **issued transmittal immutable and deletion refused** (guard trigger, the `selections_guard` pattern).
8. `transmittal_lines` — id, transmittal_id, unit_id (denormalised on purpose), drawing_revision_id; composite FKs `(transmittal_id, unit_id) → transmittals(id, unit_id)` and `(drawing_revision_id, unit_id) → drawing_revisions(id, unit_id)` so a cross-villa line is impossible (the `0006` selection_lines trick); unique (transmittal_id, drawing_revision_id). Draft-only trigger.

**Guard triggers**: `drawing_revisions_guard` — once status ≠ draft, only `status`/`superseded_by` may move; legal transitions `draft→released`, `released→superseded`. Files/works/lines draft-only as above. Deletion of a released revision refused, not cascaded.

**Function** `issue_transmittal(p_transmittal_id uuid)` — `security invoker` (RLS applies), the `issue_selection` shape from `0007:17-53`: `select … for update`; refuse unless draft; refuse zero lines; then for each line's revision — if draft, mark released (stamp released_at/by); supersede any previously-released revision of the same (unit, set), setting `superseded_by`; a line may also carry an **already-released** revision (re-sharing the same set at a new stage — one set, many activities). Finally stamp the transmittal issued. `revoke execute from public, anon` in the same migration. RAISE messages written for a person to read.

**Bucket** `drawings` — private, `file_size_limit` 4194304, MIME allow-list `application/pdf, image/jpeg, image/png`. Path `revisions/<revisionId>/<uuid>.<ext>`. Exactly 3 `storage.objects` policies with **fully-qualified `public.has_app(...)`** (`0061`'s lesson — unqualified fails at upload time, not apply time): SELECT `public.has_app('/design-management') or public.has_app('/supervisors')`; INSERT and DELETE `/design-management` only. No UPDATE policy — a replacement is a new object at a new path. Assertion block pinning bucket private + 3 policies, the `0061`/`0069` shape.

Apply protocol (`SHIPPING.md`): `npm run db:apply -- --project ipstebqawrvhkyntctrv --commit` (staging) → `npm run db:types:staging`; production only after the founder's staging vet, then `db:types`.

## Code

**Registry & shell**

- `lib/tools.ts`: add `DraftingCompass` (lucide) to `TOOL_ICONS`; new entry — name "Design Management", href `/design-management`, group **Management**, `built: true`, plain-English description. Amend the lines 182–185 comment: Relay keeps accountability; this tool now holds the artefacts.
- `CLAUDE.md`: add `lib/drawings/` to the shared-utilities list (one line).

**New shared module `lib/drawings/`** (the `lib/design-views` precedent: Design Management owns all writes; reads shared, no grant check inside — each caller gates itself): `queries.ts` with `listReleasedDrawingsForUnit(unitId)` → sets with latest released revision, note, files, work links; and `downloadDrawingFile(fileId)`. Consumed by Supervisors and by Design Management's own screens.

**Tool code** — `lib/design-management/queries.ts` + `actions.ts` (module-level `const GRANT = "/design-management"`, every function opens `requireTool(GRANT)`, actions return `ActionState`, never throw, **no `export type` re-exports from `"use server"` files**, every action ends `revalidatePath("/design-management", "layout")`). `getWelcomeCounts()` in one `Promise.all` of `head: true, count: "exact"` reads: drawing sets, villas with released drawings, draft revisions, transmittals issued — counts, never rupees.

**Upload action** — copy `uploadMyPhoto` (`lib/directory/actions.ts:158-259`) step-for-step: `requireTool` first; `file instanceof File`, size ≤ 4 MB, MIME allow-list; images re-normalised via `sharp` to JPEG (`fit: "contain"` on white — never crop a drawing, per `lib/pdf/theme.ts` designView doctrine), PDFs stored as-is; **`new Blob([new Uint8Array(buf)], { type })` — BUGCATCHER #1**; upload, then `storage.list` size-verify, remove on mismatch; object-then-row with `storage.remove` on row failure; delete is row-first-then-object.

**File serving route** — `app/(dashboard)/design-management/files/[fileId]/route.ts` (the `selections/views/[viewId]/route.ts` shape): `getCurrentUser()` → 401; `hasApp('/design-management') || hasApp('/supervisors')` → else 403 (`hasApp`, not `requireTool` — a redirect is meaningless in a fetch response); look up the file row **via the RLS-scoped client** so the widened qual hides draft files from supervisors automatically; stream `download()`, `Content-Type` from the stored `content_type`, `Cache-Control: private, max-age=3600`.

**Screens** — `app/(dashboard)/design-management/`: `PLAN.md`, `layout.tsx` (`requireUser` → `requireApp`), `loading.tsx` with shared `Spinner` on every route, all UI from `components/ui/*`, read `DESIGN.md` before styling:

- `page.tsx` — welcome via `tool-welcome.tsx` (the `supervisors/page.tsx` template).
- `sets/` — drawing master list + create/edit; work-links editor over `getWorksTree()` from `lib/masters/works.ts` (checkbox tree, the established works picker data).
- `stages/` — the stage master (rename, reorder, retire).
- `villas/` — picker (copy the Supervisors villa list pattern; display villa + plot + project names, merge names through `Map`s — **no bare embeds**: units→plots has two FK paths, BUGCATCHER #2, and `drawing_revisions` has multiple FKs to `profiles`, so profile names also merge through Maps).
- `villas/[unitId]/` — the villa design page: stage board (per stage: transmittals issued + last date — **derived, never stored**), each set with its revision history (R#, note, files, status), upload-revision dialog (creates the draft, copies default work links), edit note/work-links while draft, "Start next revision" (max+1 for the unit+set, the `create_next_revision` numbering rule).
- `transmittals/` + `transmittals/[transmittalId]/` — create draft (villa + stage + pick sets at their current revision + note), detail with Issue button calling the RPC (strip the plpgsql prefix from RAISE messages, `lib/selections/actions.ts:85` pattern), and `pdf/route.ts` — `DocumentPage` with `documentType="TRANSMITTAL"`, `reference=number`, `isDraft` until issued, one `DocumentTable` of set code / name / revision / note / files; `createElement` not JSX (route.ts cannot compile JSX); filename `Goodearth-Transmittal-<number>.pdf`; `Cache-Control: no-store`.

**Supervisors surfacing** (their folder, via `lib/drawings/` only — one tool never imports another tool's code; a shared module is the sanctioned answer):

- Villa page (`app/(dashboard)/supervisors/villas/[plotId]/page.tsx`): a **Drawings section** (released sets: name, R#, date, note, tappable files — phone-first) after the estimate line; and a **"Drawing · R2" chip** in each per-work `Section` header (`page.tsx:174-180`) where a released revision's work links include that `work_item_id`, linking to the file route.

**Not in scope** (say no, note for later): Relay's `pusher_chain_links` gaining a `'transmittal'` target kind; outbound email; per-supervisor plot assignment; catalogue-picker allow-list (this tool doesn't use the catalogue picker).

## Docs, in the same PR

- `STATUS.md`: Tools table row (state **Staging**); contract-table rows — **Design Management**: shared `units`/`plots`/`projects`/`profiles` + works masters via `lib/masters/works.ts`; **Supervisors**: add the drawings read via `lib/drawings/`; amend the settled-decisions Relay line.
- New `app/(dashboard)/design-management/PLAN.md` — the boundary with Relay, the four founder decisions, the 4 MB file rule and why.
- `TODO.md`: this build replaces the current "next" once the running plan lands at repo-root `plan.md`.

## Steps and owners (MODELS.md ladder)

Tick each step here as it lands — mid-build, this list is the live board. A build session takes only the steps tagged for it.

### 1. ✅ `[Fable]` This plan

Approved by the founder 2026-08-22; this file is the running board. Branch `feature/design-management`.

### 2. ✅ `[Opus]` draft + ✅ `[Fable]` review/apply — migration `0091`

Reviewed, tightened and **applied to staging** 2026-08-22 (`db:types:staging` regenerated, typecheck clean; production waits for the founder's staging vet at step 8). The Fable pass accepted all four drafting decisions below and closed two gaps before applying:

- `drawing_revisions_guard` now freezes `released_at`/`released_by` once a revision is off draft — they are set exactly once, on release; the drafted guard would have let a direct REST update rewrite when a drawing went to site.
- `transmittals_issue_shape` now ties `number`, `issued_at` and `issued_by` each to issued status **both ways** — the drafted one-directional CHECK let a draft hold a number (false = false passes), and a draft squatting on TR-0005 would collide with the counter the day it minted the same one.

### 3. ✅ `[Sonnet]` Registry + masters screens

Registry entry, `lib/design-management/` skeleton, welcome screen, sets + stages master screens. Landed 2026-08-22 — `lib/tools.ts`, `lib/design-management/{queries,actions}.ts`, and `app/(dashboard)/design-management/{layout,page,loading}.tsx` + `sets/` + `stages/`. Full checks green (prettier, lint, tsc, test, build, check:actions). Vetted by Fable 2026-08-22 — diff read against the plan and the red lines, welcome-count error handling confirmed to match the shipped Supervisors convention — and committed. Decisions taken where the plan didn't specify are below, all five accepted.

### 4. ✅ `[Sonnet]` Villa design page + revisions + files

Villa design page, revision lifecycle, upload action + file route. Upload one real PDF and one photo on staging, **read both back, check `%PDF` / `ffd8ff` magic bytes and sizes** (BUGCATCHER #1's check).

Landed 2026-08-22: villa picker + villa design page (stage board, revision history, add-a-drawing), six revision/file actions, the private file route, and the works checkbox tree shared with the sets screen. Vetted by Fable the same day — the four in-report decisions all follow named precedents and are accepted; one fix applied in the vet: createDraftRevision now reports honestly when the default work links fail to copy (partial success, the line-pull doctrine) instead of showing plain success over an unlabelled empty list. The real-upload magic-byte smoke remains with step 7.

### 5. ✅ `[Opus]` Transmittals

Transmittal create/issue + PDF cover sheet; Opus vets steps 3–4 before each commit.

Built 2026-08-22 and vetted by Fable the same day: diff read against the plan and the guards,
decisions 10–16 all accepted, and the cover sheet **render-smoked** — both variants (issued and
draft) rendered to real PDFs from type-correct synthetic data, which the build alone cannot prove.
(The first smoke crashed on wrongly-shaped hand-made data — a reminder that the type contract is
load-bearing; the component and route are typechecked against it.) Landed: three queries and six actions in `lib/design-management/`, the transmittals list and
detail screens, the create dialog on the villa design page, and the letterhead cover sheet at
`transmittals/[transmittalId]/pdf`. Full checks green (prettier, lint, tsc, test, build,
check:actions). Seven decisions the plan didn't spell out are below, numbered 10–16.

### 6. ✅ `[Sonnet]` Supervisors surfacing

Via `lib/drawings/` only.

Built 2026-08-22: new shared `lib/drawings/queries.ts` (`listReleasedDrawingsForUnit`, no grant
check, imports only the Supabase client + `fetchAll`, never `lib/design-management/` or
`lib/supervisors/`), consumed from `lib/supervisors/queries.ts` (its `getVillaDetail` now folds
the drawings read into its existing `[issues, receipts]` `Promise.all`, and its module doc comment
names the new cross-tool read), and two additions to the villa page
(`app/(dashboard)/supervisors/villas/[plotId]/page.tsx`): a **Drawings** section between the
estimate line and Labour (released sets, R#, release date, note, tappable files opening
`/design-management/files/<fileId>` in a new tab, phone-sized touch targets, empty state exactly
as specified), and a **"Drawing · R…"** chip in each per-work section header linking to that
section. One decision recorded below (17). Not yet vetted or committed — full CI (prettier, lint,
tsc, test, build, check:actions) run and reported to the tier above; step 7 owns the probe smoke
and the merge.

### 7. ✅ `[Opus]` Docs and the probe smoke

Docs (STATUS/PLAN/CLAUDE/TODO), probe smoke as a single-grant account (grant the probe `/supervisors`, confirm it sees released drawings and **not** drafts; then `/design-management` alone for the write side — the browser-smoke sign-in technique), full CI green via `gh run list`, merge to `staging` and push.

Landed 2026-08-22, **uncommitted for the Fable vet**. The merge and push are **not** this step's — MODELS.md's hard rule sends every `staging` merge through the Fable approval pass, which is step 8. Docs: STATUS.md gained the Tools row (state Staging) and the Design Management contract row, the Supervisors contract row gained the `lib/drawings/` read and 0091's widened quals, and the Relay settled-decisions line now records the 2026-08-22 boundary; CLAUDE.md lists `lib/drawings/` among the shared utilities; the tool's `PLAN.md` is new; TODO.md was replaced per its own rule, with the four still-open items carried forward.

**The probe smoke ran end to end under the real Next runtime** (`npm run dev` against staging, which has `0091`) as `siddharth.cyriac.99+probe@gmail.com` — a throwaway password, the emailed-code step passed with the admin `generate_link`'s `email_otp`, the `auth_verified_sessions` row written the way `markSessionVerified` writes it, and every write driven as a **real `Next-Action` POST** with React's own `encodeReply`, not a direct function call. Decisions 18–20 below record what it proved, what it could not, and what it left behind.

### 8. 🔶 `[Fable]` Merge approval done, staging merged — the founder's vet is next

Merge-approval pass against this plan, `SECURITY.md`, `BUGCATCHER.md`. **Founder vets on staging.goodearthkannur.org — nothing reaches production before that**; then `0091` to production, `staging` → `master`, and press one real write button on production.

2026-08-22, Fable: approval pass complete — every step's diff was vetted before its commit, the whole-branch scan found no admin client, no raw-Buffer upload, no manifest drift, no out-of-lane files; PR #51 ran CI green and merged to `staging` at 136fbd9. **Waiting on the founder's vet at staging.goodearthkannur.org** (checklist below; the welcome starts at 1 smoke set and 2 transmittals, not zeroes — smoke residue, recorded in step 7's notes). Production (0091 apply + master merge + the write-button press) happens only after their word.

### 9. ⬜ `[Opus]` The founder's redesign of the flow

**Founder vetted on staging 2026-08-22 and redirected the flow**: _"let this new drawing sets thing
come inside the new transmittal instead of under the villa overview, press new transmittal, upload
the docs and issue to site, in the overview you just see what's been issued, under new transmittal
you either upload a new set of drawings or you revise a set that can be seen there."_

Built the same day on `staging`, **awaiting the Fable vet before it is committed** — the box stays
open until then. **No migration**: `0091` and `0092` already model all of it, and no guard moved.
The villa page became the record of what has been issued; the draft transmittal became the
workspace, carrying the Add drawings board, the inline draft editor and the two-question line
removal. Full checks green (prettier, lint, tsc, test, build, check:actions) plus a synthetic-data
render of both cover sheets. Decisions 21–26 below; the flow itself is written up in the tool's
own `PLAN.md` under "Where the work happens".

### 10. ⬜ `[Opus]` The founder's second redesign — plot level, everything

**Founder saw the redesign live and cut deeper, 2026-08-22 evening**: _"change the flow, dont make
a new drawing set outside … person sees all villas (as cards) goes into the villa there all
transmitals of that plot, filters by group, and then a new transmital selector … not a master set
for the whole damn project … outside no need of an all transmittals page either plot level
everything, and then you go in and in and go back one step where required. the flow is super
cluttered right now."_

Built the same evening on `staging`, **awaiting the Fable vet before it is committed**. **No
migration** — `drawing_sets` is untouched; what died is the idea of it as a project-wide master.
Three routes deleted (the global transmittals list and both drawing-set master screens), the stage
board deleted, three queries and five actions deleted; one action added
(`createSetOnTransmittal`). Villas are cards, the villa page is its own transmittal list with stage
chips, and a drawing set is born inside a transmittal. Full checks green (prettier, lint, tsc,
test, build, check:actions). Decisions 27–32 below; the flow is written up in the tool's own
`PLAN.md` under "The flow: plot level, everything".

Commit each working piece with a plain-English message.

## Questions for the tier above

Four notes from drafting `0091` (Opus, 2026-08-22). **All four accepted by the Fable review pass, 2026-08-22** — the delete functions and issue-time minting are right; the coarser storage SELECT follows the `design-views` precedent (bucket coarse, route fine, paths unguessable UUIDs) and is not worth a cross-schema subquery in a storage policy; and the absent qualification assertion is correctly absent — a check that cannot fail is worse than no check. Step 4's upload smoke remains the real proof that `public.has_app` was qualified.

1. **Two delete functions the plan did not name.** `delete_draft_transmittal(uuid)` and `delete_draft_revision(uuid)`, both `security invoker`, in the `0017 §8` shape. The plan makes a draft transmittal deletable, and both it and a draft revision have child rows — deleting them as two requests is the exact bug `delete_draft_selection()` exists to prevent. `delete_draft_revision` also refuses if the revision is already on a transmittal, and leaves the storage objects to the caller (rows first, then objects). Strike them and a draft raised by mistake has no way out.
2. **The transmittal number is minted on Issue, not on create.** The founder's checklist reads "press **Issue** → number TR-0001 appears", so `transmittals.number` is null until issued (unique, with a CHECK tying it to the status) and an abandoned draft cannot burn a number. Consequence for step 5: the PDF cover sheet of a draft has no reference and prints as a draft.
3. **The `drawings` bucket SELECT policy is coarser than the table's**, exactly as the plan specifies (`/design-management or /supervisors`). So a supervisor holding a draft sheet's storage path could fetch the object directly. Both path segments are UUIDs and the revision id is unreadable to them, so it is not reachable in practice — but the path is `revisions/<revisionId>/<uuid>.<ext>`, and `0061`'s `(storage.foldername(name))[2]` trick would close it exactly by joining back to `drawing_revisions`. Left as planned rather than improvised; Fable's call.
4. **Nothing asserts that the storage policies qualify `public.has_app`.** Postgres resolves the function to an OID at `create policy` time, so `pg_policies` renders both forms identically and any such check could only ever pass. The source text is qualified; §14 of the migration says why the assertion is absent rather than leaving a silent gap.

Five notes from step 3 (Sonnet, 2026-08-22) — the plan named the screens but not every detail; each was decided by following the nearest existing convention rather than improvising something new. **All five accepted by the Fable vet, 2026-08-22** — each follows a named precedent, and the dead Villas link is exactly what the plan asked for until step 4 lands.

5. **`getWelcomeCounts`'s "villas with released drawings" reads the full `unit_id` column, not a `head:true` count**, exactly as the plan allowed ("a cheap fetchAll if head-count can't express it — state a limit honestly"). It's one column via `fetchAll` (paged, complete, no cap) and dedupes with a `Set` — the doc comment in `lib/design-management/queries.ts` says why. Cheap today; worth revisiting only if drawing_revisions ever gets large enough for this to matter, which nothing in this tool's scale suggests.
6. **Drawing set delete vs. deactivate**: `deleteDrawingSet` attempts a real delete and surfaces the FK's `23503` as a friendly "deactivate instead" message (never a throw) — the plan's own wording ("a plain delete of an unreferenced set may be offered if the DB allows it"). No confirmation dialog before delete, matching the existing convention (`deleteLabourLog` in Supervisors, `withdrawIssueRequest`) — nothing in this codebase does a browser `confirm()` before a destructive action; the FK refusal is the safety net for a set already in use, and for one that isn't, delete is cheap to redo by mistake.
7. **`drawing_set_works` write is a whole-list diff** (`setDrawingSetWorks(setId, workItemIds[])`, insert what's newly checked, delete what's newly unchecked) rather than per-checkbox insert/delete calls — the plan said "insert/delete, there is no update" but not the call shape. Followed Relay's `setTrailSetActivities` precedent (`app/(dashboard)/relay/sets/_components/set-editor.tsx`) so a tree of ~230 works saves as one atomic diff instead of one request per toggle.
8. **Design stage reorder swaps `sort_order` with the adjacent neighbour** (two updates) rather than rewriting the whole ordered list on every move — cheaper than Relay's rewrite-the-list pattern since a stage move never changes membership, only position. New stages still land at `max + 10`, per the plan.
9. **The Villas link on the welcome screen points at `/design-management/villas`, which doesn't exist yet** (step 4's territory) — the plan explicitly said to link it anyway and call out that it's dead for now. Confirming that's exactly what shipped: no `villas/` route was created in this step.

Seven notes from step 5 (Opus, 2026-08-22) — the plan named the screens and the rules; where it
left a choice open, each was settled by following the nearest existing convention rather than
inventing one.

10. **REVERSED by the founder on the staging vet — see note 21.** A transmittal is now created
    empty and "at least one drawing" is enforced only at Issue. What follows is what shipped
    first, kept because the reversal only makes sense beside it. **A transmittal cannot be created
    empty** — the plan allowed either branch, and this was the
    "at least one line before it can be created" one: the dialog refuses with "Tick at least one
    drawing to send." A draft can still _reach_ zero by having its last line removed, and that
    state is handled honestly rather than hidden: the detail screen says so in danger text, and
    **Issue stays pressable**, so the RPC's own sentence ("Add at least one drawing before issuing
    this transmittal") is what the person reads. A greyed-out button teaches nothing.
11. **The list is ordered by `created_at`, newest first, capped at 100 with a real total.** A draft
    has no issue date and PostgREST cannot order on a coalesce; in practice a transmittal is issued
    minutes after it is raised, so the two orders agree, and an unfinished draft belongs at the top
    anyway. The cap is stated on screen ("Showing the N newest of M"), the `LOGS_SHOWN` convention
    from Supervisors.
12. **The issued number reaches the screen through the URL, not through a wider `ActionState`.**
    `issue_transmittal` returns `TR-0001`; `issueTransmittal` redirects to
    `…/transmittals/<id>?issued=TR-0001` and the page says "Issued as TR-0001. The drawings on it
    are now released to site." The alternative was declaring a richer state type in a `"use server"`
    file (the Marathon `EntryState` precedent), which is exactly the shape CLAUDE.md's red line
    tells every other action to stay away from. The header shows the number regardless.
13. **Villa → transmittals is a filtered list**, the option the plan offered: the villa design page
    links to `/design-management/transmittals?villa=<unitId>`, which says whose transmittals it is
    showing and offers "Show all villas". The **"New transmittal" dialog sits in the villa page's
    title actions**, because a transmittal is always for one villa and that is the page that knows
    which. The welcome screen gained a **Transmittals** link — without it the list was reachable
    only by guessing the URL.
14. **Line order follows the pick list, which follows the drawing-set master's own `sort_order`** —
    not the order the boxes were ticked, which `FormData.getAll` does not preserve anyway. One
    sequence on the screen, on the transmittal and in the PDF, which is what "sheet order" has to
    mean.
15. **The cover sheet carries a signature strip on an issued sheet only** — "Issued by, for
    Goodearth" and "Received at site" — following `SelectionDocument`, where a draft is deliberately
    never made to look signable. A draft prints with the DRAFT watermark and a reference reading
    "Draft", since 0091 refuses to let one hold a number.
16. **`createTransmittal` cleans up after itself.** The header and its lines are two requests (a
    `create_draft_transmittal` function was not in the migration and this build does not add one),
    so if the lines fail the header is deleted again rather than left as an empty draft nobody
    asked for. If even the cleanup fails it is logged and the empty draft is visible on the list
    with a working Delete — never silence.

One note from step 6 (Sonnet, 2026-08-22) — the plan named the module, the section and the chip
but left the multi-set case and the failure shape open; both were settled by following the
nearest existing convention rather than inventing one.

17. **A work section's "Drawing · R…" chip always links to the Drawings section's anchor
    (`#drawings`), never straight to a file** — even when exactly one set matches. With more than
    one set linked to the same work (the master allows it, though rare in practice) there is no
    single "right" file to jump to, so the chip names the first match's revision and counts the
    rest (`Drawing · R2 +1 more`) and one link target keeps the rule identical whether there's one
    match or several — the smallest change that reads well, as the plan asked for. Separately,
    `lib/drawings/queries.ts` throws (with context) rather than returning an empty list on a failed
    read or a released revision missing its `released_at` stamp — an empty Drawings section that
    is actually a database error would read as "nothing released yet," and the guard trigger from
    0091 that stamps `released_at` exactly once means a missing value there is a data-integrity
    problem worth failing loudly over, not a display choice. The drawings read itself folds into
    `getVillaDetail`'s existing `[issues, receipts]` `Promise.all` (now `[issues, receipts,
drawings]`), conditioned on the unit row exactly like the takeoff read above it — no second
    Promise.all, and a villa with no unit row gets an empty drawings list rather than a query.

Three notes from step 7 (Opus, 2026-08-22) — the smoke, and the two things it costs.

18. **The smoke drove the real server actions over HTTP, not the functions directly.** Each write
    was a `POST` to the page that owns the action with its `Next-Action` id (read from
    `.next/dev/server/.../server-reference-manifest.json`) and a body built by React's own
    `encodeReply` — so Next's patched `fetch`, the RSC action decoding and the RLS-scoped
    request cookies were all in the path. That matters most for **BUGCATCHER #1**, which by its
    own entry does not reproduce outside the Next runtime. **Proved:** a real 1,940-byte PDF and
    a real 105,759-byte JPEG uploaded through `uploadDrawingRevisionFile`, then downloaded back
    through `/design-management/files/<id>` — the PDF returned **byte-for-byte identical**
    (sha256 `4e4c7631…dbaa` both ways, magic `25504446` = `%PDF-`), the image returned a real
    JPEG (`ffd8ffdb`, 265,313 bytes after the `sharp` contain-resize the action performs on
    purpose), and **zero `EF BF BD` sequences** in either — the exact corruption signature.
    `public.has_app` in the storage policies is therefore proved qualified, which is the check
    §14 of `0091` deliberately could not make. Also proved end to end: the six screens render as
    a single-grant user; `TR-0001` minted only on Issue; R0 released with `released_at`/`released_by`
    stamped; both cover sheets render real PDFs (`Goodearth-Transmittal-Draft-Villa-9.pdf`,
    `Goodearth-Transmittal-TR-0001.pdf`, `no-store`); all five guards refuse with their own
    sentences and leave the state untouched; the one-draft-per-set-per-villa index refuses a
    second draft in plain English; an object orphaned by a refused row write is removed (three
    storage objects for three rows, none stranded); with `/supervisors` alone the villa page shows
    the released set and its sheets, the **draft R1 is invisible — name, id and all** — the draft's
    file id answers **404** on the file route while the released one answers 200 with `%PDF-`, and
    `/design-management` serves no tool content at all; the per-work **"Drawing · R0" chip**
    renders against `IN.1 · Cabinet Fabrication` and anchors at `#drawings`. `app_errors` stayed
    empty and the only `console.error` lines in the dev log are the four guard refusals that were
    fired on purpose.
19. **What the smoke could not prove, and needs the founder's browser.** It drove the actions, not
    the forms — so the client components' own wiring (the file input, the works checkbox tree's
    submit, the create-transmittal dialog, `useActionState` error rendering) is still only
    typechecked. Nothing here looked at a rendered page: layout, dark mode, and phone-width
    behaviour on the Supervisors villa page are unproven, and BUGCATCHER #4 and #8 both live in
    exactly that gap. The PDF cover sheets were confirmed to be real PDFs of a plausible size —
    **nobody has looked at one**. And this was `npm run dev` on this machine, not
    `staging.goodearthkannur.org`; the founder's vet still has to happen there.
20. **The smoke left permanent rows on staging, by design, and the founder's checklist step 1 is
    now wrong.** An issued transmittal and a released revision cannot be deleted — that is the
    tool's whole point — so the practice database keeps: one drawing set `SMK-WD-GF · "SMOKE —
Working Drawings, Ground Floor"`, `TR-0001` on Saarang Villa 9 with R0 and two sheets, and
    `TR-0002` on Saarang Villa 1 with R0 and one sheet (Villa 1 was needed because it is the only
    plot with material drawn against a work, and without a per-work section there is nothing for
    the chip to hang on). Everything deletable was deleted: the R1 draft, its sheet and its storage
    object are gone, leaving three objects for three rows. **So step 1 below will read "1 drawing
    set, 2 villas, 2 transmittals", not zeroes** — that is smoke residue, not a bug, and the
    founder should be told before they open the page. The probe's grants are back to exactly what
    was found (`/inventory`, `/estimator` — the second one predates this session, left from the
    2026-08-19 Estimator smoke), its session was signed out globally, its `auth_verified_sessions`
    row deleted and its throwaway password rotated to a value nobody holds.

Six notes from the flow redesign (Opus, 2026-08-22) — the founder used the first build on staging
and moved the work from the villa page onto the transmittal: _"press new transmittal, upload the
docs and issue to site, in the overview you just see what's been issued"_. **This reverses decision
10 above**, which is recorded there rather than quietly dropped. `app/(dashboard)/design-management/PLAN.md`
now carries the whole flow under "Where the work happens".

21. **Decision 10 is reversed: a transmittal is created EMPTY.** The dialog asks only for the
    design stage and an optional note, then opens the transmittal. Requiring a drawing up front
    assumed the drawings already existed, which is the assumption the founder's flow inverts. "At
    least one drawing" is now enforced in exactly one place — `issue_transmittal`, which already
    refused an empty one — and its sentence is what the person reads. Issue therefore stays
    pressable on an empty draft, which is the half of decision 10 that survives intact.
22. **Three offers, one action.** The Add drawings board lists every drawing set and labels the
    button from what the villa has of it: "Continue draft R2", "Revise — starts R3", or "Upload
    first drawings — R0". All three call `createRevisionOnTransmittal`, which re-reads the state
    itself and continues an open draft rather than starting a second (the partial unique index
    would refuse one anyway). The label is the only thing that differs, so the screen cannot
    disagree with the database about which case it is in. Numbering and the default-work-links
    copy moved into one private helper, `startDraftRevision`, which is now the only code in the
    tool that starts a revision.
23. **One line per drawing set per transmittal — a screen rule, not a database one.** A set already
    on the transmittal shows "On this transmittal" and is offered neither path. The database is
    happy to carry a set's released R1 and its draft R2 on the same transmittal (issuing would
    then release R2 and supersede R1 in the same breath), but nobody reading the cover sheet
    afterwards could say what went out, so the screen declines to offer it.
24. **Removing a draft line asks a second question rather than guessing.** The trash icon takes the
    drawing off this transmittal; "Remove and delete the draft" also destroys it. They are
    different acts — one is a change of mind about today, the other loses uploaded sheets — and the
    database forces the order: `delete_draft_revision` refuses while the line still exists, so the
    line goes first, then the rows, then the storage objects, and a failure in the second half is
    reported without un-saying the first.
25. **A draft revision outlives the transmittal it was raised on.** `delete_draft_transmittal`
    takes the lines and the header, never the drawings. That leaves an open draft with no
    transmittal — but not a stranded one: it is still the villa's one open draft for that set, so
    the next transmittal's board offers "Continue draft R2" and picks it straight back up. The
    alternative (cascading into the revisions) would destroy uploaded sheets to tidy up a header.
26. **Two exported actions were deleted rather than left dead.** `createDraftRevision` and
    `deleteDraftRevision` existed only for the villa-page editors the founder removed;
    `listTransmittalCandidates` likewise. Their behaviour survives inside `startDraftRevision` and
    `discardDraftRevision`, called from the actions that now own those flows. An exported server
    action nothing calls is a live write path with no screen watching it, and this codebase has
    already written down what speculative leftovers cost (DESIGN.md, on the four deleted
    components).

Six notes from the second flow redesign (Opus, 2026-08-22 evening) — the founder saw the first
redesign live and cut deeper: _"the flow is super cluttered right now … plot level everything, and
then you go in and in and go back one step where required."_ This build **removes more than it
adds**. No migration: `drawing_sets` stays exactly as `0091` shaped it, and what died is the idea
of it as a project-wide master.

27. **Villa-scoping is derived, not stored.** `listVillaDrawingSetStates` now reads the villa's
    revisions first and looks the sets up from them, so "this villa's drawing sets" is a fact about
    where revisions live rather than a filter over a global list — and a set born on villa A is
    absent from villa B's screens without a column, a flag or a migration. Two villas naming a
    "Working Drawings" make two rows, which is the intended shape and not a duplicate to clean up.
28. **Six screens became four, and three routes were deleted outright.** Gone:
    `/design-management/transmittals` (the global list), `/design-management/sets/**` (the master
    and its editor), the villa page's stage board, and the per-set history cards. A company-wide
    transmittal list answers a question nobody at Goodearth asks, and the stage board said what the
    transmittal list above it already said. Their queries and actions went with them
    (`listTransmittals`, `listDrawingSets`, `getDrawingSetDetail`; `createDrawingSet`,
    `updateDrawingSet`, `setDrawingSetActive`, `deleteDrawingSet`, `setDrawingSetWorks`) rather
    than being left exported with nothing calling them.
29. **One back link per screen, and no cross-links.** welcome ← villas ← villa ← transmittal, each
    going exactly one step up, as the founder asked. The transmittal's back link is now its villa's
    page; its footer link to the same villa was deleted as the duplicate it had become; and
    `deleteDraftTransmittal` reads the unit id **before** the row goes so it can land on the plot
    rather than on a list that no longer exists.
30. **The villa's set list is deliberately not a file browser.** It shows each set at its latest
    revision with a status and a file count, and stops there — "a list of all drawing sets released
    within a plot if that makes revision tracking viable", in the founder's words. Sheets are
    opened from the transmittal that carried them, which is the one place that also says who was
    told and when. This is the one thing the redesign takes away: released files used to be one
    click from the villa page and are now two.
31. **The stage filter is Radix `Tabs`, not `NavTabs` and not a search param.** A filter is
    same-page panel state — no navigation, no URL change — which is exactly the line DESIGN.md
    draws between the two primitives. One `TabsContent` per stage renders the same row component
    over a filtered list, so the ARIA is correct for free. Only stages that actually appear on this
    villa get a chip: a chip that can only ever show an empty list is the clutter being removed.
    With fewer than two stages present the chips do not render at all.
32. **A set born on a transmittal has no code and no default work links.** The code belonged to the
    catalogue that no longer exists, and the works are ticked on the revision itself, one level
    down, where they were always editable. `startDraftRevision` copies whatever defaults the set
    carries, which for a set one statement old is none — the intended zero, and its comment says
    so, because a future reader will otherwise read it as the seed-copy failure it looks like.

## Verification — the founder's browser checklist (staging)

**Rewritten again for the plot-level flow, 2026-08-22 evening.** Two things to know before you
open it: the earlier probe smoke left permanent rows (an issued transmittal cannot be deleted), so
the counts do not start at zero; and the smoke's drawing set belongs to the two villas it was used
on, so other villas will correctly show none.

1. Open **Design Management** → the welcome reads sensibly, with two doors: **Villas** and
   **Design stages**. Expect 2 villas with issued drawings and 2 transmittals issued — smoke
   residue, not a bug. There is no Drawing sets door any more, and no all-transmittals door.
2. **Villas** → every villa as a card, grouped by project, each saying how much has gone out and
   when. Open a Saarang villa.
3. The villa shows **its transmittals** (the smoke ones, if you picked Villa 9 or Villa 1) and, if
   it has any, its drawing sets underneath. Press **New transmittal**, choose stage "Working
   Drawings", save → the transmittal opens.
4. On the transmittal, under **Add drawings** → type a name into **New drawing set**, e.g.
   "Working Drawings — Ground Floor", press **Add set and start R0** → it appears as a draft line
   with the editor on it. Write a note, add a PDF, tick a work or two.
5. Press **Issue** → TR-0001 (or the next number for that villa) appears, the line reads Released,
   and the cover sheet downloads on the letterhead.
6. Press **back** at the top → you land on the villa, and the transmittal is in its list. The
   drawing set now appears under **Drawing sets on this plot** at R0 · Released.
7. Open **Supervisors** on a phone → same villa → the Drawings section lists the set at R0, the
   linked work's section shows the "Drawing · R0" chip, tapping opens the PDF.
8. New transmittal again → the same set now offers **Revise — starts R1**. Add a sheet, issue it →
   Supervisors shows R1; the villa's set list reads R1.
9. Open a **different** villa → your new set is not there, and its Add drawings board is empty
   with an invitation to name the first set. That is the plot-level scoping working.
10. On a filtered villa with transmittals at two or more stages, the **stage chips** appear above
    the list and narrow it.
11. Raise one more transmittal, add a set, then press the trash icon on its line → the drawing
    comes off and the draft survives (the next transmittal offers "Continue draft R…"). Press
    **Delete this draft** on the transmittal → you land back on the villa.
12. As the probe with `/supervisors` only: draft revisions are invisible; with no grant,
    `/design-management` refuses.
