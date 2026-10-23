import { Card } from "@/components/ui/card";
import { Section } from "@/components/ui/section";
import { PLOT_STATUS_LABELS } from "@/lib/client-relations/next-steps";
import { getBoardBasics } from "@/lib/client-relations/next-steps-queries";
import { getEngagement, type EngagementDetail } from "@/lib/client-relations/queries";
import { sideForTrack, trackForSide, type ActionTrack } from "@/lib/client-relations/stages";
import { formatLongDate } from "@/lib/format";
import { listProgressStages } from "@/lib/masters/progress-stages";
import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { BoardProvider } from "../../_components/board-context";
import { FilterChips, SectionHead } from "../../_components/board-parts";
import { CollectionsPanel } from "../../_components/collections-panel";
import { Composer } from "../../_components/composer";
import { HealthPill, PlotRail } from "../../_components/lot-card";
import { NotYours } from "../../_components/not-yours";
import { PersonName, Pill } from "@/components/ui/pill";
import {
  BuildCard,
  ClientNameField,
  ContextCard,
  DocumentCard,
  ConstructionCard,
  InteriorCard,
  type PlotFields,
} from "../../_components/plot-fields";
import { RelayPanel } from "../../_components/relay-panel";
import { SideIcon, SideMark, sideLabel } from "../../_components/side-mark";
import { StepCard } from "../../_components/step-card";

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
    kaadalOwnerName,
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
    kaadalOwnerName,
    kaadalNote,
    details,
    designSupport,
    checkInOn,
    plotValue,
    constructionValue,
  };
}

/**
 * One plot as a page (phone-friendly; Back returns to the grid), including plots with no buyer.
 * Next steps shows both sides or one (`?side=`); a new step goes to that side's owner.
 */
export default async function PlotDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ engagementId: string }>;
  searchParams: Promise<{ side?: string }>;
}) {
  const { engagementId } = await params;
  const side = trackForSide((await searchParams).side);

  const [engagement, basics, stages] = await Promise.all([
    getEngagement(engagementId),
    getBoardBasics(),
    listProgressStages(),
  ]);
  // A plot that is not theirs, or just handed on, gets a sentence, not "not found" (0123).
  if (!engagement) {
    if (!basics.seesAll) return <NotYours kind="plot" />;
    notFound();
  }

  const { card, steps } = engagement;
  const fields = plotFields(engagement);
  const onTeam = (id: string | null) => Boolean(id && basics.team.some((p) => p.id === id));
  const defaultOwner = onTeam(basics.meId) ? basics.meId : null;
  // Someone who holds only the Interior side starts their steps there.
  const mySide: ActionTrack =
    engagement.kaadalOwnerId === basics.meId && engagement.ownerId !== basics.meId
      ? "kaadal"
      : "sales";
  const shown = side ? steps.filter((step) => step.track === side) : steps;
  const openOn = (track: ActionTrack | null) =>
    steps.filter((step) => step.status !== "done" && (!track || step.track === track)).length;
  const sideHref = (track: ActionTrack | null) =>
    track
      ? `/client-relations/plots/${engagement.id}?side=${sideForTrack(track)}`
      : `/client-relations/plots/${engagement.id}`;
  const owners: { track: ActionTrack; name: string | null }[] = [
    { track: "sales", name: engagement.ownerName },
    { track: "kaadal", name: engagement.kaadalOwnerName },
  ];

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
            <p className="text-muted text-[10px] font-medium tracking-[0.14em] uppercase">Plot</p>
            <p className="text-foreground font-mono text-4xl leading-none font-bold tracking-tight">
              {engagement.plotNumber}
            </p>
          </div>
          <div className="min-w-0 flex-1 basis-64">
            {engagement.clientId && engagement.clientName ? (
              <ClientNameField clientId={engagement.clientId} name={engagement.clientName} />
            ) : (
              <p className="text-muted font-display text-2xl font-medium">No buyer yet</p>
            )}
            <div className="text-muted mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
              <span>
                {[engagement.projectName, engagement.unitName, PLOT_STATUS_LABELS[card.status]]
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
            {/* Assigned twice: one owner per side. */}
            <div className="text-muted mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs">
              {owners.map(({ track, name }) => (
                <span key={track} className="flex min-w-0 items-center gap-1.5">
                  <SideIcon track={track} />
                  <span>{sideLabel(track)}</span>
                  {name ? <PersonName name={name} size={18} /> : <span>· nobody yet</span>}
                </span>
              ))}
            </div>
          </div>
        </Card>

        <Section title="Next steps" aside={<Pill>{openOn(side)} open</Pill>}>
          <div className="space-y-2">
            <FilterChips
              label="Which side"
              items={[
                {
                  key: "both",
                  label: <>Both sides · {openOn(null)}</>,
                  href: sideHref(null),
                  on: !side,
                },
                ...(["sales", "kaadal"] as const).map((track) => ({
                  key: track,
                  label: (
                    <>
                      <SideMark track={track} /> · {openOn(track)}
                    </>
                  ),
                  href: sideHref(track),
                  on: side === track,
                })),
              ]}
            />
            {shown.length === 0 ? (
              <p className="text-muted text-sm">
                {side
                  ? `No ${sideLabel(side).toLowerCase()} actions yet. Add the next step below.`
                  : "No actions yet. Add the next step below."}
              </p>
            ) : (
              shown.map((step) => <StepCard key={step.id} step={step} showPlot={false} />)
            )}
            <div className="pt-1">
              <Composer
                key={side ?? "both"}
                fixedPlot={engagement.id}
                defaultOwner={defaultOwner}
                defaultTrack={side ?? mySide}
              />
            </div>
          </div>
        </Section>

        <ConstructionCard engagement={fields} />
        <div className="grid items-start gap-4 lg:grid-cols-2">
          <DocumentCard engagement={fields} kind="deed" />
          <DocumentCard engagement={fields} kind="ca" />
        </div>
        <BuildCard engagement={fields} stages={stages} />
        <InteriorCard engagement={fields} />

        <div className="space-y-3">
          <SectionHead title="Collections" />
          <CollectionsPanel engagement={engagement} canCancel={basics.seesAll} />
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
