# Design Management — the rules

The drawings themselves: sets, revisions and the transmittals that send them to site. Grant `/design-management`. Migrations `0091`–`0093`.

## The boundary with Relay

> **Relay keeps who-has-the-baton. Design Management keeps the artefacts.** Project Management stays replaced.

A drawing approval is a Relay activity, with a holder and a clock. The drawing that was approved, its revision, its sheets and the transmittal that sent it are this tool's. Nothing here has a holder or a due date; nothing in Relay stores a file. **Nothing links the two** — a `'transmittal'` link kind in Relay was considered and left out on purpose.

## The founder's decisions

1. **Its own design-stage list** (Concept, Approvals, Working Drawings, Structural, MEP, Interiors), renameable and retirable — what a transmittal is filed under, not Relay's stages even where the words match.
2. **Revisions live per drawing set per villa** — R0, R1, … each with a note. The Selections model one level finer.
3. **A revision holds several sheet files.**
4. **Sharing is in-app plus a letterhead PDF cover sheet**, forwarded by hand. No outbound email.
5. **Plot level, everything** (2026-08-22): villas as cards → a villa's transmittals → a transmittal, and every screen goes back exactly one step. No company-wide transmittals list and no project-wide set catalogue — both were deleted, not hidden.

| Screen                           | What it is                                                                      | Back to     |
| -------------------------------- | ------------------------------------------------------------------------------- | ----------- |
| `/design-management`             | welcome: plot-level counts, doors to Villas and Design stages                   | the sidebar |
| `…/villas`                       | a card per villa: issued, drafts, last issued                                   | welcome     |
| `…/villas/[unitId]`              | its transmittals with stage chips, New transmittal, its sets at latest revision | Villas      |
| `…/transmittals/[transmittalId]` | the workspace while draft; the record once issued                               | its villa   |

## Drawing sets are born on a plot

`drawing_sets` is one global table; the scoping is UX, not schema. A set is created **inside a draft transmittal** (`createSetOnTransmittal`: the set, its R0 draft on that villa and the line, in one press), and surfaces **only where its revisions live** — "this villa's sets" is derived from the villa's revisions, never filtered. Such a set has no code and no default work links; works are ticked on the revision. Two villas each naming "Working Drawings" make two rows — intended.

## The transmittal is the workspace

- **Creating a transmittal creates an empty draft.** "At least one drawing" is enforced at Issue by `issue_transmittal`, whose refusal is shown verbatim — so Issue stays pressable on an empty draft.
- **Add drawings** is one action (`createRevisionOnTransmittal`) that re-reads the villa's state itself: "Continue draft R2" if a draft is open, else "Revise — starts R3". A set already on the transmittal is offered neither. Re-sending a released drawing unchanged is a separate picker (`addTransmittalLine`) — nothing created, nothing superseded.
- **Taking a draft line off is two presses**: off this transmittal, or off and delete the draft. `delete_draft_revision` refuses while the revision sits on a line, so the line goes first.
- **A draft revision outlives its transmittal.** Deleting a draft transmittal never deletes drawings; the draft stays the villa's open draft and the next transmittal continues it.

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

Screens hide the buttons that would fail; the database decides. The RAISE messages are written for a designer and pass through verbatim. All the functions are `security invoker` on direct paths, so RLS still applies.

## Files and storage

- **4 MB a file** — the server-action body cap, with Vercel's ~4.5 MB request limit behind it; the `drawings` bucket enforces it too. Never raise the action cap. The escape hatch, if real drawings outgrow it, is a signed upload URL straight to Storage (not built).
- **The bucket's SELECT is coarser than the table's** (`/design-management` or `/supervisors`, no draft test — a storage policy cannot see status). **The route is the narrow gate**: `files/[fileId]/route.ts` looks the file up by id through the RLS client, so a draft sheet is invisible and its path unknowable (both path segments are UUIDs).
- **`public.has_app` is fully qualified in every storage policy** — unqualified fails at upload time, not apply time, and nothing can assert it. The upload smoke is the proof.
- A `Blob`, never a `Buffer` (BUGCATCHER #1); the upload reads back and compares its size. Object then row on the way in, row then object on the way out.

## `lib/drawings/` is the read seam

Supervisors shows released drawings (a Drawings section on the villa page, a "Drawing · R2" chip per work) only through `lib/drawings/queries.ts`. Design Management owns every write. The module has **no grant check** — each caller gates itself and RLS admits either grant to non-draft rows; it imports only `createClient` and `fetchAll`; it returns file ids, never bytes; and it **throws** on a failed read rather than returning an empty list, because "nothing released yet" on a site phone is the worst lie it could tell.

## Things worth knowing

- **`transmittal_lines.unit_id` is denormalised on purpose**: two composite FKs make a cross-villa line impossible in the database.
- **No `on delete cascade` anywhere** — a cascaded delete fires the child's guard after the parent is gone. The two delete functions are the paths.
- **No money, no view.** A drawing is never priced here.
- **Names merge through `Map`s, never embeds** (BUGCATCHER #2).
- Per-stage counts are derived each render, never stored.

## Deliberately not built

Outbound email (fire-and-forget if ever); signed uploads above 4 MB; a Relay link. **Per-supervisor plot assignment** is Supervisors' open question, but its answer decides who sees which villa's drawings — the two must match.
