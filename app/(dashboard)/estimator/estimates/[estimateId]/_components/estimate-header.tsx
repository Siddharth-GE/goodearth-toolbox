import { Badge } from "@/components/ui/badge";
import { Button, LinkButton } from "@/components/ui/button";
import { PageTitle } from "@/components/ui/page-title";
import type { EstimateDetail } from "@/lib/estimator/estimate-queries";
import type { EstimateView } from "@/lib/estimator/estimate-view";
import { formatDate } from "@/lib/format";
import Link from "next/link";
import {
  DeleteEstimateButton,
  EstimateFormDialog,
  StartVillaDialog,
} from "../../_components/estimate-forms";
import { MakeOfficialButton } from "./submit-forms";

/** The title, its actions, and the sentences that say what this estimate is. */
export function EstimateHeader({
  estimate,
  view,
}: {
  estimate: EstimateDetail;
  view: EstimateView;
}) {
  const { isDraft, olderDraft, villaName, totals } = view;
  return (
    <>
      <PageTitle
        title={
          estimate.reference
            ? `${villaName} · ${estimate.reference}`
            : estimate.isWorking
              ? `${villaName} — working estimate`
              : estimate.name
        }
        description={
          estimate.isWorking
            ? `${estimate.projectName}${estimate.name !== villaName ? ` · ${estimate.name}` : ""}`
            : `${villaName} · ${estimate.projectName}`
        }
        backHref="/estimator/estimates"
        backLabel="Villas"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {estimate.status === "submitted" && <Badge variant="success">Official</Badge>}
            {estimate.status === "superseded" && <Badge variant="neutral">Superseded</Badge>}
            {olderDraft && <Badge variant="neutral">Older draft</Badge>}
            {isDraft && (
              <>
                <EstimateFormDialog estimate={estimate} />
                <DeleteEstimateButton
                  estimateId={estimate.id}
                  label={estimate.isWorking ? "Discard" : "Delete"}
                  description={
                    estimate.isWorking
                      ? `This deletes ${villaName}'s working estimate — its works, measurement sheets and its own rates. ${estimate.villaOfficial ? "The official estimate stays as it is, and a new working estimate can start from it." : "Nothing of it is kept."}`
                      : "This deletes an older draft with its works, measurement sheets and rates. The villa's working and official estimates stay as they are."
                  }
                />
              </>
            )}
            {estimate.isWorking && (
              <MakeOfficialButton
                estimateId={estimate.id}
                villaName={villaName}
                lineCount={estimate.lines.length}
                toMeasureCount={totals.toMeasureCount}
                hasOfficial={!!estimate.villaOfficial}
              />
            )}
            {estimate.status === "submitted" &&
              (estimate.villaWorkingId ? (
                <LinkButton href={`/estimator/estimates/${estimate.villaWorkingId}`}>
                  Open the working estimate
                </LinkButton>
              ) : (
                estimate.unitId && (
                  <StartVillaDialog
                    unitId={estimate.unitId}
                    villaName={villaName}
                    sources={[
                      {
                        id: estimate.id,
                        label: `This official estimate, ${estimate.reference ?? ""}`,
                      },
                    ]}
                    preferredSourceId={estimate.id}
                    trigger={<Button>Carry on from this</Button>}
                  />
                )
              ))}
          </div>
        }
      />

      {estimate.status === "submitted" && (
        <p className="text-muted text-sm">
          {villaName}&apos;s official estimate — made official
          {estimate.submittedByName ? ` by ${estimate.submittedByName}` : ""} on{" "}
          {formatDate(estimate.submittedAt)}. Its numbers are frozen at that day&apos;s rates.
          Changes happen in the working estimate, and Make official there replaces this one.
        </p>
      )}
      {estimate.status === "superseded" && (
        <p className="text-warning text-sm">
          Replaced on {formatDate(estimate.supersededAt)} — kept as history.
          {estimate.villaOfficial && (
            <>
              {" "}
              <Link
                className="underline underline-offset-2"
                href={`/estimator/estimates/${estimate.villaOfficial.id}`}
              >
                See the current official estimate
              </Link>
              .
            </>
          )}
        </p>
      )}
      {estimate.isWorking && estimate.villaOfficial && (
        <p className="text-muted text-sm">
          {villaName}&apos;s official estimate is{" "}
          <Link
            className="underline underline-offset-2"
            href={`/estimator/estimates/${estimate.villaOfficial.id}`}
          >
            {estimate.villaOfficial.reference}
          </Link>
          . What you change here reaches it only when you make this official again.
        </p>
      )}
      {olderDraft && (
        <p className="text-warning text-sm">
          An older draft, from before each villa had one working estimate. It can&apos;t be made
          official —{" "}
          {estimate.villaWorkingId ? (
            <Link
              className="underline underline-offset-2"
              href={`/estimator/estimates/${estimate.villaWorkingId}`}
            >
              {villaName}&apos;s working estimate
            </Link>
          ) : (
            `${villaName}'s working estimate`
          )}{" "}
          is where changes go. Delete it when you no longer need it.
        </p>
      )}
      {estimate.isWorking && estimate.sourceName && (
        <p className="text-muted text-sm">Started from {estimate.sourceName}.</p>
      )}
      {estimate.model && (
        <p className="text-muted text-sm">
          Measured from {estimate.model.file ?? "a SketchUp model"} ·{" "}
          {formatDate(estimate.model.importedAt)}
          {estimate.model.importedByName ? ` · ${estimate.model.importedByName}` : ""}. Rows marked
          Model change in the model —{" "}
          <Link className="underline underline-offset-2" href="/estimator/from-model">
            send it again
          </Link>{" "}
          from SketchUp.
        </p>
      )}
    </>
  );
}
