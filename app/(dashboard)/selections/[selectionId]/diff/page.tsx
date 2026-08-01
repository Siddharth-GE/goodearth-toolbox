import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from "@/components/ui/table";
import {
  diffRevisions,
  getPreviousIssued,
  getSelection,
  type LineChange,
} from "@/lib/selections/queries";
import { GitCompare } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { formatCount, formatQuantity } from "@/lib/format";

export default async function RevisionDiffPage({
  params,
}: {
  params: Promise<{ selectionId: string }>;
}) {
  const { selectionId } = await params;
  const selection = await getSelection(selectionId);
  if (!selection) notFound();

  const previous = await getPreviousIssued(selection.unit_id, selection.revision_no);

  return (
    <div className="space-y-4">
      <div>
        <Link
          href={`/selections/${selectionId}`}
          className="text-muted hover:text-foreground text-xs font-medium"
        >
          ← R{selection.revision_no}
        </Link>
        <h1 className="text-foreground mt-1 text-lg font-bold tracking-tight">
          {previous
            ? `R${selection.revision_no} compared with R${previous.revision_no}`
            : "Changes"}
        </h1>
        <p className="text-muted text-sm">
          {selection.project_name} · {selection.unit_name}
        </p>
      </div>

      {!previous ? (
        <EmptyState
          icon={GitCompare}
          title="Nothing to compare"
          description="This is the first revision for this unit, so every line in it is new."
        />
      ) : (
        <DiffBody
          previousId={previous.id}
          currentId={selectionId}
          unitId={selection.unit_id}
          previousRevisionNo={previous.revision_no}
        />
      )}
    </div>
  );
}

async function DiffBody({
  previousId,
  currentId,
  unitId,
  previousRevisionNo,
}: {
  previousId: string;
  currentId: string;
  unitId: string;
  previousRevisionNo: number;
}) {
  const diff = await diffRevisions(previousId, currentId, unitId);

  const added = diff.entries.filter((entry) => entry.kind === "added");
  const removed = diff.entries.filter((entry) => entry.kind === "removed");
  const changed = diff.entries.filter((entry) => entry.kind === "changed");

  if (diff.entries.length === 0) {
    return (
      <EmptyState
        icon={GitCompare}
        title="Nothing changed"
        description={`This revision is identical to R${previousRevisionNo}. Every line keeps the pricing it was already given.`}
      />
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-2">
        <Summary tone="success" count={diff.added} label="added" />
        <Summary tone="danger" count={diff.removed} label="removed" />
        <Summary tone="warning" count={diff.changed} label="changed" />
        {/* The number that matters to the budget team: work they don't
            have to redo. */}
        <Summary tone="default" count={diff.unchanged} label="unchanged — pricing carries over" />
      </div>

      <Section title="Added" entries={added} previousRevisionNo={previousRevisionNo} />
      <Section title="Removed" entries={removed} previousRevisionNo={previousRevisionNo} />
      <Section title="Quantity changed" entries={changed} previousRevisionNo={previousRevisionNo} />
    </div>
  );
}

function Summary({
  tone,
  count,
  label,
}: {
  tone: "success" | "danger" | "warning" | "default";
  count: number;
  label: string;
}) {
  return (
    <div className="border-border bg-surface rounded-xl border px-4 py-2.5">
      <span className="text-foreground text-sm font-semibold tabular-nums">
        {formatCount(count)}
      </span>{" "}
      <Badge variant={tone} className="ml-1">
        {label}
      </Badge>
    </div>
  );
}

function Section({
  title,
  entries,
  previousRevisionNo,
}: {
  title: string;
  entries: LineChange[];
  previousRevisionNo: number;
}) {
  if (entries.length === 0) return null;

  return (
    <div className="space-y-2">
      <h2 className="text-muted text-xs font-semibold tracking-widest uppercase">
        {title} ({entries.length})
      </h2>
      <Table>
        <TableHead>
          <TableRow>
            <TableHeaderCell>Space</TableHeaderCell>
            <TableHeaderCell>Code</TableHeaderCell>
            <TableHeaderCell>Item</TableHeaderCell>
            <TableHeaderCell>Quantity</TableHeaderCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {entries.map((entry) => (
            <TableRow key={entry.line.line_key}>
              <TableCell className="text-muted">{entry.space}</TableCell>
              <TableCell className="text-muted">{entry.line.item_code ?? "—"}</TableCell>
              <TableCell className="text-foreground font-medium">{entry.line.item_name}</TableCell>
              <TableCell>
                {entry.kind === "changed" ? (
                  <span className="tabular-nums">
                    <span className="text-muted line-through">
                      {formatQuantity(entry.previous.quantity)}
                    </span>{" "}
                    <span className="text-foreground font-semibold">
                      {formatQuantity(entry.line.quantity)}
                    </span>{" "}
                    <span className="text-muted">{entry.line.uom}</span>
                    {entry.spaceChanged && (
                      <span className="text-muted ml-2 text-xs">moved from another space</span>
                    )}
                  </span>
                ) : (
                  <span className="tabular-nums">
                    {formatQuantity(entry.line.quantity)}{" "}
                    <span className="text-muted">{entry.line.uom}</span>
                    {entry.kind === "removed" && (
                      <span className="text-muted ml-2 text-xs">was in R{previousRevisionNo}</span>
                    )}
                  </span>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
