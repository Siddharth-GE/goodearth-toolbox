import { Badge } from "@/components/ui/badge";
import { LinkButton } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { FormMessage } from "@/components/ui/form-message";
import { PageTitle } from "@/components/ui/page-title";
import { Section } from "@/components/ui/section";
import {
  getTransmittalDetail,
  listDesignStages,
  listVillaDrawingSetStates,
  type DesignStageRow,
  type DrawingRevisionRow,
  type VillaDrawingSetState,
} from "@/lib/design-management/queries";
import { transmittalReadiness } from "@/lib/design-management/readiness";
import { formatDate } from "@/lib/format";
import { getWorksTree, type WorksTreeCategory } from "@/lib/masters/works";
import { FileText } from "lucide-react";
import { notFound } from "next/navigation";

import { DraftRevisionEditor } from "../../_components/draft-revision-editor";
import { RevisionLog } from "../../_components/revision-log";
import { AddDrawingDialog } from "./_components/add-drawing-dialog";
import {
  DeleteDraftTransmittalButton,
  DraftDetails,
  IssueBar,
  RemoveLineButton,
} from "./_components/transmittal-forms";

const revisionStatusVariant = {
  draft: "warning",
  released: "success",
  superseded: "neutral",
} as const;

/**
 * One transmittal — and, while it is a draft, the whole workspace.
 *
 * Founder, 2026-08-22, redirecting the flow on the staging vet: "press
 * new transmittal, upload the docs and issue to site". So a draft
 * carries, top to bottom in the order the work happens, the stage and
 * note, the drawings going out (each draft with its sheets), one Add
 * drawing dialog, and Issue at the top. An issued one is a record: the same facts
 * with nothing to press but the cover sheet, because that is what "what
 * did site have on the 22nd" means.
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
  const [stages, setStates, tree] = await Promise.all([
    isDraft ? listDesignStages() : Promise.resolve([] as DesignStageRow[]),
    isDraft
      ? listVillaDrawingSetStates(transmittal.unitId)
      : Promise.resolve([] as VillaDrawingSetState[]),
    isDraft ? getWorksTree() : Promise.resolve([] as WorksTreeCategory[]),
  ]);

  // Active stages, plus the one this draft already sits on even if it
  // has since been retired — a select whose value isn't in its own list
  // silently changes the answer on the next save.
  const stageOptions = stages
    .filter((stage) => stage.isActive || stage.id === transmittal.stageId)
    .map((stage) => ({ id: stage.id, name: stage.name }));

  const setIdsOnTransmittal = transmittal.lines.map((line) => line.setId);
  const readiness = transmittalReadiness(
    transmittal.lines.map((line) => ({
      setName: line.setName,
      revisionNo: line.revisionNo,
      revisionStatus: line.revisionStatus,
      fileCount: line.files.length,
      note: line.revisionNote,
    })),
  );
  const addDrawing = (variant: "primary" | "secondary") => (
    <AddDrawingDialog
      transmittalId={transmittal.id}
      sets={setStates}
      setIdsOnTransmittal={setIdsOnTransmittal}
      variant={variant}
    />
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

      {isDraft && (
        <IssueBar
          transmittalId={transmittal.id}
          problem={readiness.problem}
          drawingCount={transmittal.lines.length}
        />
      )}

      {issued && (
        <FormMessage
          success={`Issued as ${issued}. The drawings on it are now released to site.`}
        />
      )}

      {isDraft ? (
        // No heading and no Save button: two fields that save themselves,
        // at the top because they are the first thing to check.
        <Card className="p-4">
          <DraftDetails
            transmittalId={transmittal.id}
            stages={stageOptions}
            stageId={transmittal.stageId}
            note={transmittal.note}
          />
        </Card>
      ) : (
        // Said as a sentence rather than a grid of labels: it is one
        // fact — this went out, for this stage, on this day, from this
        // person — and it reads the way somebody would say it aloud.
        <Card className="space-y-1 p-4">
          <p className="text-foreground text-sm">
            Issued for <span className="font-medium">{transmittal.stageName}</span>
            {transmittal.issuedAt ? ` on ${formatDate(transmittal.issuedAt)}` : ""}
            {transmittal.issuedByName ? ` by ${transmittal.issuedByName}` : ""}.
          </p>
          {transmittal.note && <p className="text-muted text-sm">{transmittal.note}</p>}
        </Card>
      )}

      <Section
        title="Drawings"
        note={
          isDraft
            ? "Each drawing here goes to site when you press Issue."
            : `${transmittal.lines.length} ${transmittal.lines.length === 1 ? "drawing" : "drawings"}, in sheet order.`
        }
        aside={isDraft && transmittal.lines.length > 0 ? addDrawing("secondary") : undefined}
      >
        {transmittal.lines.length === 0 ? (
          <EmptyState
            icon={FileText}
            title="No drawings yet"
            description="Add a new drawing set, or revise one this villa already has."
            action={isDraft ? addDrawing("primary") : undefined}
          />
        ) : (
          <ul className="divide-border divide-y">
            {transmittal.lines.map((line) => {
              const setLabel = line.setCode ? `${line.setCode} — ${line.setName}` : line.setName;
              const lineIsDraft = line.revisionStatus === "draft";
              // The editor takes a revision; a draft line carries every
              // part of one, so it is assembled here rather than fetched
              // a second time.
              const revision: DrawingRevisionRow = {
                id: line.revisionId,
                revisionNo: line.revisionNo,
                status: "draft",
                note: line.revisionNote,
                releasedAt: null,
                files: line.files,
                workItemIds: line.draftWorkItemIds ?? [],
              };

              return (
                <li key={line.lineId} className="space-y-2 py-2.5">
                  <div className="flex flex-wrap items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-foreground flex flex-wrap items-center gap-2 text-sm font-medium">
                        {setLabel}
                        <span className="text-muted font-normal">R{line.revisionNo}</span>
                        <Badge variant={revisionStatusVariant[line.revisionStatus]}>
                          {line.revisionStatus === "draft"
                            ? "Draft"
                            : line.revisionStatus === "released"
                              ? "Released"
                              : "Superseded"}
                        </Badge>
                      </p>
                      {!lineIsDraft && <RevisionLog entries={line.revisionLog} />}
                      {!lineIsDraft &&
                        (line.files.length === 0 ? (
                          <p className="text-muted mt-1 text-xs">No files on this revision.</p>
                        ) : (
                          <div className="mt-1.5 flex flex-wrap gap-2">
                            {line.files.map((file) => (
                              <a
                                key={file.id}
                                href={`/design-management/files/${file.id}`}
                                target="_blank"
                                rel="noreferrer"
                                className="text-foreground border-border hover:border-accent hover:text-accent flex items-center gap-1 rounded-lg border px-2 py-1 text-xs"
                              >
                                <FileText className="size-3 shrink-0" />
                                {file.fileName}
                              </a>
                            ))}
                          </div>
                        ))}
                    </div>
                    {isDraft && (
                      <RemoveLineButton
                        lineId={line.lineId}
                        label={setLabel}
                        revisionNo={line.revisionNo}
                        isDraft={lineIsDraft}
                        fileCount={line.files.length}
                      />
                    )}
                  </div>

                  {/* A drawing still in draft is edited right here: its
                      note, its sheets and the works it serves. Once
                      issued it is frozen and the editor is gone. */}
                  {isDraft && lineIsDraft && (
                    <DraftRevisionEditor revision={revision} tree={tree} />
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Section>

      {/* One way back and one way out. The link to the villa is the back
          link at the top — repeating it here was part of the clutter. */}
      {isDraft && (
        <div className="flex justify-end">
          <DeleteDraftTransmittalButton
            transmittalId={transmittal.id}
            draftCount={transmittal.lines.filter((line) => line.revisionStatus === "draft").length}
          />
        </div>
      )}
    </div>
  );
}
