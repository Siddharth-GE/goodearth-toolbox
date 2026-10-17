# Design Management — the rules

The drawings themselves: sets, revisions and the transmittals that send them to site. Grant `/design-management`. Migrations `0091`–`0093`, `0099` and `0124`.

## The boundary with Relay

> **Relay keeps who-has-the-baton. Design Management keeps the artefacts.** Project Management stays replaced.

A drawing approval is a Relay activity, with a holder and a clock. The drawing that was approved, its revision, its sheets and the transmittal that sent it are this tool's. Nothing here has a holder or a due date; nothing in Relay stores a file. **Nothing links the two** — a `'transmittal'` link kind in Relay was considered and left out on purpose.

## The founder's decisions

1. **Its own design-stage list** (Concept, Approvals, Working Drawings, Structural, MEP, Interiors), renameable and retirable — what a transmittal is filed under, not Relay's stages even where the words match.
2. **Revisions live per drawing set per villa** — R0, R1, … each with a note. The Selections model one level finer.
3. **A revision's drawings are a Zoho WorkDrive share link** (2026-10-17: "lets not get into file handling, new transmittal is created and they paste a link of our drive into it"), "anyone can view", so site needs no Zoho login. Before `0124` a revision held uploaded sheet files; those stay, and nothing new is uploaded.
4. **Sharing is in-app plus a letterhead PDF cover sheet**, forwarded by hand. No outbound email.
5. **One transmittal is one stage, one drawing set and its sheets** (2026-09-27): a set belongs to a stage, several named sets may share one, and each issue sends the set's full set of sheets — a whole WorkDrive folder.
6. **The cover sheet lists every sheet by name** (2026-10-17: "the transmittal sheet displays only the drawing set name"), after the set, its revision and the link. Sheet codes typed at upload (GFP) and the download name built from them (`SAA-Saarang-Villa12-WD-TB0003-GFP.pdf`) belong to the uploaded sheets only.
7. **Plot level, everything** (2026-08-22): villas as cards → a villa's transmittals → a transmittal, and every screen goes back exactly one step. No company-wide transmittals list and no project-wide set catalogue.
8. **The number is the toolbox's own series, TB** (2026-10-17: "just make a tool box id addition, since we had an already ongoing series from excel") — `TB-0003`, never mistaken for the Excel numbers. The `TR-` numbers issued before `0124` stay as they are.
9. **The revision number is the designer's while draft** (2026-10-17) — any number above every revision the set already has on that villa, so a set the team had at R2 in Excel starts here at R3.
10. **The toolbox counts and names the sheets itself** (2026-10-17: "is there a way that an uploaded link autocounts and extracts the name") — by reading the shared folder, below.

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
- **The workspace** is the note for site, the revision number, what changed (each saves on leaving the field), the WorkDrive link with the folder's sheets, and Issue. A readiness line under the title (`readiness.ts`) names what `issue_transmittal` would refuse, before the press; Issue stays pressable and the database's sentence replaces the line.
- **A draft lives on exactly one draft transmittal.** Deleting the draft transmittal deletes its draft revision, its kept list and any uploaded sheets too, after a confirmation that says so; the WorkDrive folder is never touched. A draft on no transmittal (from before) is picked up by "Continue".

## The lifecycle, which is the whole tool

`draft → released → superseded`, and `drawing_revisions_guard` refuses every other transition.

- **Site cannot see a draft at all** — the one widened SELECT qual admits `/supervisors` only to `status <> 'draft'`, so the database hides it.
- **Releasing happens only by issuing a transmittal** — there is no Release button, so every released drawing carries a record of who was told and when. `released_at`/`released_by` are set once and frozen, and so are the note and the link.
- **The release gate** (`0093`, widened by `0124`): a revision goes to site only with **a WorkDrive link or an uploaded sheet**, and from R1 only with a note saying what changed — in the guard and, named after the set, in `issue_transmittal`.
- Releasing **supersedes** the previous released revision of that (unit, set) — release first, then retire, so a villa never has no current drawing.
- **An issued transmittal is immutable and cannot be deleted** — it answers "what did site have on the 22nd". Drafts delete through `delete_draft_transmittal()` / `delete_draft_revision()`.
- **The number is minted on Issue**, `TB-` and counting **per villa** (`0092`, `0124`; unique on `(unit_id, number)` — the villa completes the reference, and the cover sheet's file name carries it: `Goodearth-Transmittal-Villa41-TB-0003.pdf`). Each villa's counter carries on from the `TR-` numbers before it. `transmittals_issue_shape` ties number, `issued_at` and `issued_by` to issued status in both directions, so a draft can neither burn nor squat on a number.
- **One draft per set per villa** (a partial unique index). A new draft is `max(revision_no) + 1` across every status; the designer may then move it **up** while it is a draft, never to or below a number the set already used (`0124`), so a number is never re-used. `startDraftRevision` is the only code that starts a revision.

## The guard triggers are the boundary

| Trigger                                     | Refuses                                                                                                                                                              |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `drawing_revisions_guard`                   | villa or set changes; the number moving once released, or to or below one used; note, link and release stamps once off draft; illegal transitions; non-draft deletes |
| `drawing_revision_works_draft_only`         | work links moving after release                                                                                                                                      |
| `drawing_revision_files_draft_only`         | sheets added or removed after release                                                                                                                                |
| `drawing_revision_folder_sheets_draft_only` | the kept folder list changing after release (`0124`)                                                                                                                 |
| `transmittals_guard`                        | any change to an issued transmittal, and its deletion                                                                                                                |
| `transmittal_lines_draft_only`              | changing what was sent                                                                                                                                               |
| `transmittal_lines_stage_match`             | a set on a transmittal of another stage, or a set with no stage (`0099`)                                                                                             |
| `transmittals_stage_locked`                 | moving a draft's stage once it carries a set (`0099`)                                                                                                                |
| `drawing_sets_stage_locked`                 | moving a set's stage once given (`0099`)                                                                                                                             |

Screens hide the buttons that would fail; the database decides. The RAISE messages are written for a designer and pass through verbatim. All the functions are `security invoker` on direct paths, so RLS still applies.

## The WorkDrive folder

- **The link** is `drawing_revisions.drawings_url`: only `https://workdrive.zohoexternal.com/external/<id>`, stored as **rebuilt from its id** by `parseWorkDriveLink` (`workdrive-link.ts`), never as typed; a CHECK holds the shape. A folder's own WorkDrive address is refused with why — site could not open it without a Zoho login.
- **Reading it** (`workdrive.ts`): Goodearth has no Zoho API access, so the server does what the link's public page does — fetches the page, which names the folder (`resourceId`, `resourceType` `1001`) and hands any visitor that link's viewing cookies, then lists `api/v1/files/<folder>/files` with them, 50 at a time. Names, sizes and last-changed times; never a file. Five seconds a call; never throws; logs the failing step, never a cookie or Zoho's body. A link to a single file reads as that one sheet; sub-folders are skipped and named.
- **This is Zoho's page, not a promise.** If Zoho changes it, the read fails in a sentence and everything else carries on: the link is still saved, opens, and issues.
- **The kept list** is `drawing_revision_folder_sheets`: read when the link is used, again on **Read again**, and once more on Issue, each read replacing the last (delete, then insert — no UPDATE policy); a failed read keeps the last good list. Once released the draft-only trigger fixes it, so the record says what the folder held when it went to site, whatever later happens in the folder. Cover sheet, transmittal page and Supervisors all show it.
- **The team's rule, which the toolbox cannot enforce:** one WorkDrive folder per revision, never touched once issued — the next revision is a new folder.

## Uploaded sheets and storage (before `0124`)

- Nothing uploads any more. The sheets already uploaded stay in the `drawings` bucket and open through `files/[fileId]/route.ts`; one on a draft can still be taken off (`deleteDrawingRevisionFile`, row then object).
- **The bucket's SELECT is coarser than the table's** (`/design-management` or `/supervisors`, no draft test — a storage policy cannot see status). **The route is the narrow gate**: it looks the file up by id through the RLS client, so a draft sheet is invisible and its path unknowable (both path segments are UUIDs).
- **`public.has_app` is fully qualified in every storage policy** — unqualified fails at use time, not apply time.
- **The file name is built at download, never stored** (`lib/drawings/sheet-name.ts` + `sheet-context.ts`), from the sheet code; a draft sheet says DRAFT where the number will go.
- **Wiping every drawing** is `scripts/wipe-drawings.ts --project <ref> [--commit]`, for a person to run: it gets past the guards with `session_replication_role = replica` in one transaction.

## `lib/drawings/` is the read seam

Supervisors shows released drawings (a Drawings section on the villa page — **Open drawings** to the WorkDrive folder and its sheets by name, or the uploaded sheets — and a "Drawing · R2" chip per work) only through `lib/drawings/queries.ts` and `folder-sheets.ts`. Design Management owns every write. The module has **no grant check** — each caller gates itself and RLS admits either grant to non-draft rows; it imports only `createClient`, `fetchAll` and its siblings in `lib/drawings/`; it never returns bytes; and it **throws** on a failed read rather than returning an empty list, because "nothing released yet" on a site phone is the worst lie it could tell.

## Things worth knowing

- **`transmittal_lines.unit_id` is denormalised on purpose**: two composite FKs make a cross-villa line impossible in the database.
- **No `on delete cascade` anywhere** — a cascaded delete fires the child's guard after the parent is gone. The two delete functions are the paths, and `delete_draft_revision` clears the kept list too (`0124`).
- **No money, no view.** A drawing is never priced here.
- **Names merge through `Map`s, never embeds** (BUGCATCHER #2).
- Per-stage counts are derived each render, never stored.

## Deliberately not built

Outbound email (fire-and-forget if ever); uploads of any kind; a line on an issued transmittal when its folder no longer matches the kept list (easy now — the ids are kept); a Relay link. **Per-supervisor plot assignment** is Supervisors' open question, but its answer decides who sees which villa's drawings — the two must match.
