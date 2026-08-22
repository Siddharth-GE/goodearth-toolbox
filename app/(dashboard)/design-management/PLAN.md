# Design Management — the rules

The drawings themselves. Read this before touching the tool.

Built 2026-08-22 against the repo-root `plan.md` (`0091`, one migration).
The design team issued drawings to site outside the toolbox until then:
nothing recorded which revision a supervisor was building from, and there
was no transmittal trail.

## The boundary with Relay

Relay replaced the planned Project Management and Design Management
tools, and its own PLAN.md is blunt about what it will not do —
_"nothing here stores a drawing, a decision or a document"_. It tracks
accountability only. Reviving this tool **partially reverses that settled
decision, and the line is what makes it safe to**:

> **Relay keeps who-has-the-baton. Design Management keeps the
> artefacts.** Project Management stays replaced.

A drawing approval is still a Relay activity, with a holder and a clock.
The drawing that was approved, its revision number, its sheets and the
transmittal that sent it to site are this tool's. Nothing here has a
holder, a baton or a due date, and nothing in Relay stores a file.
STATUS.md's settled-decisions line records the same boundary and the date.

**Nothing links the two.** Relay's `pusher_chain_links` gaining a
`'transmittal'` target kind was considered and deliberately left out
(`plan.md`, "not in scope") — the two tools are joined by the villa in
the reader's head, not by a foreign key.

## The four founder decisions, 2026-08-22

1. **Its own customisable design-stage list**, coexisting with Relay's
   project stages — the works-vs-construction-stages precedent from
   `0073`. Seeded Concept, Approvals, Working Drawings, Structural, MEP,
   Interiors; renameable, reorderable and retirable in the tool. A stage
   is what a transmittal is filed under, and it is not Relay's stage even
   where the words match.
2. **Revisions live per drawing set per villa** — R0, R1, … each with a
   note. The Selections model from `0006`, one level finer: a selection
   revision covers a whole unit, a drawing revision covers one set within
   one unit. Not one revision number per villa.
3. **A revision may hold several files.** One set is a stack of sheets,
   and (see the 4 MB rule below) it has to be.
4. **Sharing is in-app plus a letterhead PDF cover sheet**, forwarded by
   hand. There is no outbound email anywhere in this tool, and none was
   built.

## The lifecycle, which is the whole tool

`draft → released → superseded`, and the only legal transitions are those
two. `drawing_revisions_guard` refuses everything else.

- A **draft** is the design team's workspace: note editable, sheets added
  and removed, work links editable. **Site cannot see it at all** — the
  single widened SELECT qual admits `/supervisors` only to
  `status <> 'draft'`, so a draft is hidden by the database rather than
  by a filter someone could forget to write.
- **Releasing happens ONLY by issuing a transmittal.** There is no
  "Release" button anywhere, and adding one would be the mistake this
  design exists to prevent: a released drawing must always carry a paper
  trail saying who was told and when. `issue_transmittal()` is the one
  code path that writes `status = 'released'`.
- Releasing a revision **supersedes** the previously-released revision of
  the same (unit, set), stamping `superseded_by` at it — release first,
  then retire, so the villa is never momentarily left with no current
  drawing (`0007`'s ordering).
- A transmittal line may also carry an **already-released** revision.
  That is the normal case of one set going out again at a new stage —
  one set serves many activities — and nothing is released or superseded
  for those lines.
- **An issued transmittal is immutable and cannot be deleted.** It is the
  answer to "what did site have on the 22nd", and an answer that can be
  edited afterwards is not one. A draft transmittal deletes through
  `delete_draft_transmittal()`; a draft revision through
  `delete_draft_revision()`, which also refuses if the revision is
  already sitting on a transmittal.

**The number is minted on Issue, not on create.** `transmittals.number` is
null until issued, and `transmittals_issue_shape` ties `number`,
`issued_at` and `issued_by` to issued status **in both directions**. An
abandoned draft therefore cannot burn TR-0003 and leave a hole nobody can
explain, and a draft cannot squat on a number the counter will mint later.
The consequence, which is intended: a draft's cover sheet prints as a
draft with no reference on it.

**Numbers count per villa, from 1** (`0092`, founder on the staging vet:
"each house should have transmittals starting from 1"). The counter's
scope is the unit id and uniqueness is `(unit_id, number)` — so "TR-0001"
alone no longer names one transmittal company-wide; the villa beside it
completes the reference, and every screen and the cover sheet's footer
already carry it. Issued numbers are never rewritten — the two staging
smoke transmittals keep the global numbers they were born with.

**One draft per set per villa**, a partial unique index rather than a
check in every code path. "Start next revision" is `max(revision_no) + 1`
for that (unit, set); the new draft copies the master's default work links
so it starts where the set says and can then differ for this villa alone.

## The 4 MB rule, and why

**Each drawing file is capped at 4 MB.** Not a design preference — the
server-action body cap in `next.config.ts` is 4 MB and Vercel caps a
request body at roughly 4.5 MB. The `drawings` bucket carries
`file_size_limit = 4194304` too, so a file that gets past the form is
still refused by the database. A big set arrives as several sheet files,
which is exactly why founder decision 3 (several files per revision)
matters — without it this cap would be a wall.

**The escape hatch, if real drawings outgrow it**, is a signed upload URL
straight to storage, which bypasses the action body entirely. Noted, not
built (`plan.md`: "not now"). Do not raise the action body cap instead —
Vercel's limit sits behind it and the failure would move to production
only.

## Storage: coarse bucket, fine route

The bucket's SELECT policy is deliberately **coarser** than the table's:
`public.has_app('/design-management') or public.has_app('/supervisors')`,
with no draft test, because a storage policy cannot see whether a revision
is a draft without a cross-schema subquery.

**The narrow gate is the route.**
`app/(dashboard)/design-management/files/[fileId]/route.ts` looks the file
row up **by id through the RLS-scoped client**, so the widened qual on
`drawing_revisions` hides a draft sheet automatically and a supervisor
never learns the storage path in the first place. Both path segments are
UUIDs (`revisions/<revisionId>/<uuid>.<ext>`) and the revision id is
unreadable to them, so the coarse policy is not reachable in practice.
`0061`'s `(storage.foldername(name))[2]` trick would close it exactly if
that ever stops being true — the Fable review looked at it and left the
`design-views` precedent standing.

Two storage rules that are not style:

- **`public.has_app` is fully qualified in every storage policy.**
  Policies on `storage.objects` do not run with `public` on the search
  path, and an unqualified call fails at **upload time**, not at apply
  time — so the migration's own assertions pass and the first upload does
  not (`0010`, `0061`). Nothing asserts the qualification, because
  Postgres resolves the function to an OID at `create policy` time and
  `pg_policies` renders both forms identically; a check that cannot fail
  is worse than none. The upload smoke is the proof.
- **A `Blob`, never a raw `Buffer`** (BUGCATCHER #1), and the upload reads
  back what landed and compares its size before writing the row. Object
  first then row on the way in, row first then object on the way out.

## `lib/drawings/` is the read seam

Supervisors surfaces released drawings — a Drawings section on the villa
page and a "Drawing · R…" chip in each work's section header — and it
reaches them **only** through `lib/drawings/queries.ts`. One tool never
imports another tool's code; a shared module is the sanctioned answer
(the `lib/design-views/` precedent).

- Design Management owns **every write**. `lib/drawings/` reads, and only
  reads what has already been released.
- **No grant check inside it** — each caller gates itself first
  (`requireTool("/supervisors")`, `requireTool("/design-management")`),
  and the tables' RLS already admits either grant to non-draft rows.
- It imports only `createClient` and `fetchAll`, never
  `lib/design-management/` or `lib/supervisors/`.
- It hands back **file ids, never bytes**. The private bucket stays behind
  the route above.
- It **throws** on a failed read, or on a released revision missing its
  `released_at` stamp, rather than returning an empty list — an empty
  Drawings section that is actually a database error reads as "nothing
  released yet", which is the worst possible lie on a site phone.

Keep it narrowly about released drawings. The discipline is the same one
`lib/design-views/` keeps about photographs.

## The guard triggers are the boundary; the buttons are a courtesy

Relay's third rule, and it holds here for the same reason. Five triggers
carry the fine grain RLS cannot express:

| Trigger                             | What it refuses                                                                                                            |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `drawing_revisions_guard`           | identity changes ever; note/`released_at`/`released_by` once off draft; illegal transitions; deleting anything but a draft |
| `drawing_revision_works_draft_only` | work links moving after release                                                                                            |
| `drawing_revision_files_draft_only` | sheets added or removed after release                                                                                      |
| `transmittals_guard`                | any change at all to an issued transmittal, and its deletion                                                               |
| `transmittal_lines_draft_only`      | changing what was sent, afterwards                                                                                         |

The screens hide the buttons that would fail, and that is all they do.
When the two disagree the database wins, and the RAISE messages were
written to be read by a designer — `friendlyDbError` / the plpgsql-prefix
strip pass them through intact, the `lib/selections/actions.ts` pattern.
Every one of these sits on a **direct** write path, so the `0071` /
BUGCATCHER #11 trap (a `has_app` check inside a definer function reached
from a cross-tool trigger) does not apply here; all three functions are
`security invoker` and RLS still applies to them.

## Two tightenings from the Fable review of `0091`

Both are the kind of hole a green build never shows, so they are written
down rather than left in git:

1. **`released_at` / `released_by` are frozen once a revision is off
   draft.** They are set exactly once, on `draft → released`. The drafted
   guard would have let a direct REST update rewrite when a drawing went
   to site — the record of what site had on a date, edited after the
   fact.
2. **`transmittals_issue_shape` ties each issue field to the status BOTH
   ways.** The drafted one-directional CHECK
   (`(issued) = (number is not null and …)`) let a draft hold a number,
   because false = false passes — and a draft squatting on TR-0005 would
   collide with the counter the day it minted the same one.

## Things worth knowing

- **`transmittal_lines.unit_id` is denormalised on purpose.** The two
  composite FKs — `(transmittal_id, unit_id)` and
  `(drawing_revision_id, unit_id)` — then make a cross-villa line
  impossible in the database, not merely unlikely in the code (`0006`'s
  selection_lines trick).
- **No `on delete cascade`, anywhere.** `0019`'s lesson: a cascaded child
  delete fires the child's guard **after** the parent row is gone, so the
  guard reads the status as "missing" and raises. The two delete
  functions are the sanctioned paths.
- **No money, no view, no fact table.** `scripts/view-manifest.ts` does
  not move, and nothing here may ever grow a rate. A drawing is not
  priced in this tool and a cost has no business on a transmittal.
- **`/design-management` was already a legal slug** in both
  `user_apps_app_known` and `role_apps_app_known` (since `0030`, restated
  through `0084`), which is why `0091` carries no CHECK change. Granting
  works today; the design team simply has not been granted it yet.
- **Names merge through `Map`s, never embeds.** `units` has two FK paths
  to `plots` (`0029`) and `drawing_revisions` has several to `profiles`,
  so a bare embed is a PGRST201 at runtime that every local gate passes
  (BUGCATCHER #2).
- **The stage board derives, never stores.** Transmittals-per-stage and
  the last date on a villa's board are computed each render from the
  transmittals themselves; there is no per-villa stage row and adding one
  would be a second source of truth within a week.

## Open, and deliberately not built

- **Outbound email.** Sharing is in-app plus the PDF, by founder
  decision. If it ever arrives it is fire-and-forget and never blocks a
  write, the rule Relay already wrote down.
- **Signed upload URLs** for drawings above 4 MB — the escape hatch
  above, only when real drawings need it.
- **A Relay link** (`pusher_chain_links` with a `'transmittal'` kind).
  Out of scope on purpose; the boundary above is why.
- **Per-supervisor plot assignment** is Supervisors' open question, not
  this tool's — but it is what would decide who sees which villa's
  drawings, so the two answers must match when it is answered.
