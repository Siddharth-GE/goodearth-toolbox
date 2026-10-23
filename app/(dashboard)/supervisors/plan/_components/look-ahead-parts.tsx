import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PlotChip } from "@/components/ui/pill";
import { SectionHead } from "@/components/ui/section-head";
import { formatShortDate } from "@/lib/format";
import type { LookAhead, LookAheadRow } from "@/lib/supervisors/look-ahead-queries";
import { WAITING_ON_LABEL } from "@/lib/supervisors/programme";
import type { listWorkOptions } from "@/lib/supervisors/queries";
import { readinessSummary } from "@/lib/supervisors/readiness";
import { Package } from "lucide-react";
import Link from "next/link";
import { RequestIssueDialog } from "../../villas/[plotId]/_components/request-forms";

export type Pickers = {
  works: Awaited<ReturnType<typeof listWorkOptions>>;
  categories: { id: string; name: string }[];
  brands: { id: string; name: string }[];
};

function dates(row: LookAheadRow): string {
  const length = row.days ? `${row.days} ${row.days === 1 ? "day" : "days"}` : "days not set";
  if (!row.start) return length;
  return row.finish
    ? `${formatShortDate(row.start)} – ${formatShortDate(row.finish)} · ${length}`
    : `From ${formatShortDate(row.start)} · ${length}`;
}

/** One stage of one villa: when, who, and whether its material is ready — with Request right there. */
function StageRow({
  row,
  board,
  pickers,
  showReadiness,
}: {
  row: LookAheadRow;
  board: LookAhead;
  pickers: Pickers;
  showReadiness: boolean;
}) {
  const villa = board.villas[row.plotId];
  const toRequest = row.readiness.some((entry) => entry.pick && entry.left !== 0);
  return (
    <li className="space-y-1.5 px-4 py-3">
      <Link
        href={`/supervisors/villas/${row.plotId}`}
        className="hover:text-accent flex min-w-0 items-center gap-2"
      >
        <PlotChip number={row.plotName} />
        <span className="min-w-0 truncate text-sm font-medium">
          <span className="text-muted font-mono text-xs">{row.code}</span> {row.name}
        </span>
      </Link>
      <p className="text-muted text-xs">
        {[
          row.status === "waiting" && row.waitingOn
            ? `Waiting on ${WAITING_ON_LABEL[row.waitingOn].toLowerCase()}`
            : dates(row),
          row.contractorName ?? "No contractor yet",
        ].join(" · ")}
      </p>
      {showReadiness ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-foreground/80 text-xs">
            {`Material: ${readinessSummary(row.readiness).toLowerCase()}`}
          </p>
          {villa && toRequest ? (
            <RequestIssueDialog
              plotId={row.plotId}
              works={pickers.works}
              hasEstimate={villa.hasEstimate}
              quickPicks={villa.quickPicks}
              categories={pickers.categories}
              brands={pickers.brands}
              stageWorkIds={row.workIds}
              trigger={
                <Button variant="secondary" size="sm">
                  <Package className="size-4" aria-hidden />
                  Request
                </Button>
              }
            />
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

export function Bucket({
  title,
  hint,
  rows,
  empty,
  board,
  pickers,
  showReadiness = true,
}: {
  title: string;
  hint?: string;
  rows: LookAheadRow[];
  empty: string;
  board: LookAhead;
  pickers: Pickers;
  showReadiness?: boolean;
}) {
  return (
    <section className="space-y-2">
      <SectionHead title={title} count={rows.length} hint={hint} />
      {rows.length === 0 ? (
        <p className="text-muted px-0.5 text-sm">{empty}</p>
      ) : (
        <Card className="p-0">
          <ul className="divide-border divide-y">
            {rows.map((row) => (
              <StageRow
                key={`${row.plotId}-${row.groupId}`}
                row={row}
                board={board}
                pickers={pickers}
                showReadiness={showReadiness}
              />
            ))}
          </ul>
        </Card>
      )}
    </section>
  );
}
