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
import { FileText } from "lucide-react";
import { notFound } from "next/navigation";

import { DraftRevisionEditor } from "../../_components/draft-revision-editor";
import { RevisionLog } from "../../_components/revision-log";
import {
  DeleteDraftTransmittalButton,
  IssueBar,
  TransmittalNote,
} from "./_components/transmittal-forms";

/**
 * One transmittal: one stage, one drawing set, and that set's sheets.
 *
 * Founder, 2026-09-27: "one transmittal contains only one stage and you
 * upload a drawing set and inside that sheets … so each time a full set
 * gets to site to avoid confusion". The stage and the set are chosen when
 * the transmittal starts and never change here (0099 holds both), so a
 * draft is only: the note for site, what changed, the sheets, and Issue.
 * An issued one is the record — what went out, when and by whom, with
 * nothing to press but the cover sheet.
 */
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

  // 0099: at most one line. A draft with none is one started before that
  // rule; it can only be deleted and started again.
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
      note: row.revisionNote,
    })),
  );

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
            {/* The cover sheet is what goes out beside the drawings, so it
                is offered once there is something that went out. */}
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
          sheetCount={line.files.length}
        />
      )}

      {issued && (
        <FormMessage success={`Issued as ${issued}. Its drawings are now released to site.`} />
      )}

      {/* What is going out, said as one line a person would say aloud. */}
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
          title="Sheets"
          note="Upload every sheet of the set — the whole set goes to site together when you issue."
        >
          <DraftRevisionEditor revision={draftRevision(line)} tree={tree} />
        </Section>
      ) : (
        <Section
          title="Sheets"
          note={`${line.files.length} ${line.files.length === 1 ? "sheet" : "sheets"}. Each opens under the name it saves as.`}
        >
          <RevisionLog entries={line.revisionLog} />
          {line.files.length === 0 ? (
            <p className="text-muted mt-1 text-xs">No sheets on this revision.</p>
          ) : (
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
                    {file.displayName}
                  </a>
                </li>
              ))}
            </ul>
          )}
        </Section>
      )}

      {/* One way back and one way out. The link to the villa is the back
          link at the top — repeating it here was part of the clutter. */}
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

/** The editor takes a revision; the draft line carries every part of one. */
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
    workItemIds: line.draftWorkItemIds ?? [],
  };
}
