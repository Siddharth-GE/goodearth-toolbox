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
import { PERIOD_FIGURES, periodsOf, type Window } from "@/lib/saarang-collections/period";
import { LABEL, periodRange } from "@/lib/saarang-collections/summary";
import { PROJECT_NAMES } from "@/lib/saarang-collections/shared";
import { CalendarRange, Upload } from "lucide-react";
import { PeriodControls } from "../_components/period-controls";
import { PeriodPicker, PeriodTable, PeriodTiles, ViewSwitch } from "../_components/period-parts";
import {
  Breakdown,
  MeetingTable,
  ProjectFilter,
  SummaryTable,
  Tiles,
  type Filter,
} from "../_components/summary-parts";

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const one = (value: string | string[] | undefined) => (typeof value === "string" ? value : "");

/** The period view's own dates from the address, when both are real and in order. */
function windowOf(from: string, to: string): Window | null {
  return DATE.test(from) && DATE.test(to) && from <= to ? { from, to } : null;
}

const B = "text-foreground font-medium";

// The view, its dates and the open cell live in the URL, so the breakdown renders on the server and looking saves nothing.
export default async function SummaryPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const collections = await getCollections();
  const { settings } = collections;
  const view = { figures: collections.figures, result: collections.result };
  const inPeriod = one(params.view) === "period";
  const saved = windowOf(settings.periodFrom ?? "", settings.periodTo ?? "");
  // The period view opens on the saved period; its own dates change only what this screen shows.
  const shown = windowOf(one(params.from), one(params.to)) ?? saved;
  const periods = inPeriod && shown ? periodsOf(collections.result, shown) : null;
  const shownRange = shown ? periodRange(shown.from, shown.to) : "";
  const savedRange = periodRange(settings.periodFrom, settings.periodTo);
  const pastReports =
    shown && settings.reportDate && shown.to > settings.reportDate ? settings.reportDate : null;

  const project = one(params.project);
  const filter: Filter = PROJECTS.includes(project as Project) ? (project as Project) : "all";
  const [cellProject, cellKey] = one(params.cell).split(".");
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
          shown={shown}
          filter={filter}
          reportDate={settings.reportDate}
          range={shownRange}
        />
        <p className="text-muted max-w-prose text-sm">
          {inPeriod ? (
            shown ? (
              <>
                Showing only what Zoho dates between <b className={B}>{formatDate(shown.from)}</b>{" "}
                and <b className={B}>{formatDate(shown.to)}</b>, both days included.
                {pastReports ? (
                  <>
                    {" "}
                    Zoho&apos;s reports run to <b className={B}>{formatDate(pastReports)}</b>, so
                    nothing after it is counted yet.
                  </>
                ) : null}{" "}
                Sold value, units and the figures typed by hand have no date in Zoho, so they are
                not part of this view. Download Excel is always the whole project.
              </>
            ) : (
              <>Pick the period&apos;s two days below.</>
            )
          ) : (
            <>
              The whole project to{" "}
              <b className={B}>{settings.reportDate ? formatDate(settings.reportDate) : "date"}</b>,
              as the meeting sheet counts it. Only &ldquo;Last month collection&rdquo; uses the
              collection period{savedRange ? ` (${savedRange})` : ""}, set below.
            </>
          )}
        </p>
      </div>

      <div className="flex flex-wrap items-end justify-between gap-3">
        <ProjectFilter filter={filter} cell={cell} period={inPeriod ? (shown ?? true) : null} />
        {inPeriod ? (
          <PeriodPicker shown={shown} filter={filter} />
        ) : (
          <PeriodControls from={settings.periodFrom} to={settings.periodTo} />
        )}
      </div>

      {inPeriod ? (
        periods && shown ? (
          <>
            <PeriodTiles periods={periods} filter={filter} />
            <Section
              title={`Collected and invoiced, ${shownRange}`}
              note="Rupees. Click a figure to see its rows, and what was left out of it."
            >
              <PeriodTable periods={periods} shown={shown} filter={filter} cell={cell} />
            </Section>
          </>
        ) : (
          <EmptyState
            icon={CalendarRange}
            title="Pick the period's two days"
            description="Choose the first and last day above, then Show this period."
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
          title={`${(inPeriod ? periodLabel : LABEL[selected.k]) ?? selected.k} · ${PROJECT_NAMES[selected.project]}${inPeriod ? ` · ${shownRange}` : ""}`}
          k={selected.k}
          filter={filter}
          period={inPeriod ? shown : null}
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
