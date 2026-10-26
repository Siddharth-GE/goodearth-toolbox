import { Card } from "@/components/ui/card";
import { chipClassName } from "@/components/ui/choice-chips";
import { PageTitle } from "@/components/ui/page-title";
import { Pill, PlotChip } from "@/components/ui/pill";
import { SectionHead } from "@/components/ui/section-head";
import { formatDate, formatDayDate, formatShortDate } from "@/lib/format";
import { listBrands } from "@/lib/masters/brands";
import { listItemCategories } from "@/lib/masters/item-categories";
import { getLookAhead } from "@/lib/supervisors/look-ahead-queries";
import { listWorkOptions } from "@/lib/supervisors/queries";
import { addDays, describeSlip } from "@/lib/supervisors/schedule";
import Link from "next/link";
import { Bucket, type Pickers } from "./_components/look-ahead-parts";

// The week ahead across a supervisor's villas: what starts when, what waits, who is behind, and which crews are double-booked.
export default async function LookAheadPage({
  searchParams,
}: {
  searchParams: Promise<{ who?: string }>;
}) {
  const params = await searchParams;
  const [board, works, categories, brands] = await Promise.all([
    getLookAhead(params),
    listWorkOptions(),
    listItemCategories(),
    listBrands(),
  ]);
  const pickers: Pickers = {
    works,
    categories: categories.map(({ id, name }) => ({ id, name })),
    brands: brands.map(({ id, name }) => ({ id, name })),
  };

  return (
    <div className="space-y-4">
      <PageTitle
        title="Look ahead"
        description="What starts in the next three weeks, so the crews and the material are lined up before it does."
        backHref="/supervisors"
        backLabel="Supervisors"
      />
      <nav aria-label="Whose villas" className="flex flex-wrap gap-1.5">
        {(["mine", "all"] as const).map((who) => (
          <Link
            key={who}
            href={`/supervisors/plan?who=${who}`}
            aria-current={board.who === who ? "true" : undefined}
            className={chipClassName(board.who === who)}
            scroll={false}
          >
            {who === "mine" ? "Mine" : "Everyone"}
          </Link>
        ))}
      </nav>

      <Bucket
        title="Starting this week"
        hint={`To ${formatDayDate(addDays(board.today, 6))}`}
        rows={board.thisWeek}
        empty="Nothing starts this week — or the villas have no start date or days yet."
        board={board}
        pickers={pickers}
      />
      <Bucket
        title="Next two weeks"
        rows={board.nextTwoWeeks}
        empty="Nothing is forecast to start in the two weeks after."
        board={board}
        pickers={pickers}
      />
      <Bucket
        title="Waiting"
        rows={board.waiting}
        empty="No stage is waiting."
        board={board}
        pickers={pickers}
        showReadiness={false}
      />

      <section className="space-y-2">
        <SectionHead title="Behind the first plan" count={board.behind.length} />
        {board.behind.length === 0 ? (
          <p className="text-muted px-0.5 text-sm">No villa is behind its first plan.</p>
        ) : (
          <Card className="p-0">
            <ul className="divide-border divide-y">
              {board.behind.map((villa) => (
                <li key={villa.plotId}>
                  <Link
                    href={`/supervisors/villas/${villa.plotId}`}
                    className="hover:bg-foreground/[0.025] flex min-h-14 flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5"
                  >
                    <PlotChip number={villa.plotName} />
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">
                      {villa.villaName}
                    </span>
                    <span className="text-muted text-xs">
                      {`Handover ${formatDate(villa.handover)} · `}
                      <span className="text-danger">{describeSlip(villa.slip)}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </section>

      <section className="space-y-2">
        <SectionHead
          title="Contractors"
          count={board.loads.length}
          hint="Who is on which villa in the next three weeks"
        />
        {board.loads.length === 0 ? (
          <p className="text-muted px-0.5 text-sm">
            No contractor is set on a stage in the next three weeks — pick one on Next up.
          </p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {board.loads.map((load) => (
              <Card key={load.contractorId} className="space-y-2 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-foreground text-sm font-semibold">{load.contractorName}</p>
                  {load.clash ? <Pill tone="danger">Two villas at once</Pill> : null}
                </div>
                <p className="text-muted text-xs">
                  {`${load.villas} ${load.villas === 1 ? "villa" : "villas"} from ${formatDayDate(load.from)}`}
                </p>
                <ul className="space-y-1 text-xs">
                  {load.stages.map((stage) => (
                    <li key={`${stage.plotId}-${stage.groupId}`} className="flex gap-2">
                      <span className="text-foreground shrink-0 font-mono font-semibold">
                        {stage.plotName}
                      </span>
                      <span className="text-foreground/80 min-w-0 truncate">{`${stage.code} ${stage.name}`}</span>
                      <span className="text-muted ml-auto shrink-0">
                        {stage.finish
                          ? `${formatShortDate(stage.start)} – ${formatShortDate(stage.finish)}`
                          : `from ${formatShortDate(stage.start)}`}
                      </span>
                    </li>
                  ))}
                </ul>
              </Card>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
