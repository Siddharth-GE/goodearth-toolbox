# Design Management — make the transmittal flow simple

Architect: Fable. Branch `feature/design-management-flow` off `staging`. **Code only, no migration** — every rule the database enforces today stays exactly as it is; this changes the screens and the actions in front of it. On approval the build session copies this file to `plan.md` at the repo root and ticks steps off there.

## For the founder

- **Today it takes about twelve presses and three page loads to send one drawing to site**, and the screen you land on puts the thing you came to do at the bottom, under a form you just filled in and a red warning.
- **Starting a transmittal asks you a question first** (which design stage) in a pop-up, then sends you to a page that asks the same question again with a Save button. Now "New transmittal" is one press: it opens the workspace with the stage already filled in from the villa's last transmittal, and you change it there if it's wrong — it saves itself.
- **The workspace becomes three things in the order you work**: the stage and note, the drawings (each with its sheets), and Issue. Adding a drawing is one button that opens one small dialog, instead of three different forms stacked on the page. The long works checklist is folded away until you want it.
- **Removing a drawing becomes one button with a plain question**, instead of a trash icon and a grey text button side by side that do different things, both with no "are you sure". Nothing destructive happens without a confirmation naming what will go.
- **Issue tells you before you press it** whether the transmittal is ready ("Working Drawings R1 still needs a file"), instead of only failing in tiny text after.

Two decisions below are yours (see **Decisions for the founder**); the plan takes the recommended answer for each so the build can start.

## The walk — what a designer actually does today

**A. First drawings for a villa** (grant `/design-management`, laptop)

| #   | Press                                  | What they see                                                                                                                                                                                                                                                                                        | Friction                                                                                                                              |
| --- | -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Sidebar → Design Management            | Welcome: three paragraphs, three counts, two buttons                                                                                                                                                                                                                                                 | Long intro for a screen passed through every time                                                                                     |
| 2   | Villas                                 | Every villa as a card, grouped by project (43 on production)                                                                                                                                                                                                                                         | No way to jump to one; scroll                                                                                                         |
| 3   | A villa                                | Title, "New transmittal", empty state                                                                                                                                                                                                                                                                | fine                                                                                                                                  |
| 4   | New transmittal                        | **Pop-up**: pick a design stage (required), optional note, **Save**                                                                                                                                                                                                                                  | A question before any work; "Save" for something that creates an empty draft                                                          |
| 5   | Save                                   | New page: "Draft transmittal", Draft badge, **Cover sheet (PDF)**, **Issue**. Then _Details_ (stage + note again, **Save changes**), then _Drawings_ with red "No drawings yet — add one below", then _Add drawings_ with a message, a name box and "Add set and start R0", then "Delete this draft" | Three sections; the one thing to do is last; the PDF button on a draft downloads a watermarked stub; Issue is pressable and will fail |
| 6   | Type a set name → Add set and start R0 | Page re-renders; the line appears with a yellow editor: Note, Files (**Add file**), and the **entire works checklist expanded** with "Save work links"                                                                                                                                               | The checklist dominates the screen; the note placeholder says "required" though R0's note is optional                                 |
| 7   | Add file → pick → wait                 | File listed                                                                                                                                                                                                                                                                                          | fine                                                                                                                                  |
| 8   | Issue                                  | Redirect, green "Issued as TR-0001"                                                                                                                                                                                                                                                                  | fine                                                                                                                                  |

**B. A revision (R1)** — same as A to step 5, then scroll past _Details_ and the _Drawings_ section to _Add drawings_ → "Revise — starts R1" → editor appears above → type the note → Add file → Issue. If the note is forgotten, the refusal appears in `text-xs` beside the Issue button at the top while the empty note field sits far below.

**C. A mistake** — a set added by accident shows two controls: a grey text button "Remove and delete the draft" and a red trash icon whose hidden label is "Take off this transmittal". The trash (the thing that looks like delete) is the _less_ destructive one: it leaves an orphan draft revision that then appears on the villa page as "Draft R1" with no way to open it, and is only reachable by starting _another_ transmittal and pressing "Continue draft R1". Neither control confirms. "Delete this draft" at the bottom of the page and the per-file trash don't confirm either; deleting the draft transmittal also orphans its draft revisions.

**D. On a phone** — the header actions (badge, PDF, Issue, and Issue's error text) wrap into a stack; the works checklist is a 28 rem scroll region inside the page scroll; the three add-forms and the details form each have their own button.

**E. Looking something up** — the villa page's "Drawing sets on this plot" list says "Open the transmittal that carried it to see the sheets" but the rows aren't links, and a draft row can't be opened at all. An issued transmittal reads well and has the cover sheet.

## Findings

1. **A modal question before the workspace, then the same question again with a Save button.** The stage is `not null` in the database (`0091`), but it can be defaulted and changed in place.
2. **The draft page is ordered against the work.** Details → warning → drawings → three different add-forms (board, new-set input, resend picker) → delete.
3. **The works tree is open for every draft line.** The founder asked for the tick-all-in-a-category control (2026-08-22); nobody asked for it to be permanently expanded.
4. **Removal is two unlabelled controls with inverted affordance and no confirmation**, and it manufactures orphan drafts nobody can open. The current rule "a draft revision outlives its transmittal" (`PLAN.md`) is the cause.
5. **Issue is trial and error.** Every readiness rule (`0093`) is knowable from data already on the page, but the screen only reports the refusal after the press, in `xs` text in the header.
6. **The villa page's sets list is a dead end.**
7. **Copy**: "Save" to start, "required" on an optional R0 note, a cover-sheet download on a draft, a three-paragraph welcome.
8. **43 villa cards with no filter.**

## The target flow

Sidebar → welcome (two short paragraphs) → Villas (type to filter) → villa → **New transmittal** (one press) → workspace:

```
← Villa 12                                             [Issue]
Draft transmittal
Ready to issue · 2 drawings          (or: "Working Drawings R1 still needs a sheet")

┌ Stage [Working Drawings ▾]   Note [________________________] ┐   (saves itself)

┌ Drawings                                        [+ Add drawing] ┐
│ Working Drawings · R1 · Draft                          [Remove] │
│   Note: what changed …                                          │
│   Sheets: plan.pdf ×   section.pdf ×             [Add file]     │
│   ▸ Works this drawing serves (4)                               │
│ Structural · R0 · Released (sent again)                [Remove] │
│   plan.pdf                                                      │
└─────────────────────────────────────────────────────────────────┘
                                                   Delete this draft
```

**+ Add drawing** opens one dialog (bottom sheet on a phone): a "New drawing set" name field with Add, then this villa's sets, each with the one right offer — "Revise → R3" (and a small "send R2 again" when released), "On this transmittal", or "Draft R3 is open on another transmittal → open".

## Steps

Each step is one commit with a plain-English message. Owner tags per `MODELS.md`.

### 1. `[Sonnet]` New transmittal is one press — done (Opus)

- `lib/design-management/actions.ts` → `createTransmittal(unitId)` loses its form signature. It reads the villa's most recent transmittal's `design_stage_id` (any status, by `created_at desc`, `maybeSingle`, **check `error`**); if none, the first active stage by `sort_order`; if no active stage, return `{ error: "Add a design stage first." }`. Insert, revalidate layout, redirect to the workspace as today.
- Delete `villas/[unitId]/_components/create-transmittal-dialog.tsx`. Replace with `new-transmittal-button.tsx`: a client `Button` using `useTransition`, "New transmittal" / "Starting…", `FormMessage` for an error; disabled with "No design stages yet" when the page passes zero active stages (keep that guard).
- Villa page empty-state copy: "Press New transmittal to start one, add its drawings, and issue them."

### 2. `[Sonnet]` The details card saves itself — done (Opus)

- Split `updateDraftTransmittal` into `setDraftTransmittalStage(transmittalId, stageId)` and `setDraftTransmittalNote(transmittalId, note)` — same validation and `dbErrorMessage`, no `FormData`.
- `DraftDetailsForm` → `DraftDetails`: stage `Select` saves on `onChange`; note `Textarea` through `useSaveOnBlur` (`lib/hooks/use-save-on-blur.ts`), showing its `saved` flash as a small "Saved" `FormMessage success`. No Save button. Retired-stage handling (`stageOptions`) stays.
- Layout: `Section` with no title, or a `Card p-4` with the two fields in a `sm:grid-cols-[minmax(12rem,1fr)_2fr]` row — DESIGN.md sizes, nothing new.

### 3. `[Opus]` One Add-drawing dialog replaces three forms — done (Opus)

- New `transmittals/[transmittalId]/_components/add-drawing-dialog.tsx` (client) on `components/ui/dialog`. Trigger: `Button` "Add drawing" in the Drawings `Section`'s `aside`, and the same button as the `EmptyState`'s `action` when there are no lines. Content:
  - "New drawing set": `Input` + `Button` "Add" → `createSetOnTransmittal` (give it a non-form signature `(transmittalId, name)` to match).
  - "This villa's sets": one row per `VillaDrawingSetState`, name + `stateLine` + the offer:
    - on this transmittal → `Badge info` "On this transmittal";
    - `draft` with `draft.transmittalId` not this one → text "Draft R{n} is open on another transmittal" + `Link` "open";
    - `draft` with no transmittal (legacy orphan) → "Continue draft R{n}" → `createRevisionOnTransmittal`;
    - otherwise → "Revise → R{next}" → `createRevisionOnTransmittal`; plus, when `released`, a `ghost sm` "send R{released} again" → `addTransmittalLine(transmittalId, released.revisionId)`.
  - Closes on a successful action (the `wasPending` pattern from `components/masters/record-form-dialog.tsx`); errors stay inside the dialog (`FormMessage`).
- `lib/design-management/queries.ts` → `listVillaDrawingSetStates`: `draft` gains `transmittalId: string | null` — after the revisions read, one `fetchAll` of `transmittal_lines (drawing_revision_id, transmittal_id)` for the draft revision ids, then `transmittals (id, status)` for those; keep the one whose status is `draft` (a draft revision can sit on at most one draft transmittal after step 5; if data disagrees, take the first). Map merge, no embed (BUGCATCHER #2).
- Remove `AddDrawingsBoard`, `NewDrawingSetForm`, `ResendReleasedPicker` and the `resendOptions` computation from the page. `createRevisionOnTransmittal`'s "Continue draft" branch stays for the legacy case.

### 4. `[Sonnet]` The draft line editor gets out of the way — done (Opus)

- `_components/draft-revision-editor.tsx`: `WorksEditor` folds behind a `ghost sm` toggle "Works this drawing serves ({n})" (the `RevisionLog` chevron pattern), closed by default; open it automatically when `dirty`. Tree and Save unchanged.
- Note placeholder by revision: R0 "Optional — anything site should know about this first issue"; R≥1 "What changed in this revision — needed before it can go to site". The editor already has `revision.revisionNo`.
- Files: the empty state carries the Add file button and reads "Add the sheet — a PDF or a photo, up to 4 MB each". Section labels stay the Section Label style.
- Drop the `border-warning/30 bg-warning/5` tint; the line's `Badge warning` "Draft" already says it (DESIGN.md: status colours mean status, not decoration).

### 5. `[Opus]` One Remove, one question, no orphan drafts — done (Opus)

- New `_components/confirm-dialog.tsx` inside `design-management` (two uses in one tool; not yet `components/ui` — DESIGN.md's third-copy rule): `Dialog` with title, description, Cancel and a danger `Button` running a `useTransition` action, error shown inside.
- `RemoveLineButton` → one `ghost sm` "Remove". Draft line: confirm "Remove {set} R{n} from this transmittal? Its draft and {files} sheet(s) will be deleted." → `removeTransmittalLine(lineId, true)`. Released line: no confirm, `removeTransmittalLine(lineId, false)` (nothing is lost).
- `DeleteDraftTransmittalButton`: confirm "Delete this draft transmittal? {k} draft drawing(s) and their sheets go with it." → `deleteDraftTransmittal`, which now: reads the draft revision ids on its lines (`transmittal_lines` → `drawing_revisions.status = 'draft'`, **check `error`**), calls `delete_draft_transmittal`, then `discardDraftRevision` for each (rows, then files — the existing helper). A partial failure is reported in the sentence, as `removeTransmittalLine` already does. A draft revision that also sits on _another_ draft transmittal is refused by `delete_draft_revision` and stays; the message says so.
- `createSetOnTransmittal` / `createRevisionOnTransmittal`: when `appendTransmittalLine` fails right after `startDraftRevision`, discard the revision just started so no orphan is born.
- Per-file delete keeps no confirm (one sheet, re-uploadable) — say so in a comment.

### 6. `[Sonnet]` Ready-to-issue, and errors where the eye is

- New pure module `lib/design-management/readiness.ts` + `readiness.test.ts`: `transmittalReadiness(lines: { setName, revisionNo, revisionStatus, fileCount, note }[]) → { ready: boolean; problem: string | null }` mirroring `issue_transmittal`'s three refusals in the same order and words: no lines → "Add at least one drawing before issuing."; a line with no file → "\"{set}\" R{n} has no drawing file yet."; a draft R≥1 without a note → "\"{set}\" R{n} needs a note saying what changed.". Tests: empty, ready, each refusal, order.
- Page: under `PageTitle`, one line — `FormMessage success` "Ready to issue · {n} drawings" or a `text-warning text-sm` problem. Issue **stays pressable** (PLAN.md: the database's sentence is the boundary).
- `IssueTransmittalButton`: the button stays in the header actions; its error renders as a full-size `FormMessage` on its own row directly beneath the title block (a client `IssueControls` component owning both, or the message lifted via a small shared state — implementer's call, but not `size="xs"` in the header).
- Header while draft: `Badge` Draft + Issue only. **Cover sheet (PDF)** shows only once issued (the PDF route is unchanged and still answers for a draft if someone has the URL).
- Keep `?issued=` success message.

### 7. `[Sonnet]` The villa page's sets list goes somewhere

- `listVillaDrawingSetStates`: `released` gains `transmittalId: string | null` — the issued transmittal with the earliest `issued_at` among lines carrying that revision (the same `transmittal_lines` → `transmittals` reads as step 3, widened to released ids; read `status, issued_at`).
- Villa page rows become `Link`s to `/design-management/transmittals/{id}` (draft → its draft transmittal; released → the issuing one); a row with neither stays plain text. Note reads "Each set at its latest revision. Open one to see its sheets."

### 8. `[Haiku]` Copy

- Welcome intro to two paragraphs: "This is where a villa's drawings live: what has gone to site, what revision each set is on, and what is still being prepared." / "Open a villa, press New transmittal, add the drawings and issue them. Relay tracks who holds each task; this tool holds the drawings."
- Workspace `Section` note: "Each drawing here goes to site when you press Issue."
- `StatusBadge` wording unchanged.

### 9. `[Sonnet]` Villas: type to find one

- `villas/_components/villa-filter.tsx` (client): an `Input` "Find a villa…" filtering cards by villa, plot or project name; rendered only when there are more than 12 villas. Grouping by project stays. No URL state.

### 10. `[Fable]` Review and the docs

- Diff review against `SECURITY.md` (no new reads outside the tool; every new read checks `error`; `requireTool` first in every new action) and `BUGCATCHER.md` (#2 no embeds; open every page).
- `app/(dashboard)/design-management/PLAN.md`: replace "A draft revision outlives its transmittal" with "**A draft lives on exactly one draft transmittal.** Removing its line or deleting the transmittal deletes the draft and its sheets (`removeTransmittalLine(…, true)`, `deleteDraftTransmittal`); a failed line append discards the revision it just started. `Continue draft` survives only for a draft found on no transmittal." Update "The transmittal is the workspace": stage defaulted on creation, details autosave, Add drawing is a dialog, one Remove with confirmation, readiness line. Update the screen table's villa row (sets list links). Keep everything about the guards.
- `STATUS.md`: no contract change. `TODO.md`: nothing new.

## Files

| Change  | Path                                                                                                                                             |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| edit    | `lib/design-management/actions.ts` (createTransmittal, set stage/note, createSetOnTransmittal signature, deleteDraftTransmittal, orphan cleanup) |
| edit    | `lib/design-management/queries.ts` (`listVillaDrawingSetStates` transmittal ids)                                                                 |
| new     | `lib/design-management/readiness.ts`, `readiness.test.ts`                                                                                        |
| edit    | `app/(dashboard)/design-management/transmittals/[transmittalId]/page.tsx`                                                                        |
| rewrite | `…/transmittals/[transmittalId]/_components/transmittal-forms.tsx` (DraftDetails, Remove, Issue, Delete)                                         |
| new     | `…/transmittals/[transmittalId]/_components/add-drawing-dialog.tsx`                                                                              |
| new     | `app/(dashboard)/design-management/_components/confirm-dialog.tsx`                                                                               |
| edit    | `app/(dashboard)/design-management/_components/draft-revision-editor.tsx`                                                                        |
| delete  | `…/villas/[unitId]/_components/create-transmittal-dialog.tsx`                                                                                    |
| new     | `…/villas/[unitId]/_components/new-transmittal-button.tsx`                                                                                       |
| edit    | `…/villas/[unitId]/page.tsx`, `…/villas/page.tsx`, `…/page.tsx`                                                                                  |
| new     | `…/villas/_components/villa-filter.tsx`                                                                                                          |
| edit    | `app/(dashboard)/design-management/PLAN.md`                                                                                                      |

Untouched: every migration, `lib/drawings/`, the Supervisors screens, the PDF route and document, the files route, `lib/tools.ts`.

## Reuse

`components/ui/{dialog,button,badge,input,select,textarea,form-message,empty-state,section,card}`, `lib/hooks/use-save-on-blur.ts`, the close-on-success pattern in `components/masters/record-form-dialog.tsx`, `dbErrorMessage`, `fetchAll`, `readFailed`, `formatDate`. Existing actions `createRevisionOnTransmittal`, `addTransmittalLine`, `removeTransmittalLine`, `issueTransmittal`, the private helpers `startDraftRevision`, `appendTransmittalLine`, `discardDraftRevision`.

## Decisions for the founder

1. **A draft drawing that is taken off a transmittal, or whose transmittal is deleted, is deleted with its sheets** (after a confirmation that says so). Today it survives as a hidden draft you can only reach by starting another transmittal. Recommended: delete. The alternative is to keep today's rule and add a way to open the orphan.
2. **New transmittal guesses the stage** from the villa's last transmittal (else the first stage on the list) and lets you change it at the top of the workspace. Recommended. The alternative is to keep the pop-up question.

## Verification

- `npm test` (readiness), then `npm run lint`, `typecheck`, `build`, `check:actions`; `gh run list` green after the push.
- Model sessions cannot sign in on staging (memory: browser checks without credentials). The founder's checklist on `staging.goodearthkannur.org`, as the founder and once as the probe granted `/design-management`:
  1. Design Management → Villas → type part of a villa name → open it.
  2. **New transmittal**: one press lands you on the workspace with a stage already chosen. Change the stage; reload; it stuck. Type a note, click away; "Saved" flashes.
  3. The line under the title says "Add at least one drawing before issuing."
  4. **Add drawing** → name a set → Add. The dialog closes; the line appears; the readiness line now names the missing sheet. Works are folded; open them, tick a category, Save.
  5. Add file (a PDF and a phone photo). Readiness turns to "Ready to issue".
  6. Add drawing again: the set says "On this transmittal"; a set with a released revision offers "Revise → R{n}" and "send again".
  7. Remove a draft line: the question names the set and its sheet count; Cancel, then confirm; the villa page no longer lists a phantom draft.
  8. Press Issue on a not-ready draft: the database's sentence appears full-size under the title. Fix it, Issue: "Issued as TR-000n", Cover sheet (PDF) now appears.
  9. Villa page: the sets list rows open the right transmittal.
  10. Delete a draft transmittal with two draft drawings: the question says two go with it; afterwards none appear on the villa page.
  11. Dark mode: open the Add drawing dialog and the confirm.
  12. Phone: the Add drawing dialog rises as a bottom sheet; Issue and the readiness line are readable without wrapping into the badge.
  13. Supervisors → the same villa → Drawings shows the released set (the read seam is untouched; this proves it).
