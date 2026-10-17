import { Badge } from "@/components/ui/badge";
import { LinkButton } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { FormMessage } from "@/components/ui/form-message";
import { PageTitle } from "@/components/ui/page-title";
import { Section } from "@/components/ui/section";
import { getTransmittalDetail, type DrawingRevisionRow } from "@/lib/design-management/queries";
import { transmittalReadiness } from "@/lib/design-management/readiness";
import { formatDate } from "@/lib/format";
import { getWorksTree, type WorksTreeCategory } from "@/lib/masters/works";
import { ExternalLink, FileText } from "lucide-react";
import { notFound } from "next/navigation";

import { DraftRevisionEditor } from "../../_components/draft-revision-editor";
import { FolderSheetList } from "../../_components/folder-sheet-list";
import { RevisionLog } from "../../_components/revision-log";
import {
  DeleteDraftTransmittalButton,
  IssueBar,
  TransmittalNote,
} from "./_components/transmittal-forms";

/** One stage, one drawing set (chosen at start, never changed here, 0099). A draft is the note, revision, drawings (a WorkDrive link since 0124) and Issue; an issued one is the record. */
export default async function TransmittalDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ transmittalId: string }>;
  searchParams: Promise<{ issued?: string }>;
}) {
  const [{ transmittalId }, { issued }] = await Promise.all([params, searchParams]);
  const transmittal = await getTransmittalDetail(transmittalId);
  if (!transmittal) notFound();

  const isDraft = transmittal.status === "draft";
  const tree: WorksTreeCategory[] = isDraft ? await getWorksTree() : [];

  // 0099: at most one line. A draft with none predates that rule; it can only be deleted.
  const line = transmittal.lines[0] ?? null;
  const setLabel = line
    ? line.setCode
      ? `${line.setCode} — ${line.setName}`
      : line.setName
    : null;
  const readiness = transmittalReadiness(
    transmittal.lines.map((row) => ({
      setName: row.setName,
      revisionNo: row.revisionNo,
      revisionStatus: row.revisionStatus,
      fileCount: row.files.length,
      hasLink: row.drawingsUrl !== null,
      note: row.revisionNote,
    })),
  );
  const sheetCount = line ? line.files.length + line.folderSheets.length : 0;

  return (
    <div className="space-y-4">
      <PageTitle
        title={transmittal.number ?? "Draft transmittal"}
        description={`${transmittal.villaName} · Plot ${transmittal.plotName} · ${transmittal.projectName}`}
        backHref={`/design-management/villas/${transmittal.unitId}`}
        backLabel={transmittal.villaName}
        actions={
          <>
            <Badge variant={isDraft ? "warning" : "success"}>{isDraft ? "Draft" : "Issued"}</Badge>
            {/* The cover sheet goes out beside the drawings, so offer it only once something went out. */}
            {!isDraft && (
              <LinkButton
                href={`/design-management/transmittals/${transmittal.id}/pdf`}
                variant="secondary"
                plain
              >
                Cover sheet (PDF)
              </LinkButton>
            )}
          </>
        }
      />

      {isDraft && line && (
        <IssueBar
          transmittalId={transmittal.id}
          problem={readiness.problem}
          sheetCount={sheetCount}
        />
      )}

      {issued && (
        <FormMessage success={`Issued as ${issued}. Its drawings are now released to site.`} />
      )}

      <Card className="space-y-3 p-4">
        <div className="space-y-0.5">
          <p className="text-foreground text-sm">
            <span className="font-medium">{transmittal.stageName}</span>
            {setLabel && (
              <>
                {" · "}
                <span className="font-medium">{setLabel}</span>
                <span className="text-muted"> · R{line!.revisionNo}</span>
              </>
            )}
          </p>
          {!isDraft && (
            <p className="text-muted text-sm">
              Issued
              {transmittal.issuedAt ? ` on ${formatDate(transmittal.issuedAt)}` : ""}
              {transmittal.issuedByName ? ` by ${transmittal.issuedByName}` : ""}.
            </p>
          )}
        </div>
        {isDraft ? (
          <TransmittalNote transmittalId={transmittal.id} note={transmittal.note} />
        ) : (
          transmittal.note && <p className="text-muted text-sm">{transmittal.note}</p>
        )}
      </Card>

      {!line ? (
        <EmptyState
          icon={FileText}
          title="No drawing set on this transmittal"
          description={
            isDraft
              ? "It was started before a transmittal carried one set. Delete this draft and press New transmittal on the villa."
              : "Nothing was recorded on it."
          }
        />
      ) : isDraft && line.revisionStatus === "draft" ? (
        <Section
          title="Drawings"
          note="Paste the share link of this revision's WorkDrive folder — the toolbox lists its sheets, and the whole folder goes to site when you issue."
        >
          <DraftRevisionEditor revision={draftRevision(line)} tree={tree} />
        </Section>
      ) : (
        <Section
          title="Drawings"
          note={
            sheetCount === 0
              ? "No sheet list was kept for this revision."
              : `${sheetCount} ${sheetCount === 1 ? "sheet" : "sheets"}, as they went to site.`
          }
        >
          <RevisionLog entries={line.revisionLog} />
          {line.drawingsUrl && (
            <div className="mt-2 space-y-2">
              <LinkButton href={line.drawingsUrl} newTab variant="secondary" size="sm">
                <ExternalLink className="size-3.5" />
                Open the folder in WorkDrive
              </LinkButton>
              {line.folderSheets.length > 0 && <FolderSheetList sheets={line.folderSheets} />}
            </div>
          )}
          {line.files.length > 0 && (
            <ul className="divide-border mt-2 divide-y">
              {line.files.map((file) => (
                <li key={file.id} className="py-2">
                  <a
                    href={`/design-management/files/${file.id}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-foreground hover:text-accent flex min-w-0 items-center gap-2 text-sm break-all"
                  >
                    <FileText className="text-muted size-4 shrink-0" />
                    {file.fileName}
                  </a>
                </li>
              ))}
            </ul>
          )}
        </Section>
      )}

      {/* One way back and one way out; the back link to the villa is at the top. */}
      {isDraft && (
        <div className="flex justify-end">
          <DeleteDraftTransmittalButton
            transmittalId={transmittal.id}
            draft={
              line && line.revisionStatus === "draft"
                ? {
                    label: setLabel ?? "",
                    revisionNo: line.revisionNo,
                    sheetCount: line.files.length,
                  }
                : null
            }
          />
        </div>
      )}
    </div>
  );
}

function draftRevision(
  line: NonNullable<Awaited<ReturnType<typeof getTransmittalDetail>>>["lines"][number],
): DrawingRevisionRow {
  return {
    id: line.revisionId,
    revisionNo: line.revisionNo,
    status: "draft",
    note: line.revisionNote,
    releasedAt: null,
    files: line.files,
    drawingsUrl: line.drawingsUrl,
    folderSheets: line.folderSheets,
    workItemIds: line.draftWorkItemIds ?? [],
  };
}
