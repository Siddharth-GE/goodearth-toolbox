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

### 6. ⬜ `[Sonnet]` Supervisors surfacing

Via `lib/drawings/` only.

### 7. ⬜ `[Opus]` Docs, probe smoke, staging push

Docs (STATUS/PLAN/CLAUDE/TODO), probe smoke as a single-grant account (grant the probe `/supervisors`, confirm it sees released drawings and **not** drafts; then `/design-management` alone for the write side — the browser-smoke sign-in technique), full CI green via `gh run list`, merge to `staging` and push.

### 8. ⬜ `[Fable]` Merge approval, founder vet, production

Merge-approval pass against this plan, `SECURITY.md`, `BUGCATCHER.md`. **Founder vets on staging.goodearthkannur.org — nothing reaches production before that**; then `0091` to production, `staging` → `master`, and press one real write button on production.

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

10. **A transmittal cannot be created empty** — the plan allowed either branch, and this is the
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

## Verification — the founder's browser checklist (staging)

1. Open **Design Management** → the welcome reads sensibly, counts are zeroes.
2. **Sets**: create "Working Drawings — Ground Floor", tick a few works it serves.
3. **Villas**: pick a Saarang villa → upload a PDF as R0 with a note → the set shows R0 · draft.
4. Create a **transmittal** for stage "Working Drawings", include the set, press **Issue** → number TR-0001 appears, revision reads Released, the PDF cover sheet downloads on the letterhead.
5. Open **Supervisors** on a phone → same villa → the Drawings section lists the set at R0, the linked work's section shows the "Drawing · R0" chip, tapping opens the PDF.
6. Upload R1 with a note, issue a second transmittal → Supervisors now shows R1; R0 reads superseded in Design Management's history.
7. As the probe with `/supervisors` only: draft revisions are invisible; with no grant, `/design-management` refuses.
