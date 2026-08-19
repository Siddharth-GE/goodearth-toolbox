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
  computeEstimateTotals,
  computeLine,
  computeTakeoff,
  groupLineCosts,
  type MaterialDef,
  type MixDef,
  type WorkRecipe,
} from "@/lib/estimator/calc";
import { getEstimate, getRecipeBook, listWorkStatus } from "@/lib/estimator/queries";
import { formatMoney, formatQuantity } from "@/lib/format";
import { notFound } from "next/navigation";
import { Fragment } from "react";
import { EstimateFormDialog, DeleteEstimateButton } from "../_components/estimate-forms";
import { AddLineDialog, LineQtyField, RemoveLineButton } from "./_components/line-forms";
import { listProjects } from "@/lib/masters/projects";
import { listUnits } from "@/lib/masters/units";

// The estimate reads as a BOQ, because that is the document an
// estimator already knows: works gathered under their categories, one
// amount per line, a subtotal per category, the grand total on top. A
// future PDF export prints groupLineCosts' output — the same structure
// this page renders, never a second grouping.
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

  // One calculator for the whole tool: per-line costs, per-unit rates,
  // category subtotals, estimate totals and the takeoff all come out of
  // lib/estimator/calc.ts, so they can never disagree with each other.
  const materialsById = new Map<string, MaterialDef>(book.materials.map((m) => [m.id, m]));
  const mixesById = new Map<string, MixDef>(book.mixes.map((m) => [m.id, m]));
  const recipesByWork = new Map<string, WorkRecipe>(book.recipes.map((r) => [r.workItemId, r]));

  const lineInputs = estimate.lines.map((line) => ({
    workItemId: line.workItemId,
    qty: line.qty,
  }));
  const lineCosts = lineInputs.map((line) =>
    computeLine(line, recipesByWork.get(line.workItemId), mixesById, materialsById),
  );
  const totals = computeEstimateTotals(lineCosts);
  const takeoff = computeTakeoff(lineInputs, recipesByWork, mixesById, materialsById)
    .map((row) => ({ ...row, material: materialsById.get(row.materialId) }))
    .sort((a, b) => (a.material?.name ?? "").localeCompare(b.material?.name ?? ""));

  // The BOQ grouping: category vocabulary and order come from Masters.
  const categoryByWork = new Map(
    works.map((work) => [work.workItemId, { code: work.categoryCode, name: work.categoryName }]),
  );
  const categoryOrder = [...new Set(works.map((work) => work.categoryCode))];
  const boq = groupLineCosts(lineCosts, categoryByWork, categoryOrder);
  const lineByWork = new Map(estimate.lines.map((line) => [line.workItemId, line]));
  const uomByWork = new Map(works.map((work) => [work.workItemId, work.uom]));
  const setUpWorks = works.filter((work) => work.uom !== null && work.isActive);

  // A work's rate per one unit, from the same calculator as everything
  // else — the Amount column is always rate × quantity, visibly.
  const unitRateByWork = new Map(
    estimate.lines.map((line) => [
      line.workItemId,
      computeLine(
        { workItemId: line.workItemId, qty: 1 },
        recipesByWork.get(line.workItemId),
        mixesById,
        materialsById,
      ).totalCost,
    ]),
  );

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
        title={estimate.name}
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
            <EstimateFormDialog projects={projects} units={units} estimate={estimate} />
            <DeleteEstimateButton estimateId={estimate.id} />
          </div>
        }
      />

      {estimate.sourceName && (
        <p className="text-muted text-sm">Copied from {estimate.sourceName}.</p>
      )}

      <Card className="space-y-2 p-5">
        <Figure
          label={
            estimate.lines.length === 0
              ? "Total"
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
            {missingBits.join(", ")} — the total counts only what is priced.
          </p>
        )}
      </Card>

      <Card className="space-y-4 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-muted text-xs font-semibold tracking-widest uppercase">Works</p>
          <AddLineDialog estimateId={estimate.id} works={setUpWorks} />
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
                <TableHeaderCell></TableHeaderCell>
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
                    <TableCell></TableCell>
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
                          <div className="flex items-center gap-2">
                            <LineQtyField id={line.id} qty={line.qty} label={line.name} />
                            <span className="text-muted text-sm">{uom ?? ""}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          {formatMoney(unitRateByWork.get(line.workItemId) ?? null)}
                          {uom && <span className="text-muted text-xs"> / {uom}</span>}
                        </TableCell>
                        <TableCell className="text-foreground text-right font-medium">
                          {formatMoney(cost.totalCost)}
                        </TableCell>
                        <TableCell>
                          <RemoveLineButton id={line.id} label={line.name} />
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </Fragment>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      {takeoff.length > 0 && (
        <Card className="space-y-3 p-4">
          <div>
            <p className="text-muted text-xs font-semibold tracking-widest uppercase">
              Materials needed
            </p>
            <p className="text-muted mt-1 text-sm">Everything the works above consume, added up.</p>
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
              {takeoff.map((row) => (
                <TableRow key={row.materialId}>
                  <TableCell className="text-foreground font-medium">
                    {row.material?.name ?? "Unknown material"}
                  </TableCell>
                  <TableCell>
                    {formatQuantity(row.quantity)} {row.material?.uom ?? ""}
                  </TableCell>
                  <TableCell className="text-right">
                    {row.missingRate ? (
                      <Badge variant="warning">Not priced</Badge>
                    ) : (
                      formatMoney(row.material?.rate ?? null)
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
    </div>
  );
}
