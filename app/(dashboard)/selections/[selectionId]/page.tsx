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
} from "@/lib/selections/queries";
import { FileDown, GitCompare, LayoutGrid, Sheet } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AddSpaceDialog } from "../_components/add-space-dialog";
import { CataloguePicker } from "../_components/catalogue-picker";
import { IssueDialog } from "../_components/issue-dialog";
import { LineGrid } from "../_components/line-grid";
import { NextRevisionButton } from "../_components/next-revision-button";
import { SpaceViews } from "../_components/space-views";
import { listSpaceViews } from "@/lib/selections/views";
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

  // Views belong to the space, not the revision — a render of Bedroom 1
  // is still a render of Bedroom 1 in R3.
  const viewsBySpace = await listSpaceViews(spaces.map((space) => space.id));

  // What the budget team will be handed. Computed for a draft too, so the
  // Issue dialog can state it before the click rather than after.
  const diff = previous ? await diffRevisions(previous.id, selectionId, selection.unit_id) : null;

  // Land on the requested space, else the first one. A stale ?space from a
  // bookmark (or a space just deleted) falls back rather than 404s.
  const activeSpace = spaces.find((s) => s.id === space) ?? spaces[0] ?? null;
  const activeLines = activeSpace
    ? lines.filter((line) => line.unit_space_id === activeSpace.id)
    : [];
  const isDraft = selection.status === "draft";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/selections" className="text-muted hover:text-foreground text-xs font-medium">
            ← All units
          </Link>
          <h1 className="text-foreground mt-1 text-lg font-bold tracking-tight">
            {selection.unit_name} · R{selection.revision_no}
          </h1>
          <p className="text-muted text-sm">
            {selection.project_name} · {lines.length} {lines.length === 1 ? "item" : "items"} across{" "}
            {spaces.length} {spaces.length === 1 ? "space" : "spaces"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isDraft ? (
            <Badge variant="warning">Draft</Badge>
          ) : selection.status === "superseded" ? (
            <Badge variant="default" className="bg-muted/15 text-muted">
              Superseded
            </Badge>
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
                <IssueDialog
                  selectionId={selectionId}
                  revisionNo={selection.revision_no}
                  lineCount={lines.length}
                  spaceCount={spaces.filter((s) => s.line_count > 0).length}
                  previousRevisionNo={previous?.revision_no ?? null}
                  added={diff?.added ?? 0}
                  removed={diff?.removed ?? 0}
                  changed={diff?.changed ?? 0}
                  unchanged={diff?.unchanged ?? 0}
                />
              )}
            </>
          )}
          {selection.status === "issued" && <NextRevisionButton fromSelectionId={selectionId} />}
        </div>
      </div>

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
          <p className="text-muted mt-2 text-xs">
            Budgeting received {lines.length} {lines.length === 1 ? "line" : "lines"}
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
                      <LinkButton href="/selections" variant="secondary">
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
