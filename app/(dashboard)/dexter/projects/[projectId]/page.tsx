import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { PageTitle } from "@/components/ui/page-title";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from "@/components/ui/table";
import { getProject } from "@/lib/dexter/queries";
import { formatDate } from "@/lib/format";
import { Presentation } from "lucide-react";
import { notFound } from "next/navigation";

import { DeckActions } from "./_components/deck-actions";
import { ProjectHeaderActions } from "./_components/project-actions";
import { UploadDeckDialog } from "./_components/upload-deck-dialog";

/** KB/MB, not lib/format.ts — that module is for money, quantities and
 *  dates; a file size is neither. */
function formatDeckSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default async function DexterProjectPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const detail = await getProject(projectId);
  if (!detail) notFound();

  const { project, decks } = detail;

  return (
    <div className="space-y-4">
      <PageTitle
        title={project.name}
        description={project.clientName ?? undefined}
        backHref="/dexter/projects"
        backLabel="Projects"
        actions={<ProjectHeaderActions project={project} deckCount={decks.length} />}
      />

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-muted text-sm">
          {decks.length} {decks.length === 1 ? "deck" : "decks"}
        </p>
        <UploadDeckDialog projectId={project.id} />
      </div>

      {decks.length === 0 ? (
        <EmptyState
          icon={Presentation}
          title="No decks yet"
          description="Upload an HTML file, or a zip with index.html at its top level."
        />
      ) : (
        <Table containerClassName="overflow-x-auto">
          <TableHead>
            <TableRow>
              <TableHeaderCell>Title</TableHeaderCell>
              <TableHeaderCell>Link</TableHeaderCell>
              <TableHeaderCell>Size</TableHeaderCell>
              <TableHeaderCell>Uploaded</TableHeaderCell>
              <TableHeaderCell></TableHeaderCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {decks.map((deck) => (
              <TableRow key={deck.id}>
                <TableCell className="font-medium whitespace-nowrap">{deck.title}</TableCell>
                <TableCell>
                  <Badge variant={deck.shareEnabled ? "success" : "neutral"}>
                    {deck.shareEnabled ? "Link on" : "Link off"}
                  </Badge>
                </TableCell>
                <TableCell className="whitespace-nowrap">
                  {formatDeckSize(deck.totalBytes)}
                </TableCell>
                <TableCell className="text-muted whitespace-nowrap">
                  {deck.uploadedByName ?? "—"} · {formatDate(deck.createdAt)}
                </TableCell>
                <TableCell className="text-right">
                  <DeckActions deck={deck} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
