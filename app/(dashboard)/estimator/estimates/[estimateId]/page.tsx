import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Figure } from "@/components/ui/figure";
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
  aggregateFrozenTakeoff,
  computeEstimateTotals,
  computeLine,
  computeTakeoff,
  frozenLineCosts,
  groupLineCosts,
  type LineCost,
  type MaterialDef,
  type MixDef,
  type WorkRecipe,
} from "@/lib/estimator/calc";
import { compareIssuesToEstimate } from "@/lib/estimator/compare";
import {
  getEstimate,
  getIssuedAgainstEstimate,
  getRecipeBook,
  listWorkStatus,
} from "@/lib/estimator/queries";
import { formatDate, formatMoney, formatQuantity } from "@/lib/format";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Fragment } from "react";
import { EstimateFormDialog, DeleteEstimateButton } from "../_components/estimate-forms";
import { AddLineDialog, LineQtyField, RemoveLineButton } from "./_components/line-forms";
import { ReviseEstimateButton, SubmitEstimateButton } from "./_components/submit-forms";
import { listProjects } from "@/lib/masters/projects";
import { listUnits } from "@/lib/masters/units";

// The estimate reads as a BOQ, because that is the document an
// estimator already knows: works gathered under their categories, one
// amount per line, a subtotal per category, the grand total on top. A
// future PDF export prints groupLineCosts' output — the same structure
// this page renders, never a second grouping.
//
// Since 0077 the page has two lives. A DRAFT is the calculator: costs
// computed live from today's rates. A SUBMITTED (or superseded)
// estimate renders from its frozen snapshot instead — same grouping,
// same totals arithmetic, numbers that no longer move.
export default async function EstimatePage({
  params,
}: {
  params: Promise<{ estimateId: string }>;
}) {
  const { estimateId } = await params;
  const [estimate, book, works, projects, units] = await Promise.all([
    getEstimate(estimateId),
    getRecipeBook(),
    listWorkStatus(),
    listProjects(),
    listUnits(),
  ]);
  if (!estimate) notFound();

  const isDraft = estimate.status === "draft";

  // Issued-vs-estimated, for the villa's OFFICIAL estimate only: what
  // the store has issued to its plot, per work, lined up against the
  // frozen takeoff. Inventory's reads are open (no money there), so
  // this crosses no gate — see getIssuedAgainstEstimate.
  const issuedData =
    estimate.status === "submitted" && estimate.unitId
      ? await getIssuedAgainstEstimate(estimate.unitId)
      : null;
  const comparison =
    issuedData && estimate.frozen
      ? compareIssuesToEstimate(estimate.frozen.takeoff, issuedData.links, issuedData.lines)
      : null;

  // One calculator for the whole tool: per-line costs, per-unit rates,
  // category subtotals, estimate totals and the takeoff all come out of
  // lib/estimator/calc.ts, so they can never disagree with each other.
  // The frozen branch feeds the SAME grouping from the snapshot.
  const materialsById = new Map<string, MaterialDef>(book.materials.map((m) => [m.id, m]));
  const mixesById = new Map<string, MixDef>(book.mixes.map((m) => [m.id, m]));
  const recipesByWork = new Map<string, WorkRecipe>(book.recipes.map((r) => [r.workItemId, r]));

  const lineInputs = estimate.lines.map((line) => ({
    workItemId: line.workItemId,
    qty: line.qty,
  }));

  let lineCosts: LineCost[];
  let takeoffRows: {
    materialId: string;
    name: string;
    uom: string;
    quantity: number;
    cost: number | null;
    missingRate: boolean;
  }[];
  const uomByWork = new Map<string, string | null>();
  const unitRateByWork = new Map<string, number | null>();

  if (isDraft || !estimate.frozen) {
    lineCosts = lineInputs.map((line) =>
      computeLine(line, recipesByWork.get(line.workItemId), mixesById, materialsById),
    );
    takeoffRows = computeTakeoff(lineInputs, recipesByWork, mixesById, materialsById).map((row) => {
      const material = materialsById.get(row.materialId);
      return {
        materialId: row.materialId,
        name: material?.name ?? "Unknown material",
        uom: material?.uom ?? "",
        quantity: row.quantity,
        cost: row.cost,
        missingRate: row.missingRate,
      };
    });
    for (const work of works) uomByWork.set(work.workItemId, work.uom);
    for (const line of estimate.lines) {
      unitRateByWork.set(
        line.workItemId,
        computeLine(
          { workItemId: line.workItemId, qty: 1 },
          recipesByWork.get(line.workItemId),
          mixesById,
          materialsById,
        ).totalCost,
      );
    }
  } else {
    lineCosts = frozenLineCosts(estimate.frozen.lineCosts, estimate.frozen.takeoff);
    takeoffRows = aggregateFrozenTakeoff(estimate.frozen.takeoff);
    for (const row of estimate.frozen.lineCosts) {
      uomByWork.set(row.workItemId, row.uom);
      // The frozen per-unit rate is derived, not stored: the arithmetic
      // is linear, so total ÷ quantity is exactly what it was.
      unitRateByWork.set(
        row.workItemId,
        row.totalCost === null || row.qty === 0 ? null : row.totalCost / row.qty,
      );
    }
  }
  takeoffRows.sort((a, b) => a.name.localeCompare(b.name));

  const totals = computeEstimateTotals(lineCosts);

  // The BOQ grouping: category vocabulary and order come from Masters.
  const categoryByWork = new Map(
    works.map((work) => [work.workItemId, { code: work.categoryCode, name: work.categoryName }]),
  );
  const categoryOrder = [...new Set(works.map((work) => work.categoryCode))];
  const boq = groupLineCosts(lineCosts, categoryByWork, categoryOrder);
  const lineByWork = new Map(estimate.lines.map((line) => [line.workItemId, line]));
  const setUpWorks = works.filter((work) => work.uom !== null && work.isActive);

  const part = (label: string, value: number | null) =>
    `${label} ${value === null ? "not priced yet" : formatMoney(value)}`;
  const missingBits = [
    totals.notSetUpCount > 0 &&
      `${totals.notSetUpCount} ${totals.notSetUpCount === 1 ? "work has" : "works have"} no setup`,
    totals.missingLabourCount > 0 &&
      `${totals.missingLabourCount} ${totals.missingLabourCount === 1 ? "work has" : "works have"} no labour rate`,
    totals.missingMaterialRateCount > 0 &&
      `${totals.missingMaterialRateCount} ${totals.missingMaterialRateCount === 1 ? "work uses a material" : "works use materials"} with no rate`,
  ].filter(Boolean);

  return (
    <div className="space-y-4">
      <PageTitle
        title={estimate.reference ? `${estimate.name} · ${estimate.reference}` : estimate.name}
        description={
          estimate.isTemplate
            ? `Template · ${estimate.projectName}`
            : `${estimate.unitName ?? "No villa"} · ${estimate.projectName}`
        }
        backHref="/estimator/estimates"
        backLabel="Estimates"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {estimate.isTemplate && <Badge variant="info">Template</Badge>}
            {estimate.status === "submitted" && <Badge variant="success">Official</Badge>}
            {estimate.status === "superseded" && <Badge variant="neutral">Superseded</Badge>}
            {isDraft && !estimate.isTemplate && <Badge variant="warning">Draft</Badge>}
            {isDraft && (
              <>
                <EstimateFormDialog projects={projects} units={units} estimate={estimate} />
                <DeleteEstimateButton estimateId={estimate.id} />
                {estimate.unitId && (
                  <SubmitEstimateButton
                    estimateId={estimate.id}
                    villaName={estimate.unitName ?? "this villa"}
                    hasLines={estimate.lines.length > 0}
                  />
                )}
              </>
            )}
            {estimate.status === "submitted" && <ReviseEstimateButton estimateId={estimate.id} />}
          </div>
        }
      />

      {estimate.status === "submitted" && (
        <p className="text-muted text-sm">
          The official estimate for {estimate.unitName} — submitted
          {estimate.submittedByName ? ` by ${estimate.submittedByName}` : ""} on{" "}
          {formatDate(estimate.submittedAt)}. Its numbers are frozen at that day&apos;s rates.
        </p>
      )}
      {estimate.status === "superseded" && (
        <p className="text-warning text-sm">
          Superseded on {formatDate(estimate.supersededAt)} — kept as history.
          {estimate.successor && (
            <>
              {" "}
              <Link
                className="underline underline-offset-2"
                href={`/estimator/estimates/${estimate.successor.id}`}
              >
                See what replaced it
              </Link>
              .
            </>
          )}
        </p>
      )}
      {isDraft && estimate.successor && (
        <p className="text-warning text-sm">
          A newer draft already revises this estimate —{" "}
          <Link
            className="underline underline-offset-2"
            href={`/estimator/estimates/${estimate.successor.id}`}
          >
            open it
          </Link>
          .
        </p>
      )}

      {estimate.sourceName && (
        <p className="text-muted text-sm">Copied from {estimate.sourceName}.</p>
      )}

      <Card className="space-y-2 p-5">
        <Figure
          label={
            estimate.lines.length === 0
              ? "Total"
              : !isDraft
                ? `Total, frozen ${formatDate(estimate.submittedAt)}`
                : totals.isComplete
                  ? "Total at today's rates"
                  : "Total so far"
          }
          value={estimate.lines.length === 0 ? formatMoney(null) : formatMoney(totals.grand)}
          hint={
            estimate.lines.length === 0
              ? "nothing on it yet"
              : `${part("Labour", totals.labour)} · ${part("Materials", totals.material)}`
          }
          tone={estimate.lines.length > 0 && !totals.isComplete ? "warn" : undefined}
          size="hero"
        />
        {missingBits.length > 0 && (
          <p className="text-warning text-sm">
            {missingBits.join(", ")}
            {isDraft
              ? " — the total counts only what is priced."
              : " — those were unpriced on the day of submit, so the frozen total counts only what was priced."}
          </p>
        )}
      </Card>

      <Card className="space-y-4 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-muted text-xs font-semibold tracking-widest uppercase">Works</p>
          {isDraft && <AddLineDialog estimateId={estimate.id} works={setUpWorks} />}
        </div>

        {estimate.lines.length === 0 ? (
          <p className="text-muted text-sm">Nothing on it yet — add the first work.</p>
        ) : (
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>Work</TableHeaderCell>
                <TableHeaderCell>Quantity</TableHeaderCell>
                <TableHeaderCell className="text-right">Rate</TableHeaderCell>
                <TableHeaderCell className="text-right">Amount</TableHeaderCell>
                {isDraft && <TableHeaderCell></TableHeaderCell>}
              </TableRow>
            </TableHead>
            <TableBody>
              {boq.map((group) => (
                <Fragment key={group.code || "uncategorised"}>
                  <TableRow>
                    <TableCell colSpan={3} className="text-foreground pt-4 text-sm font-semibold">
                      {group.code ? `${group.code} — ${group.name}` : group.name}
                    </TableCell>
                    <TableCell className="text-foreground pt-4 text-right text-sm font-semibold">
                      {formatMoney(group.totals.grand)}
                    </TableCell>
                    {isDraft && <TableCell></TableCell>}
                  </TableRow>
                  {group.lineCosts.map((cost) => {
                    const line = lineByWork.get(cost.workItemId);
                    if (!line) return null;
                    const uom = uomByWork.get(line.workItemId) ?? null;
                    return (
                      <TableRow key={line.id}>
                        <TableCell className="text-foreground text-sm">
                          {line.name}
                          <span className="text-muted ml-2 text-xs">{line.code}</span>
                          {line.note && (
                            <span className="text-muted block text-xs">{line.note}</span>
                          )}
                          {!cost.isSetUp && (
                            <Badge variant="warning" className="mt-1">
                              Not set up
                            </Badge>
                          )}
                          {cost.isSetUp && !cost.hasRecipe && (
                            <Badge variant="neutral" className="mt-1">
                              Labour only
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          {isDraft ? (
                            <div className="flex items-center gap-2">
                              <LineQtyField id={line.id} qty={line.qty} label={line.name} />
                              <span className="text-muted text-sm">{uom ?? ""}</span>
                            </div>
                          ) : (
                            <span className="text-foreground text-sm">
                              {formatQuantity(cost.qty)}{" "}
                              <span className="text-muted">{uom ?? ""}</span>
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          {formatMoney(unitRateByWork.get(line.workItemId) ?? null)}
                          {uom && <span className="text-muted text-xs"> / {uom}</span>}
                        </TableCell>
                        <TableCell className="text-foreground text-right font-medium">
                          {formatMoney(cost.totalCost)}
                        </TableCell>
                        {isDraft && (
                          <TableCell>
                            <RemoveLineButton id={line.id} label={line.name} />
                          </TableCell>
                        )}
                      </TableRow>
                    );
                  })}
                </Fragment>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      {takeoffRows.length > 0 && (
        <Card className="space-y-3 p-4">
          <div>
            <p className="text-muted text-xs font-semibold tracking-widest uppercase">
              Materials needed
            </p>
            <p className="text-muted mt-1 text-sm">
              {isDraft
                ? "Everything the works above consume, added up."
                : "Everything the works above consume, added up — quantities and rates as frozen on submit."}
            </p>
          </div>
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>Material</TableHeaderCell>
                <TableHeaderCell>Quantity</TableHeaderCell>
                <TableHeaderCell className="text-right">Rate</TableHeaderCell>
                <TableHeaderCell className="text-right">Cost</TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {takeoffRows.map((row) => (
                <TableRow key={row.materialId}>
                  <TableCell className="text-foreground font-medium">{row.name}</TableCell>
                  <TableCell>
                    {formatQuantity(row.quantity)} {row.uom}
                  </TableCell>
                  <TableCell className="text-right">
                    {row.missingRate ? (
                      <Badge variant="warning">Not priced</Badge>
                    ) : row.quantity > 0 ? (
                      formatMoney(row.cost === null ? null : row.cost / row.quantity)
                    ) : (
                      formatMoney(null)
                    )}
                  </TableCell>
                  <TableCell className="text-foreground text-right">
                    {formatMoney(row.cost)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      {comparison && (
        <Card className="space-y-3 p-4">
          <div>
            <p className="text-muted text-xs font-semibold tracking-widest uppercase">
              Reached the site
            </p>
            <p className="text-muted mt-1 text-sm">
              What has actually reached this villa — store issues and direct-to-site deliveries —
              per work, against what the estimate froze. Both name their work when they are
              recorded; that is what lines these up.
            </p>
          </div>
          {comparison.rows.every((row) => row.issued === 0) && comparison.unmatched.length === 0 ? (
            <p className="text-muted text-sm">Nothing issued to this villa yet.</p>
          ) : (
            <Table>
              <TableHead>
                <TableRow>
                  <TableHeaderCell>Work</TableHeaderCell>
                  <TableHeaderCell>Material</TableHeaderCell>
                  <TableHeaderCell className="text-right">Estimated</TableHeaderCell>
                  <TableHeaderCell className="text-right">Issued</TableHeaderCell>
                  <TableHeaderCell></TableHeaderCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {comparison.rows
                  .filter((row) => row.issued !== 0 || row.over)
                  .map((row) => {
                    const work = works.find((w) => w.workItemId === row.workItemId);
                    return (
                      <TableRow key={`${row.workItemId}-${row.materialId}`}>
                        <TableCell className="text-sm">
                          {work ? `${work.code} — ${work.name}` : "—"}
                        </TableCell>
                        <TableCell className="text-foreground text-sm">
                          {row.materialName}
                        </TableCell>
                        <TableCell className="text-right text-sm whitespace-nowrap">
                          {formatQuantity(row.estimated)} {row.uom}
                        </TableCell>
                        <TableCell className="text-right text-sm whitespace-nowrap">
                          {row.issued !== null
                            ? `${formatQuantity(row.issued)} ${row.uom}`
                            : row.issuedRaw
                              ? `${formatQuantity(row.issuedRaw.quantity)} ${row.issuedRaw.uom} (no conversion set)`
                              : "—"}
                        </TableCell>
                        <TableCell>
                          {row.over && <Badge variant="warning">Past the estimate</Badge>}
                        </TableCell>
                      </TableRow>
                    );
                  })}
              </TableBody>
            </Table>
          )}
          {comparison.unmatched.length > 0 && issuedData && (
            <p className="text-muted text-sm">
              Also issued to this villa, but not tagged to a work the estimate names:{" "}
              {comparison.unmatched
                .map(
                  (row) =>
                    `${issuedData.itemNamesById.get(row.itemId) ?? "an item"} × ${formatQuantity(row.quantity)}`,
                )
                .join(", ")}
              .
            </p>
          )}
        </Card>
      )}
    </div>
  );
}
