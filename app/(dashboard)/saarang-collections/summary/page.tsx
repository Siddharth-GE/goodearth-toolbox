import { EmptyState } from "@/components/ui/empty-state";
import { LinkButton } from "@/components/ui/button";
import { Section } from "@/components/ui/section";
import { getCollections } from "@/lib/saarang-collections/queries";
import { PROJECTS, type DetailKey, type Project } from "@/lib/saarang-collections/core";
import { LABEL } from "@/lib/saarang-collections/summary";
import { PROJECT_NAMES } from "@/lib/saarang-collections/shared";
import { Upload } from "lucide-react";
import { PeriodControls } from "../_components/period-controls";
import {
  Breakdown,
  MeetingTable,
  ProjectFilter,
  SummaryTable,
  Tiles,
  type Filter,
} from "../_components/summary-parts";

// The cell in the URL (`?cell=plot.F`) opens its breakdown on the server, so the page needs no script to show it.
export default async function SummaryPage({
  searchParams,
}: {
  searchParams: Promise<{ project?: string; cell?: string }>;
}) {
  const params = await searchParams;
  const collections = await getCollections();
  const { settings } = collections;
  const view = { figures: collections.figures, result: collections.result };

  const filter: Filter = PROJECTS.includes(params.project as Project)
    ? (params.project as Project)
    : "all";
  const [cellProject, cellKey] = (params.cell ?? "").split(".");
  const selected =
    PROJECTS.includes(cellProject as Project) && cellKey
      ? { project: cellProject as Project, k: cellKey }
      : null;
  // An own key only: "constructor" in the address is not a figure.
  const detail =
    selected && Object.hasOwn(view.result[selected.project].detail, selected.k)
      ? view.result[selected.project].detail[selected.k as DetailKey]
      : undefined;
  const cell = selected && detail ? `${selected.project}.${selected.k}` : null;

  const loaded = collections.slots.some((slot) => slot.upload);
  const period = {
    periodFrom: settings.periodFrom,
    periodTo: settings.periodTo,
    reportDate: settings.reportDate,
  };

  return (
    <div className="space-y-4">
      {!loaded && (
        <EmptyState
          icon={Upload}
          title="No Zoho reports loaded"
          description="Add the eight exports (payments, outstanding invoices, sold units and milestones for Plot and Villa) and the summary fills in."
          action={<LinkButton href="/saarang-collections/reports">Add reports</LinkButton>}
        />
      )}

      <Tiles view={view} filter={filter} period={period} />

      <div className="flex flex-wrap items-end justify-between gap-3">
        <ProjectFilter filter={filter} cell={cell} />
        <PeriodControls from={settings.periodFrom} to={settings.periodTo} />
      </div>

      <Section
        title="Collection and expense"
        note="Rupees. Calculated from Zoho: click a figure to see the rows behind it. The shaded boxes are entered by hand and save when you leave them."
      >
        <SummaryTable view={view} filter={filter} cell={cell} period={period} />
      </Section>

      {selected && detail && (
        <Breakdown
          detail={detail}
          title={`${LABEL[selected.k]} · ${PROJECT_NAMES[selected.project]}`}
          k={selected.k}
          filter={filter}
        />
      )}

      <Section
        title="Meeting view"
        note="The short table for the meeting. Phase 3 is entered by hand until it has its own Zoho reports."
      >
        <MeetingTable view={view} period={period} />
      </Section>
    </div>
  );
}
