# Design Management — the rules

The drawings themselves: sets, revisions and the transmittals that send them to site. Grant `/design-management`. Migrations `0091`–`0093` and `0099`.

## The boundary with Relay

> **Relay keeps who-has-the-baton. Design Management keeps the artefacts.** Project Management stays replaced.

A drawing approval is a Relay activity, with a holder and a clock. The drawing that was approved, its revision, its sheets and the transmittal that sent it are this tool's. Nothing here has a holder or a due date; nothing in Relay stores a file. **Nothing links the two** — a `'transmittal'` link kind in Relay was considered and left out on purpose.

## The founder's decisions

1. **Its own design-stage list** (Concept, Approvals, Working Drawings, Structural, MEP, Interiors), renameable and retirable — what a transmittal is filed under, not Relay's stages even where the words match.
2. **Revisions live per drawing set per villa** — R0, R1, … each with a note. The Selections model one level finer.
3. **A revision holds several sheet files.**
4. **Sharing is in-app plus a letterhead PDF cover sheet**, forwarded by hand. No outbound email.
5. **One transmittal is one stage, one drawing set and its sheets** (2026-09-27): a set belongs to a stage, several named sets may share one, and each issue sends the set's full set of sheets.
6. **Every sheet has a sheet code** typed at upload (GFP), and downloads as `SAA-Saarang-Villa12-WD-TR0003-GFP.pdf` — project code, project, villa, stage code, transmittal number, sheet code (2026-09-27).
7. **Plot level, everything** (2026-08-22): villas as cards → a villa's transmittals → a transmittal, and every screen goes back exactly one step. No company-wide transmittals list and no project-wide set catalogue — both were deleted, not hidden.

| Screen                           | What it is                                                            | Back to     |
| -------------------------------- | --------------------------------------------------------------------- | ----------- |
| `/design-management`             | welcome: plot-level counts, doors to Villas and Design stages         | the sidebar |
| `…/villas`                       | a card per villa: issued, drafts, last issued                         | welcome     |
| `…/villas/[unitId]`              | its transmittals with stage chips, New transmittal, its sets by stage | Villas      |
| `…/transmittals/[transmittalId]` | the workspace while draft; the record once issued                     | its villa   |

## Drawing sets are born on a plot

`drawing_sets` is one global table; the villa scoping is UX, not schema. A set is created **when a transmittal starts** (`startTransmittal` with a new name), carries its **stage** (`design_stage_id`, fixed once given — `drawing_sets_stage_locked`), and surfaces **only where its revisions live** — "this villa's sets" is derived from the villa's revisions, never filtered. It has no code and no default work links; works are ticked on the revision. Two villas each naming "Ground floor plans" make two rows — intended. Sets from before `0099` have no stage and can never be sent again.

## The transmittal is the workspace

- **Starting a transmittal is one action** (`startTransmittal`): the stage, then a set of that stage on this villa ("Revise to R3", or "Continue R2" for a draft on no transmittal) or a new name. It makes the revision, the header and the one line, and takes back what it made if a later step fails. The stage and the set never change afterwards — `transmittals_stage_locked` and `transmittal_lines_stage_match` hold that.
- **One line per transmittal** (`transmittal_lines_one_per_transmittal`), and **the set is of the transmittal's stage** (`transmittal_lines_stage_match`). Re-sending a released revision unchanged is gone: every issue is a new revision with its full set of sheets.
- **The workspace** is the note for site (saves on leaving the field), what changed, the sheets and Issue. A readiness line under the title (`readiness.ts`) names what `issue_transmittal` would refuse, before the press; Issue stays pressable and the database's sentence replaces the line.
- **A draft lives on exactly one draft transmittal.** Deleting the draft transmittal deletes its draft revision and sheets too, after a confirmation that says so. A draft on no transmittal (from before) is picked up by "Continue".

## The lifecycle, which is the whole tool

`draft → released → superseded`, and `drawing_revisions_guard` refuses every other transition.

- **Site cannot see a draft at all** — the one widened SELECT qual admits `/supervisors` only to `status <> 'draft'`, so the database hides it.
- **Releasing happens only by issuing a transmittal** — there is no Release button, so every released drawing carries a record of who was told and when. `released_at`/`released_by` are set once and frozen.
- Releasing **supersedes** the previous released revision of that (unit, set) — release first, then retire, so a villa never has no current drawing.
- **An issued transmittal is immutable and cannot be deleted** — it answers "what did site have on the 22nd". Drafts delete through `delete_draft_transmittal()` / `delete_draft_revision()`.
- **The number is minted on Issue**, counting **per villa from 1** (`0092`; unique on `(unit_id, number)` — the villa completes the reference). `transmittals_issue_shape` ties number, `issued_at` and `issued_by` to issued status in both directions, so a draft can neither burn nor squat on a number.
- **One draft per set per villa** (a partial unique index). A new draft is `max(revision_no) + 1` across every status, so a number is never re-used. `startDraftRevision` is the only code that starts a revision.

## The guard triggers are the boundary

| Trigger                             | Refuses                                                                                          |
| ----------------------------------- | ------------------------------------------------------------------------------------------------ |
| `drawing_revisions_guard`           | identity changes; note and release stamps once off draft; illegal transitions; non-draft deletes |
| `drawing_revision_works_draft_only` | work links moving after release                                                                  |
| `drawing_revision_files_draft_only` | sheets added or removed after release                                                            |
| `transmittals_guard`                | any change to an issued transmittal, and its deletion                                            |
| `transmittal_lines_draft_only`      | changing what was sent                                                                           |
| `transmittal_lines_stage_match`     | a set on a transmittal of another stage, or a set with no stage (`0099`)                         |
| `transmittals_stage_locked`         | moving a draft's stage once it carries a set (`0099`)                                            |
| `drawing_sets_stage_locked`         | moving a set's stage once given (`0099`)                                                         |

Screens hide the buttons that would fail; the database decides. The RAISE messages are written for a designer and pass through verbatim. All the functions are `security invoker` on direct paths, so RLS still applies.

## Files and storage

- **4 MB a file** — the server-action body cap, with Vercel's ~4.5 MB request limit behind it; the `drawings` bucket enforces it too. Never raise the action cap. The escape hatch, if real drawings outgrow it, is a signed upload URL straight to Storage (not built).
- **The bucket's SELECT is coarser than the table's** (`/design-management` or `/supervisors`, no draft test — a storage policy cannot see status). **The route is the narrow gate**: `files/[fileId]/route.ts` looks the file up by id through the RLS client, so a draft sheet is invisible and its path unknowable (both path segments are UUIDs).
- **`public.has_app` is fully qualified in every storage policy** — unqualified fails at upload time, not apply time, and nothing can assert it. The upload smoke is the proof.
- A `Blob`, never a `Buffer` (BUGCATCHER #1); the upload reads back and compares its size. Object then row on the way in, row then object on the way out.
- **Every upload needs a sheet code**, unique within the revision (`0099`), checked before the file is stored.
- **The file name is built at download, never stored** (`lib/drawings/sheet-name.ts` + `sheet-context.ts`): the transmittal number exists only once issued, so a draft sheet says DRAFT. The route, the transmittal page and Supervisors all name a sheet through the same path; the route falls back to the uploaded name if that lookup fails. A stage code changed on Design stages renames that stage's sheets on their next download.
- **Wiping every drawing** is `scripts/wipe-drawings.ts --project <ref> [--commit]`, for a person to run: it gets past the guards with `session_replication_role = replica` in one transaction.

## `lib/drawings/` is the read seam

Supervisors shows released drawings (a Drawings section on the villa page, a "Drawing · R2" chip per work) only through `lib/drawings/queries.ts`. Design Management owns every write. The module has **no grant check** — each caller gates itself and RLS admits either grant to non-draft rows; it imports only `createClient`, `fetchAll` and its siblings in `lib/drawings/`; it returns file ids and their sheet names, never bytes; and it **throws** on a failed read rather than returning an empty list, because "nothing released yet" on a site phone is the worst lie it could tell.

## Things worth knowing

- **`transmittal_lines.unit_id` is denormalised on purpose**: two composite FKs make a cross-villa line impossible in the database.
- **No `on delete cascade` anywhere** — a cascaded delete fires the child's guard after the parent is gone. The two delete functions are the paths.
- **No money, no view.** A drawing is never priced here.
- **Names merge through `Map`s, never embeds** (BUGCATCHER #2).
- Per-stage counts are derived each render, never stored.

## Deliberately not built

Outbound email (fire-and-forget if ever); signed uploads above 4 MB; a Relay link. **Per-supervisor plot assignment** is Supervisors' open question, but its answer decides who sees which villa's drawings — the two must match.
