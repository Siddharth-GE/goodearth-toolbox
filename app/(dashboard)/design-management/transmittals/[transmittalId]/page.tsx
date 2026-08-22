import { Badge } from "@/components/ui/badge";
import { LinkButton } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
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
import { formatDate } from "@/lib/format";
import { getWorksTree, type WorksTreeCategory } from "@/lib/masters/works";
import { FileText } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { DraftRevisionEditor } from "../../_components/draft-revision-editor";
import {
  AddDrawingsBoard,
  DeleteDraftTransmittalButton,
  DraftDetailsForm,
  IssueTransmittalButton,
  RemoveLineButton,
  ResendReleasedPicker,
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
 * carries the stage and note, the drawings going out, the upload and
 * work-link editor for each drawing still in draft, and the board that
 * starts or revises a set. An issued one is a record: the same facts
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
  const onTransmittal = new Set(setIdsOnTransmittal);

  // A set already on this transmittal is offered neither path: one line
  // per set keeps "what went out" readable, and the database is happy
  // either way, so the screen picks the version a person can follow.
  const resendOptions = setStates
    .filter((set) => set.released !== null && !onTransmittal.has(set.setId))
    .map((set) => ({
      revisionId: set.released!.revisionId,
      label: `${set.setCode ? `${set.setCode} — ${set.setName}` : set.setName} — R${
        set.released!.revisionNo
      } (released) · ${set.released!.fileCount} ${set.released!.fileCount === 1 ? "file" : "files"}`,
    }));

  return (
    <div className="space-y-4">
      <PageTitle
        title={transmittal.number ?? "Draft transmittal"}
        description={`${transmittal.villaName} · Plot ${transmittal.plotName} · ${transmittal.projectName}`}
        backHref="/design-management/transmittals"
        backLabel="All transmittals"
        actions={
          <>
            <Badge variant={isDraft ? "warning" : "success"}>{isDraft ? "Draft" : "Issued"}</Badge>
            <LinkButton
              href={`/design-management/transmittals/${transmittal.id}/pdf`}
              variant="secondary"
              plain
            >
              Cover sheet (PDF)
            </LinkButton>
            {isDraft && <IssueTransmittalButton transmittalId={transmittal.id} />}
          </>
        }
      />

      {issued && (
        <FormMessage
          success={`Issued as ${issued}. The drawings on it are now released to site.`}
        />
      )}

      {isDraft ? (
        <Section
          title="Details"
          note="A draft can still be changed. Issuing it gives it a number and releases its drawings."
        >
          <DraftDetailsForm
            transmittalId={transmittal.id}
            stages={stageOptions}
            stageId={transmittal.stageId}
            note={transmittal.note}
          />
        </Section>
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
        title="Drawings on this transmittal"
        note={
          transmittal.lines.length === 0
            ? undefined
            : `${transmittal.lines.length} ${transmittal.lines.length === 1 ? "drawing" : "drawings"}, in sheet order.`
        }
      >
        {transmittal.lines.length === 0 ? (
          <p className="text-danger text-sm font-medium">
            No drawings on this transmittal yet — add one below before issuing it.
          </p>
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
                      {!lineIsDraft && line.revisionNote && (
                        <p className="text-muted mt-0.5 text-xs">{line.revisionNote}</p>
                      )}
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
                        isDraft={lineIsDraft}
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

      {isDraft && (
        <Section
          title="Add drawings"
          note="Start a set's first drawings, revise one that has already gone out, or continue a draft."
        >
          <AddDrawingsBoard
            transmittalId={transmittal.id}
            sets={setStates}
            setIdsOnTransmittal={setIdsOnTransmittal}
          />
          {resendOptions.length > 0 && (
            <div className="border-border mt-3 border-t pt-3">
              <ResendReleasedPicker transmittalId={transmittal.id} options={resendOptions} />
            </div>
          )}
        </Section>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link
          href={`/design-management/villas/${transmittal.unitId}`}
          className="text-accent text-sm font-medium hover:underline"
        >
          Open {transmittal.villaName}&apos;s issued drawings
        </Link>
        {isDraft && <DeleteDraftTransmittalButton transmittalId={transmittal.id} />}
      </div>
    </div>
  );
}
