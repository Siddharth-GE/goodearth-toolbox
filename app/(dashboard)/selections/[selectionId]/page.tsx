import { PageTitle } from "@/components/ui/page-title";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Button, LinkButton } from "@/components/ui/button";
import {
  diffRevisions,
  getPreviousIssued,
  getSelection,
  listActiveSpaceTypes,
  listSelectionLines,
  listUnitSpaces,
  type SelectionRow,
} from "@/lib/selections/queries";
import { FileDown, GitCompare, LayoutGrid, Sheet } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { AddSpaceDialog } from "../_components/add-space-dialog";
import { CataloguePicker } from "../_components/catalogue-picker";
import { IssueDialog } from "../_components/issue-dialog";
import { LineGrid } from "../_components/line-grid";
import { NextRevisionButton } from "../_components/next-revision-button";
import { SpaceViews } from "../_components/space-views";
import { listSpaceViews } from "@/lib/design-views/queries";
import { listItemCategories } from "@/lib/masters/item-categories";
import { listBrands } from "@/lib/masters/brands";
import { formatDate } from "@/lib/format";

export default async function SelectionEditorPage({
  params,
  searchParams,
}: {
  params: Promise<{ selectionId: string }>;
  searchParams: Promise<{ space?: string }>;
}) {
  const { selectionId } = await params;
  const { space } = await searchParams;

  const selection = await getSelection(selectionId);
  if (!selection) notFound();

  const [spaces, lines, spaceTypes, categories, brands, previous] = await Promise.all([
    listUnitSpaces(selection.unit_id, selectionId),
    listSelectionLines(selectionId),
    listActiveSpaceTypes(),
    listItemCategories(),
    listBrands(),
    getPreviousIssued(selection.unit_id, selection.revision_no),
  ]);

  // Views belong to the space, not the revision (a render of Bedroom 1
  // is still a render of Bedroom 1 in R3). The revision diff is NOT
  // awaited here: every space click is a full server navigation, and
  // the diff re-read the whole previous revision each time just to feed
  // the Issue dialog's summary and one paragraph — both stream in
  // behind their own <Suspense> below so the grid paints first.
  const viewsBySpace = await listSpaceViews(spaces.map((space) => space.id));

  // Land on the requested space, else the first one. A stale ?space from a
  // bookmark (or a space just deleted) falls back rather than 404s.
  const activeSpace = spaces.find((s) => s.id === space) ?? spaces[0] ?? null;
  const activeLines = activeSpace
    ? lines.filter((line) => line.unit_space_id === activeSpace.id)
    : [];
  const isDraft = selection.status === "draft";

  return (
    <div className="space-y-4">
      <PageTitle
        title={`${selection.unit_name} · R${selection.revision_no}`}
        backHref="/selections/units"
        backLabel="All units"
        description={
          <>
            {selection.project_name} · {lines.length} {lines.length === 1 ? "item" : "items"} across{" "}
            {spaces.length} {spaces.length === 1 ? "space" : "spaces"}
          </>
        }
        actions={
          <>
            {isDraft ? (
              <Badge variant="warning">Draft</Badge>
            ) : selection.status === "superseded" ? (
              <Badge variant="neutral">Superseded</Badge>
            ) : (
              <Badge variant="success">Issued</Badge>
            )}
            {previous && (
              // Available on a draft too, so a designer can review exactly
              // what they're about to hand over before pressing Issue.
              <LinkButton href={`/selections/${selectionId}/diff`} variant="secondary">
                <GitCompare className="size-4" />
                Changes
              </LinkButton>
            )}
            {lines.length > 0 && (
              // plain: a next/link would prefetch on hover and generate the
              // entire PDF server-side just because the cursor passed over
              // the button. A plain anchor also gives native "save as".
              <LinkButton href={`/selections/${selectionId}/pdf`} variant="secondary" plain>
                <FileDown className="size-4" />
                PDF
              </LinkButton>
            )}
            {lines.length > 0 && (
              <LinkButton href={`/selections/${selectionId}/csv`} variant="secondary" plain>
                <Sheet className="size-4" />
                Excel
              </LinkButton>
            )}
            {isDraft && (
              <>
                <AddSpaceDialog
                  unitId={selection.unit_id}
                  spaceTypes={spaceTypes}
                  // Passed so suggested names continue past what's already
                  // there — a second Bath becomes "Bath 2", not a clash.
                  existing={spaces.map((s) => ({ label: s.label, space_type_id: s.space_type_id }))}
                />
                {lines.length > 0 && (
                  <Suspense fallback={null}>
                    <IssueDialogWithDiff
                      selectionId={selectionId}
                      unitId={selection.unit_id}
                      revisionNo={selection.revision_no}
                      lineCount={lines.length}
                      spaceCount={spaces.filter((s) => s.line_count > 0).length}
                      previous={previous}
                    />
                  </Suspense>
                )}
              </>
            )}
            {selection.status === "issued" && <NextRevisionButton fromSelectionId={selectionId} />}
          </>
        }
      />

      {!isDraft && (
        <div className="border-border bg-surface rounded-xl border px-4 py-3">
          <p className="text-foreground text-sm">
            {selection.status === "issued"
              ? "Issued to budgeting — this revision can no longer be changed."
              : `Superseded by a later revision. Kept as the record of what R${selection.revision_no} said.`}
            {selection.issued_at && (
              <span className="text-muted"> {formatDate(selection.issued_at)}</span>
            )}
          </p>
          {selection.notes && <p className="text-muted mt-1 text-sm">“{selection.notes}”</p>}
          {/* Says plainly what the budget team was handed, so a designer
              can answer "what did they get?" without leaving the screen. */}
          <Suspense
            fallback={
              <p className="text-muted mt-2 text-xs">
                Budgeting received {lines.length} {lines.length === 1 ? "line" : "lines"}.
              </p>
            }
          >
            <HandoffSummary
              selectionId={selectionId}
              unitId={selection.unit_id}
              lineCount={lines.length}
              previous={previous}
            />
          </Suspense>
        </div>
      )}

      {spaces.length === 0 ? (
        <EmptyState
          icon={LayoutGrid}
          title="No spaces yet"
          description="Set up the rooms and areas of this unit — pick how many of each and they're named for you — then start specifying items into them."
          action={
            isDraft ? (
              <AddSpaceDialog
                unitId={selection.unit_id}
                spaceTypes={spaceTypes}
                existing={[]}
                trigger={<Button>Set up spaces</Button>}
              />
            ) : undefined
          }
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-[220px_1fr]">
          {/* Space rail. Plain links rather than client state so the chosen
              space survives a refresh and can be linked to directly. */}
          <nav className="space-y-1">
            {spaces.map((s) => {
              const active = s.id === activeSpace?.id;
              return (
                <Link
                  key={s.id}
                  href={`/selections/${selectionId}?space=${s.id}`}
                  className={[
                    "flex items-center justify-between gap-2 rounded-xl px-3 py-2.5 text-sm transition-colors",
                    active
                      ? "bg-accent text-accent-foreground font-medium"
                      : "text-foreground hover:bg-black/[0.04] dark:hover:bg-white/[0.06]",
                  ].join(" ")}
                >
                  <span className="min-w-0 truncate">{s.label}</span>
                  <span
                    className={active ? "text-accent-foreground/70 text-xs" : "text-muted text-xs"}
                  >
                    {s.line_count}
                  </span>
                </Link>
              );
            })}
          </nav>

          <div className="min-w-0 space-y-3">
            {activeSpace && (
              <>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h2 className="text-foreground text-sm font-semibold">{activeSpace.label}</h2>
                    <p className="text-muted text-xs">{activeSpace.space_type_name}</p>
                  </div>
                  {isDraft && (
                    <CataloguePicker
                      selectionId={selectionId}
                      unitId={selection.unit_id}
                      // Every space, so one trip through the catalogue can
                      // fill four identical bathrooms at once.
                      spaces={spaces.map((s) => ({ id: s.id, label: s.label }))}
                      currentSpaceId={activeSpace.id}
                      categories={categories.map((c) => ({ id: c.id, name: c.name }))}
                      brands={brands.map((b) => ({ id: b.id, name: b.name }))}
                    />
                  )}
                </div>

                <SpaceViews
                  spaceId={activeSpace.id}
                  selectionId={selectionId}
                  views={viewsBySpace.get(activeSpace.id) ?? []}
                  editable={isDraft}
                />

                <LineGrid
                  selectionId={selectionId}
                  lines={activeLines}
                  editable={isDraft}
                  emptyAction={
                    isDraft ? undefined : (
                      <LinkButton href="/selections/units" variant="secondary">
                        Back to units
                      </LinkButton>
                    )
                  }
                />
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// The two diff consumers, each streamed behind its own <Suspense> so a
// space click never waits on re-reading the previous revision. They are
// mutually exclusive (dialog on drafts, summary once issued), so the
// diff is still computed at most once per navigation.

async function IssueDialogWithDiff({
  selectionId,
  unitId,
  revisionNo,
  lineCount,
  spaceCount,
  previous,
}: {
  selectionId: string;
  unitId: string;
  revisionNo: number;
  lineCount: number;
  spaceCount: number;
  previous: SelectionRow | null;
}) {
  const diff = previous ? await diffRevisions(previous.id, selectionId, unitId) : null;
  return (
    <IssueDialog
      selectionId={selectionId}
      revisionNo={revisionNo}
      lineCount={lineCount}
      spaceCount={spaceCount}
      previousRevisionNo={previous?.revision_no ?? null}
      added={diff?.added ?? 0}
      removed={diff?.removed ?? 0}
      changed={diff?.changed ?? 0}
      unchanged={diff?.unchanged ?? 0}
    />
  );
}

async function HandoffSummary({
  selectionId,
  unitId,
  lineCount,
  previous,
}: {
  selectionId: string;
  unitId: string;
  lineCount: number;
  previous: SelectionRow | null;
}) {
  const diff = previous ? await diffRevisions(previous.id, selectionId, unitId) : null;
  return (
    <p className="text-muted mt-2 text-xs">
      Budgeting received {lineCount} {lineCount === 1 ? "line" : "lines"}
      {diff && previous
        ? ` — ${diff.added} added, ${diff.removed} removed and ${diff.changed} changed since R${previous.revision_no}; ${diff.unchanged} kept existing pricing.`
        : " — all of it new to price."}
      {previous && (
        <>
          {" "}
          <Link
            href={`/selections/${selectionId}/diff`}
            className="text-accent font-medium hover:underline"
          >
            See what changed
          </Link>
        </>
      )}
    </p>
  );
}
