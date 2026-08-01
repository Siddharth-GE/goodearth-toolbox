import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Button, LinkButton } from "@/components/ui/button";
import { listActiveSpaceTypes, getSelection, listSelectionLines, listUnitSpaces } from "@/lib/selections/queries";
import { LayoutGrid } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AddSpaceDialog } from "../_components/add-space-dialog";
import { CataloguePicker } from "../_components/catalogue-picker";
import { LineGrid } from "../_components/line-grid";
import { listItemCategories } from "@/lib/masters/item-categories";
import { listBrands } from "@/lib/masters/brands";

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

  const [spaces, lines, spaceTypes, categories, brands] = await Promise.all([
    listUnitSpaces(selection.unit_id, selectionId),
    listSelectionLines(selectionId),
    listActiveSpaceTypes(),
    listItemCategories(),
    listBrands(),
  ]);

  // Land on the requested space, else the first one. A stale ?space from a
  // bookmark (or a space just deleted) falls back rather than 404s.
  const activeSpace = spaces.find((s) => s.id === space) ?? spaces[0] ?? null;
  const activeLines = activeSpace ? lines.filter((line) => line.unit_space_id === activeSpace.id) : [];
  const isDraft = selection.status === "draft";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/selections" className="text-xs font-medium text-muted hover:text-foreground">
            ← All units
          </Link>
          <h1 className="mt-1 text-lg font-bold tracking-tight text-foreground">
            {selection.unit_name} · R{selection.revision_no}
          </h1>
          <p className="text-sm text-muted">
            {selection.project_name} · {lines.length} {lines.length === 1 ? "item" : "items"} across{" "}
            {spaces.length} {spaces.length === 1 ? "space" : "spaces"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isDraft ? <Badge variant="warning">Draft</Badge> : <Badge variant="success">Issued</Badge>}
          {isDraft && (
            <AddSpaceDialog
              unitId={selection.unit_id}
              spaceTypes={spaceTypes}
              // Passed so suggested names continue past what's already
              // there — a second Bath becomes "Bath 2", not a clash.
              existing={spaces.map((s) => ({ label: s.label, space_type_id: s.space_type_id }))}
            />
          )}
        </div>
      </div>

      {!isDraft && (
        <p className="rounded-xl border border-border bg-surface px-4 py-3 text-sm text-muted">
          This revision has been issued and can no longer be changed. To make a change, create the next
          revision.
        </p>
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
                  <span className={active ? "text-accent-foreground/70 text-xs" : "text-muted text-xs"}>
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
                    <h2 className="text-sm font-semibold text-foreground">{activeSpace.label}</h2>
                    <p className="text-xs text-muted">{activeSpace.space_type_name}</p>
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
