import { Badge } from "@/components/ui/badge";
import { LinkButton } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Figure, FigureBand, FigureBandCell } from "@/components/ui/figure";
import { PageTitle } from "@/components/ui/page-title";
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
  getOffEstimateReasons,
  getOfficialComparisons,
} from "@/lib/estimator/estimate-queries";
import { getIndentApprovalsFor } from "@/lib/estimator/indent-queries";
import { drawnPercent, materialTotals, siteCheckEntries } from "@/lib/estimator/site-check";
import { listWorkStatus } from "@/lib/estimator/works-queries";
import { formatCount, formatDate, formatPercent, formatQuantity } from "@/lib/format";
import { listProjects } from "@/lib/masters/projects";
import { listUnits } from "@/lib/masters/units";
import { cn } from "@/lib/utils";
import { notFound } from "next/navigation";
import { ApproveReconciliationButton } from "../../estimates/[estimateId]/_components/reconciliation-forms";

/** One villa's site check: material past its estimate or never planned (Approve on the row), then every material estimated against reached (compare.ts). */
export default async function VillaSiteCheckPage({
  params,
}: {
  params: Promise<{ unitId: string }>;
}) {
  const { unitId } = await params;
  const [officials, works, units, projects] = await Promise.all([
    getOfficialComparisons(),
    listWorkStatus(),
    listUnits(),
    listProjects(),
  ]);
  // Only a villa with an official estimate has anything to check.
  const official = officials.find((candidate) => candidate.unitId === unitId);
  const villa = units.find((unit) => unit.id === unitId);
  if (!official || !villa) notFound();

  const entries = siteCheckEntries([official]);
  const totals = materialTotals([official]);
  const [approvals, indentApprovals, labels, reasons] = await Promise.all([
    getApprovalsFor([unitId]),
    getIndentApprovalsFor([villa]),
    getItemLabels([...entries.map((entry) => entry.itemId), ...totals.map((t) => t.itemId)]),
    getOffEstimateReasons([villa]),
  ]);

  const workName = new Map(works.map((work) => [work.workItemId, `${work.code} — ${work.name}`]));
  const projectName = projects.find((project) => project.id === villa.project_id)?.name;
  const keyOf = (entry: (typeof entries)[number]) =>
    `${entry.unitId} ${entry.workItemId ?? ""} ${entry.itemId}`;
  // Approved here or at the indent that asked for it (0113): either way an estimator has looked.
  const approvalFor = (entry: (typeof entries)[number]) =>
    approvals.get(keyOf(entry)) ?? indentApprovals.get(keyOf(entry));

  // Waiting for an approval first, then over-runs, then what has been looked at.
  const rank = (entry: (typeof entries)[number]) =>
    entry.kind === "outside" ? (approvalFor(entry) ? 2 : 0) : 1;
  const sorted = [...entries].sort((a, b) => rank(a) - rank(b));
  const waiting = entries.filter((entry) => entry.kind === "outside" && !approvalFor(entry));
  const over = entries.filter((entry) => entry.kind === "over");

  const materialName = (itemId: string, fallback: string | null) =>
    labels.get(itemId)?.name ?? fallback ?? "An item";
  const materialUom = (itemId: string, fallback: string | null) =>
    fallback ?? labels.get(itemId)?.uom ?? "";

  return (
    <div className="space-y-4">
      <PageTitle
        title={villa.name}
        description={`${projectName ? `${projectName} · ` : ""}checked against ${official.reference ?? "its official estimate"}.`}
        backHref="/estimator/site-check"
        backLabel="Site check"
        actions={
          <>
            <LinkButton href={`/estimator/villas/${unitId}/budget`} variant="secondary" size="sm">
              Budget against actual
            </LinkButton>
            <LinkButton
              href={`/estimator/estimates/${official.estimateId}`}
              variant="secondary"
              size="sm"
            >
              Open the official estimate
            </LinkButton>
          </>
        }
      />

      <FigureBand className="lg:grid-cols-3">
        <FigureBandCell>
          <Figure
            label="Materials"
            value={formatCount(totals.length)}
            hint="planned, or reached the site"
          />
        </FigureBandCell>
        <FigureBandCell>
          <Figure
            label="Past the estimate"
            value={formatCount(over.length)}
            hint="more reached than planned"
            tone={over.length > 0 ? "warn" : undefined}
          />
        </FigureBandCell>
        <FigureBandCell>
          <Figure
            label="Waiting for approval"
            value={formatCount(waiting.length)}
            hint="arrived outside the estimate"
            tone={waiting.length > 0 ? "warn" : undefined}
          />
        </FigureBandCell>
      </FigureBand>

      <Card className="space-y-3 p-4">
        <p className="text-muted text-[11px] font-medium tracking-[0.14em] uppercase">
          Needs a look
        </p>
        {sorted.length === 0 ? (
          <p className="text-muted text-sm">
            Nothing — this villa is within its estimate, and nothing has arrived that the estimate
            didn&apos;t plan.
          </p>
        ) : (
          <ul className="divide-border divide-y">
            {sorted.map((entry) => {
              const approval = entry.kind === "outside" ? approvalFor(entry) : undefined;
              const asked = entry.kind === "outside" ? reasons.get(keyOf(entry)) : undefined;
              const name = materialName(entry.itemId, entry.materialName);
              const uom = materialUom(entry.itemId, entry.uom);
              const work = entry.workItemId ? (workName.get(entry.workItemId) ?? null) : null;
              return (
                <li
                  key={`${entry.kind}-${entry.workItemId ?? ""}-${entry.itemId}`}
                  className="flex flex-wrap items-start justify-between gap-3 py-3"
                >
                  <div className="min-w-0 space-y-0.5">
                    <p className="text-foreground text-sm font-medium">
                      {name}
                      <span className="text-muted font-normal">
                        {" — "}
                        {work ?? "not tagged to a work"}
                      </span>
                    </p>
                    <p className="text-muted text-sm">
                      {entry.kind === "over"
                        ? `${formatQuantity(entry.reached)} ${uom} reached the site, against ${formatQuantity(entry.estimated)} ${uom} estimated (${formatPercent(drawnPercent(entry.estimated ?? 0, entry.reached))})`
                        : `${formatQuantity(entry.reached)} ${uom} reached the site — the estimate doesn't plan it for this work`}
                    </p>
                    {asked && (
                      <p className="text-foreground text-sm">
                        {`Site's reason: ${asked.join(" · ")}`}
                      </p>
                    )}
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
            Every material
          </p>
          <p className="text-muted mt-1 text-sm">
            What the estimate plans for this villa, and what has reached its site so far — issued
            from a store, or delivered straight to the site by a vendor.
          </p>
        </div>
        {totals.length === 0 ? (
          <p className="text-muted text-sm">
            The estimate lists no materials, and nothing has reached the site yet.
          </p>
        ) : (
          <MaterialTable totals={totals} materialName={materialName} materialUom={materialUom} />
        )}
      </Card>
    </div>
  );
}

function MaterialTable({
  totals,
  materialName,
  materialUom,
}: {
  totals: ReturnType<typeof materialTotals>;
  materialName: (itemId: string, fallback: string | null) => string;
  materialUom: (itemId: string, fallback: string | null) => string;
}) {
  return (
    <Table>
      <TableHead>
        <TableRow>
          <TableHeaderCell>Material</TableHeaderCell>
          <TableHeaderCell className="text-right">Estimated</TableHeaderCell>
          <TableHeaderCell className="text-right">Reached site</TableHeaderCell>
          <TableHeaderCell className="text-right">Of estimate</TableHeaderCell>
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
                  {materialName(total.itemId, total.name)}
                  {total.estimated === 0 && (
                    <span className="text-muted block text-xs">not on the estimate</span>
                  )}
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
  );
}
