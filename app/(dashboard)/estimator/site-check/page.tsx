import { Badge } from "@/components/ui/badge";
import { LinkButton } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Figure, FigureBand, FigureBandCell } from "@/components/ui/figure";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from "@/components/ui/table";
import {
  getApprovalsFor,
  getItemLabels,
  getOfficialComparisons,
} from "@/lib/estimator/estimate-queries";
import { drawnPercent, materialTotals, siteCheckEntries } from "@/lib/estimator/site-check";
import { listWorkStatus } from "@/lib/estimator/works-queries";
import { formatCount, formatDate, formatPercent, formatQuantity } from "@/lib/format";
import { listUnits } from "@/lib/masters/units";
import { cn } from "@/lib/utils";
import { ClipboardCheck } from "lucide-react";
import Link from "next/link";
import { ApproveReconciliationButton } from "../estimates/[estimateId]/_components/reconciliation-forms";

/**
 * Site check — one list, across every villa, of what needs an
 * estimator's eye: material that went past a villa's official estimate,
 * and material that reached a villa the estimate never planned (0083 —
 * flagged forever, approved on the row). Below it, "where does all the
 * material go": each one, estimated against reached, across the project.
 *
 * Everything is derived fresh from the frozen estimates and the plots'
 * movements, the same arithmetic as each official estimate's own page.
 * Quantities only — no money on this screen.
 */
export default async function SiteCheckPage({
  searchParams,
}: {
  searchParams: Promise<{ item?: string }>;
}) {
  const { item } = await searchParams;
  const [officials, works, units] = await Promise.all([
    getOfficialComparisons(),
    listWorkStatus(),
    listUnits(),
  ]);

  const entries = siteCheckEntries(officials);
  const totals = materialTotals(officials);
  const [approvals, labels] = await Promise.all([
    getApprovalsFor(officials.map((official) => official.unitId)),
    getItemLabels([...entries.map((entry) => entry.itemId), ...totals.map((t) => t.itemId)]),
  ]);

  const unitName = new Map(units.map((unit) => [unit.id, unit.name]));
  const workName = new Map(works.map((work) => [work.workItemId, `${work.code} — ${work.name}`]));
  const referenceByEstimate = new Map(
    officials.map((official) => [official.estimateId, official.reference]),
  );
  const approvalFor = (entry: (typeof entries)[number]) =>
    approvals.get(`${entry.unitId} ${entry.workItemId ?? ""} ${entry.itemId}`);

  // Waiting for an approval first, then over-runs, then what has been
  // looked at — each group in villa order.
  const rank = (entry: (typeof entries)[number]) =>
    entry.kind === "outside" ? (approvalFor(entry) ? 2 : 0) : 1;
  const villaOrder = (entry: (typeof entries)[number]) => unitName.get(entry.unitId) ?? "";
  const sorted = [...entries].sort(
    (a, b) =>
      rank(a) - rank(b) || villaOrder(a).localeCompare(villaOrder(b), undefined, { numeric: true }),
  );

  const waiting = entries.filter((entry) => entry.kind === "outside" && !approvalFor(entry));
  const villasOver = new Set(entries.filter((entry) => entry.kind === "over").map((e) => e.unitId));

  const materialName = (itemId: string, fallback: string | null) =>
    labels.get(itemId)?.name ?? fallback ?? "An item";
  const materialUom = (itemId: string, fallback: string | null) =>
    fallback ?? labels.get(itemId)?.uom ?? "";

  const focus = item ? totals.find((total) => total.itemId === item) : undefined;
  const focusByVilla = focus
    ? officials
        .map((official) => ({
          unitId: official.unitId,
          estimateId: official.estimateId,
          ...(materialTotals([official]).find((total) => total.itemId === focus.itemId) ?? {
            estimated: 0,
            reached: 0,
          }),
        }))
        .filter((row) => row.estimated > 0 || row.reached > 0)
        .sort((a, b) =>
          (unitName.get(a.unitId) ?? "").localeCompare(unitName.get(b.unitId) ?? "", undefined, {
            numeric: true,
          }),
        )
    : [];

  if (officials.length === 0) {
    return (
      <EmptyState
        icon={ClipboardCheck}
        title="No official estimates yet"
        description="Site check lines up what reaches each villa against its official estimate. Submit a villa's estimate and it appears here."
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="max-w-2xl">
        <p className="text-muted text-[11px] font-medium tracking-[0.14em] uppercase">Site check</p>
        <p className="text-muted mt-1 text-sm">
          What has reached each villa — store issues and deliveries straight to site — against its
          official estimate, work by work. Going over is flagged, never refused: site work never
          waits. Material the estimate never planned needs an estimator&apos;s approval, and keeps
          its flag either way.
        </p>
      </div>

      <FigureBand className="sm:grid-cols-3 lg:grid-cols-3">
        <FigureBandCell>
          <Figure
            label="Villas"
            value={formatCount(officials.length)}
            hint="with an official estimate"
            size="lg"
          />
        </FigureBandCell>
        <FigureBandCell>
          <Figure
            label="Past the estimate"
            value={formatCount(villasOver.size)}
            hint="villas drawing more than planned"
            tone={villasOver.size > 0 ? "warn" : undefined}
            size="lg"
          />
        </FigureBandCell>
        <FigureBandCell>
          <Figure
            label="Waiting for approval"
            value={formatCount(waiting.length)}
            hint="arrived outside the estimate"
            tone={waiting.length > 0 ? "warn" : undefined}
            size="lg"
          />
        </FigureBandCell>
      </FigureBand>

      <Card className="space-y-3 p-4">
        <p className="text-muted text-[11px] font-medium tracking-[0.14em] uppercase">
          Needs a look
        </p>
        {sorted.length === 0 ? (
          <p className="text-muted text-sm">
            Nothing — every villa is within its estimate, and nothing has arrived that the estimate
            didn&apos;t plan.
          </p>
        ) : (
          <ul className="divide-border divide-y">
            {sorted.map((entry) => {
              const approval = entry.kind === "outside" ? approvalFor(entry) : undefined;
              const name = materialName(entry.itemId, entry.materialName);
              const uom = materialUom(entry.itemId, entry.uom);
              const work = entry.workItemId ? (workName.get(entry.workItemId) ?? null) : null;
              return (
                <li
                  key={`${entry.estimateId}-${entry.kind}-${entry.workItemId ?? ""}-${entry.itemId}`}
                  className="flex flex-wrap items-start justify-between gap-3 py-3"
                >
                  <div className="min-w-0 space-y-0.5">
                    <p className="text-foreground text-sm font-medium">
                      <Link
                        href={`/estimator/estimates/${entry.estimateId}`}
                        className="hover:underline"
                      >
                        {unitName.get(entry.unitId) ?? "A villa"}
                      </Link>
                      <span className="text-muted font-normal">
                        {" · "}
                        {referenceByEstimate.get(entry.estimateId) ?? "official estimate"}
                      </span>
                    </p>
                    <p className="text-sm">
                      {name}
                      <span className="text-muted"> — {work ?? "not tagged to a work"}</span>
                    </p>
                    <p className="text-muted text-sm">
                      {entry.kind === "over"
                        ? `${formatQuantity(entry.reached)} ${uom} reached, against ${formatQuantity(entry.estimated)} ${uom} estimated (${formatPercent(drawnPercent(entry.estimated ?? 0, entry.reached))})`
                        : `${formatQuantity(entry.reached)} ${uom} reached — the estimate doesn't plan it for this work`}
                    </p>
                    {approval && (
                      <p className="text-muted text-xs">
                        Approved by {approval.approvedByName} on {formatDate(approval.approvedAt)}
                        {approval.note ? ` — ${approval.note}` : ""}
                      </p>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Badge variant="warning">
                      {entry.kind === "over" ? "Past the estimate" : "Outside the estimate"}
                    </Badge>
                    {entry.kind === "outside" && !approval && (
                      <ApproveReconciliationButton
                        estimateId={entry.estimateId}
                        itemId={entry.itemId}
                        workItemId={entry.workItemId}
                        itemName={name}
                        workName={work}
                      />
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <Card className="space-y-3 p-4">
        <div>
          <p className="text-muted text-[11px] font-medium tracking-[0.14em] uppercase">
            Where the material goes
          </p>
          <p className="text-muted mt-1 text-sm">
            Every material across the villas&apos; official estimates, and how much of it has
            reached them — planned or not. Tap one to see it villa by villa.
          </p>
        </div>
        {totals.length === 0 ? (
          <p className="text-muted text-sm">The official estimates list no materials yet.</p>
        ) : (
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>Material</TableHeaderCell>
                <TableHeaderCell className="text-right">Estimated</TableHeaderCell>
                <TableHeaderCell className="text-right">Reached</TableHeaderCell>
                <TableHeaderCell className="text-right">Drawn</TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {[...totals]
                .sort((a, b) =>
                  materialName(a.itemId, a.name).localeCompare(materialName(b.itemId, b.name)),
                )
                .map((total) => {
                  const uom = materialUom(total.itemId, total.uom);
                  const percent = drawnPercent(total.estimated, total.reached);
                  return (
                    <TableRow key={total.itemId}>
                      <TableCell className="text-foreground text-sm">
                        <Link
                          href={`/estimator/site-check?item=${total.itemId}`}
                          className="hover:underline"
                        >
                          {materialName(total.itemId, total.name)}
                        </Link>
                        <span className="text-muted block text-xs">
                          {total.villas === 0
                            ? "planned on no estimate"
                            : `on ${formatCount(total.villas)} ${total.villas === 1 ? "villa" : "villas"}`}
                        </span>
                      </TableCell>
                      <TableCell className="text-right text-sm whitespace-nowrap">
                        {total.estimated > 0 ? `${formatQuantity(total.estimated)} ${uom}` : "—"}
                      </TableCell>
                      <TableCell className="text-right text-sm whitespace-nowrap">
                        {formatQuantity(total.reached)} {uom}
                      </TableCell>
                      <TableCell
                        className={cn(
                          "text-right text-sm",
                          percent !== null && percent > 100 && "text-warning",
                        )}
                      >
                        {formatPercent(percent)}
                      </TableCell>
                    </TableRow>
                  );
                })}
            </TableBody>
          </Table>
        )}
      </Card>

      {focus && (
        <Card className="space-y-3 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-foreground text-sm font-semibold">
              {materialName(focus.itemId, focus.name)}, villa by villa
            </p>
            <LinkButton href="/estimator/site-check" variant="ghost" size="sm">
              Close
            </LinkButton>
          </div>
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>Villa</TableHeaderCell>
                <TableHeaderCell className="text-right">Estimated</TableHeaderCell>
                <TableHeaderCell className="text-right">Reached</TableHeaderCell>
                <TableHeaderCell className="text-right">Drawn</TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {focusByVilla.map((row) => {
                const uom = materialUom(focus.itemId, focus.uom);
                const percent = drawnPercent(row.estimated, row.reached);
                return (
                  <TableRow key={row.estimateId}>
                    <TableCell className="text-foreground text-sm">
                      <Link
                        href={`/estimator/estimates/${row.estimateId}`}
                        className="hover:underline"
                      >
                        {unitName.get(row.unitId) ?? "A villa"}
                      </Link>
                    </TableCell>
                    <TableCell className="text-right text-sm whitespace-nowrap">
                      {row.estimated > 0 ? `${formatQuantity(row.estimated)} ${uom}` : "—"}
                    </TableCell>
                    <TableCell className="text-right text-sm whitespace-nowrap">
                      {formatQuantity(row.reached)} {uom}
                    </TableCell>
                    <TableCell
                      className={cn(
                        "text-right text-sm",
                        percent !== null && percent > 100 && "text-warning",
                      )}
                    >
                      {formatPercent(percent)}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}
