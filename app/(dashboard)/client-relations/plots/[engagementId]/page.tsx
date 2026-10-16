import { Card } from "@/components/ui/card";
import { Section } from "@/components/ui/section";
import { PLOT_STATUS_LABELS } from "@/lib/client-relations/next-steps";
import { getBoardBasics } from "@/lib/client-relations/next-steps-queries";
import { getEngagement, type EngagementDetail } from "@/lib/client-relations/queries";
import { formatLongDate } from "@/lib/format";
import { listProgressStages } from "@/lib/masters/progress-stages";
import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { BoardProvider } from "../../_components/board-context";
import { SectionHead } from "../../_components/board-parts";
import { CollectionsPanel } from "../../_components/collections-panel";
import { Composer } from "../../_components/composer";
import { HealthPill, PlotRail } from "../../_components/lot-card";
import { Pill } from "../../_components/pill";
import {
  BuildCard,
  ClientNameField,
  ContextCard,
  DocumentCard,
  KaadalCard,
  SalesCard,
  type PlotFields,
} from "../../_components/plot-fields";
import { RelayPanel } from "../../_components/relay-panel";
import { StepCard } from "../../_components/step-card";

/** Only what the cards edit, so the browser is not sent the whole record six times. */
function plotFields(engagement: EngagementDetail): PlotFields {
  const {
    id,
    ownerId,
    ownerName,
    bottlenecks,
    registrationStage,
    registrationOn,
    registrationNote,
    saleDeedStatus,
    saleDeedOriginalWith,
    saleDeedAck,
    saleDeedSignedOn,
    caStatus,
    caOriginalWith,
    caAck,
    caSignedOn,
    designConfirmedOn,
    permitOn,
    workingDrawingOn,
    progressStageId,
    kaadalStage,
    kaadalOwnerId,
    kaadalNote,
    details,
    designSupport,
    checkInOn,
    plotValue,
    constructionValue,
  } = engagement;
  return {
    id,
    ownerId,
    ownerName,
    bottlenecks,
    registrationStage,
    registrationOn,
    registrationNote,
    saleDeedStatus,
    saleDeedOriginalWith,
    saleDeedAck,
    saleDeedSignedOn,
    caStatus,
    caOriginalWith,
    caAck,
    caSignedOn,
    designConfirmedOn,
    permitOn,
    workingDrawingOn,
    progressStageId,
    kaadalStage,
    kaadalOwnerId,
    kaadalNote,
    details,
    designSupport,
    checkInOn,
    plotValue,
    constructionValue,
  };
}

/**
 * One plot, the tracker's drawer as a page: the number large, the buyer's
 * name editable in place, then Next steps on top and every other card in
 * the tracker's order (root plan.md, seventh piece). A page rather than a
 * drawer — it works on a phone, and Back returns to the grid.
 *
 * Reached from the Plots grid, a client's page, or any action's plot chip —
 * including the plots with no buyer, which have no client page to live on.
 */
export default async function PlotDetailPage({
  params,
}: {
  params: Promise<{ engagementId: string }>;
}) {
  const { engagementId } = await params;

  const [engagement, basics, stages] = await Promise.all([
    getEngagement(engagementId),
    getBoardBasics(),
    listProgressStages(),
  ]);
  if (!engagement) notFound();

  const { card, steps } = engagement;
  const fields = plotFields(engagement);
  const onTeam = (id: string | null) => Boolean(id && basics.team.some((p) => p.id === id));
  const defaultOwner = onTeam(engagement.ownerId)
    ? engagement.ownerId
    : onTeam(basics.meId)
      ? basics.meId
      : null;
  const open = steps.filter((step) => step.status !== "done").length;

  return (
    <BoardProvider {...basics}>
      <div className="space-y-4">
        <Link
          href="/client-relations/plots"
          className="text-muted hover:text-foreground inline-flex items-center gap-1 text-sm"
        >
          <ChevronLeft className="size-4" /> Plots
        </Link>

        <Card className="flex flex-wrap items-start gap-x-5 gap-y-3 p-5">
          <div className="shrink-0">
            <p className="text-muted text-[10px] font-medium tracking-[0.14em] uppercase">
              {engagement.unitType && !engagement.clientId ? engagement.unitType : "Plot"}
            </p>
            <p className="text-foreground font-mono text-4xl leading-none font-bold tracking-tight">
              {engagement.plotNumber}
            </p>
          </div>
          <div className="min-w-0 flex-1 basis-64">
            {engagement.clientId && engagement.clientName ? (
              <ClientNameField clientId={engagement.clientId} name={engagement.clientName} />
            ) : (
              <p className="text-muted text-xl font-semibold tracking-tight">No buyer yet</p>
            )}
            <div className="text-muted mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
              <span>
                {[engagement.projectName, engagement.unitType, PLOT_STATUS_LABELS[card.status]]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
              <HealthPill health={card.health} />
              {engagement.clientId ? (
                <Link
                  href={`/client-relations/${engagement.clientId}`}
                  className="text-accent font-medium hover:underline"
                >
                  Client page
                </Link>
              ) : null}
            </div>
            {engagement.clientId ? <PlotRail rail={card.rail} className="mt-3 max-w-md" /> : null}
          </div>
        </Card>

        <Section title="Next steps" aside={<Pill>{open} open</Pill>}>
          <div className="space-y-2">
            {steps.length === 0 ? (
              <p className="text-muted text-sm">No actions yet. Add the next step below.</p>
            ) : (
              steps.map((step) => <StepCard key={step.id} step={step} showPlot={false} />)
            )}
            <div className="pt-1">
              <Composer fixedPlot={engagement.id} defaultOwner={defaultOwner} />
            </div>
          </div>
        </Section>

        <SalesCard engagement={fields} />
        <div className="grid items-start gap-4 lg:grid-cols-2">
          <DocumentCard engagement={fields} kind="deed" />
          <DocumentCard engagement={fields} kind="ca" />
        </div>
        <BuildCard engagement={fields} stages={stages} />
        <KaadalCard engagement={fields} />

        <div className="space-y-3">
          <SectionHead title="Collections" />
          <CollectionsPanel engagement={engagement} />
        </div>

        <ContextCard
          engagement={fields}
          updatedLine={`This plot's record last changed ${formatLongDate(engagement.updatedAt)}.`}
        />

        <div className="space-y-3">
          <SectionHead
            title="Relay"
            hint="Trails filed in Relay for this villa, read as they are"
          />
          <RelayPanel engagement={engagement} />
        </div>
      </div>
    </BoardProvider>
  );
}
