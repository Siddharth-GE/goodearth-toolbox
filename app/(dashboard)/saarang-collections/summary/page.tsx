import { EmptyState } from "@/components/ui/empty-state";
import { LinkButton } from "@/components/ui/button";
import { Section } from "@/components/ui/section";
import { formatDate } from "@/lib/format";
import { getCollections } from "@/lib/saarang-collections/queries";
import {
  PROJECTS,
  type Detail,
  type DetailKey,
  type Project,
} from "@/lib/saarang-collections/core";
import { PERIOD_FIGURES, periodsOf } from "@/lib/saarang-collections/period";
import { LABEL, periodRange } from "@/lib/saarang-collections/summary";
import { PROJECT_NAMES } from "@/lib/saarang-collections/shared";
import { CalendarRange, Upload } from "lucide-react";
import { PeriodControls } from "../_components/period-controls";
import { PeriodTable, PeriodTiles, ViewSwitch } from "../_components/period-parts";
import {
  Breakdown,
  MeetingTable,
  ProjectFilter,
  SummaryTable,
  Tiles,
  type Filter,
} from "../_components/summary-parts";

// The view and the cell live in the URL (`?view=period&cell=plot.F`), so the breakdown renders on the server.
export default async function SummaryPage({
  searchParams,
}: {
  searchParams: Promise<{ project?: string; cell?: string; view?: string }>;
}) {
  const params = await searchParams;
  const collections = await getCollections();
  const { settings } = collections;
  const view = { figures: collections.figures, result: collections.result };
  const inPeriod = params.view === "period";
  const window =
    settings.periodFrom && settings.periodTo
      ? { from: settings.periodFrom, to: settings.periodTo }
      : null;
  const periods = inPeriod && window ? periodsOf(collections.result, window) : null;
  const range = periodRange(settings.periodFrom, settings.periodTo);

  const filter: Filter = PROJECTS.includes(params.project as Project)
    ? (params.project as Project)
    : "all";
  const [cellProject, cellKey] = (params.cell ?? "").split(".");
  const selected =
    PROJECTS.includes(cellProject as Project) && cellKey
      ? { project: cellProject as Project, k: cellKey }
      : null;
  // An own key only: "constructor" in the address is not a figure.
  const details: Partial<Record<string, Detail>> | undefined = selected
    ? periods
      ? periods[selected.project].detail
      : inPeriod
        ? undefined
        : view.result[selected.project].detail
    : undefined;
  const detail =
    selected && details && Object.hasOwn(details, selected.k)
      ? details[selected.k as DetailKey]
      : undefined;
  const cell = selected && detail ? `${selected.project}.${selected.k}` : null;
  const periodLabel = PERIOD_FIGURES.find((f) => f.k === selected?.k)?.label;

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

      <div className="space-y-2">
        <ViewSwitch
          period={inPeriod}
          filter={filter}
          reportDate={settings.reportDate}
          range={range}
        />
        <p className="text-muted max-w-prose text-sm">
          {inPeriod ? (
            <>
              Showing only what Zoho dates between{" "}
              <b className="text-foreground font-medium">{formatDate(settings.periodFrom)}</b> and{" "}
              <b className="text-foreground font-medium">{formatDate(settings.periodTo)}</b>, both
              days included. Sold value, units and the figures typed by hand have no date in Zoho,
              so they are not part of this view.
            </>
          ) : (
            <>
              The whole project to{" "}
              <b className="text-foreground font-medium">
                {settings.reportDate ? formatDate(settings.reportDate) : "date"}
              </b>
              , as the meeting sheet counts it. Only &ldquo;Last month collection&rdquo; uses the
              period{range ? ` (${range})` : ""}.
            </>
          )}
        </p>
      </div>

      <div className="flex flex-wrap items-end justify-between gap-3">
        <ProjectFilter filter={filter} cell={cell} period={inPeriod} />
        <PeriodControls from={settings.periodFrom} to={settings.periodTo} />
      </div>

      {inPeriod ? (
        periods ? (
          <>
            <PeriodTiles periods={periods} filter={filter} />
            <Section
              title={`${range}`}
              note="Rupees. Click a figure to see its rows, and what was left out of it."
            >
              <PeriodTable periods={periods} filter={filter} cell={cell} />
            </Section>
          </>
        ) : (
          <EmptyState
            icon={CalendarRange}
            title="Set the period's two dates"
            description="Pick the first and last day above, then Set period."
          />
        )
      ) : (
        <>
          <Tiles view={view} filter={filter} period={period} />
          <Section
            title="Collection and expense"
            note="Rupees, the whole project. Calculated from Zoho: click a figure to see the rows behind it. The shaded boxes are entered by hand and save when you leave them."
          >
            <SummaryTable view={view} filter={filter} cell={cell} period={period} />
          </Section>
        </>
      )}

      {selected && detail && (
        <Breakdown
          detail={detail}
          title={`${(inPeriod ? periodLabel : LABEL[selected.k]) ?? selected.k} · ${PROJECT_NAMES[selected.project]}${inPeriod ? ` · ${range}` : ""}`}
          k={selected.k}
          filter={filter}
          period={inPeriod}
        />
      )}

      {!inPeriod && (
        <Section
          title="Meeting view"
          note="The short table for the meeting, the whole project. Phase 3 is entered by hand until it has its own Zoho reports. Download Excel is this view too."
        >
          <MeetingTable view={view} period={period} />
        </Section>
      )}
    </div>
  );
}
