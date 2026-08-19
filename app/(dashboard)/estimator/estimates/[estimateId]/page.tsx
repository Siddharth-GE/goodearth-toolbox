import { Badge } from "@/components/ui/badge";
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
  computeEstimateTotals,
  computeLine,
  computeTakeoff,
  type MaterialDef,
  type MixDef,
  type WorkRecipe,
} from "@/lib/estimator/calc";
import { getEstimate, getRecipeBook, listWorkStatus } from "@/lib/estimator/queries";
import { formatMoney, formatQuantity } from "@/lib/format";
import { notFound } from "next/navigation";
import { EstimateFormDialog, DeleteEstimateButton } from "../_components/estimate-forms";
import { AddLineForm, LineQtyField, RemoveLineButton } from "./_components/line-forms";
import { listProjects } from "@/lib/masters/projects";
import { listUnits } from "@/lib/masters/units";

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

  // One calculator for the whole tool: the per-line costs, the totals and
  // the takeoff all come out of lib/estimator/calc.ts, so they can never
  // disagree with each other or with the per-work figure on the Works tab.
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
  const costByWork = new Map(lineCosts.map((cost) => [cost.workItemId, cost]));
  const totals = computeEstimateTotals(lineCosts);
  const takeoff = computeTakeoff(lineInputs, recipesByWork, mixesById, materialsById)
    .map((row) => ({ ...row, material: materialsById.get(row.materialId) }))
    .sort((a, b) => (a.material?.name ?? "").localeCompare(b.material?.name ?? ""));

  const uomByWork = new Map(works.map((work) => [work.workItemId, work.uom]));
  const setUpWorks = works.filter((work) => work.uom !== null && work.isActive);

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

      <FigureBand className="sm:grid-cols-3 lg:grid-cols-3">
        <FigureBandCell>
          <Figure
            label="Labour"
            value={formatMoney(totals.labour)}
            hint={
              totals.missingLabourCount > 0
                ? `${totals.missingLabourCount} work${totals.missingLabourCount === 1 ? "" : "s"} unpriced`
                : undefined
            }
            tone={totals.missingLabourCount > 0 ? "warn" : undefined}
            size="lg"
          />
        </FigureBandCell>
        <FigureBandCell>
          <Figure
            label="Materials"
            value={formatMoney(totals.material)}
            hint={
              totals.missingMaterialRateCount > 0
                ? `${totals.missingMaterialRateCount} line${totals.missingMaterialRateCount === 1 ? "" : "s"} unpriced`
                : undefined
            }
            tone={totals.missingMaterialRateCount > 0 ? "warn" : undefined}
            size="lg"
          />
        </FigureBandCell>
        <FigureBandCell>
          <Figure
            label={totals.isComplete ? "Total" : "Total so far"}
            value={formatMoney(totals.grand)}
            hint={
              totals.isComplete
                ? "at today's rates"
                : "some rates are missing — this is a floor, not the answer"
            }
            tone={totals.isComplete ? undefined : "warn"}
            size="hero"
          />
        </FigureBandCell>
      </FigureBand>

      {!totals.isComplete && (
        <Card className="p-4">
          <p className="text-warning text-sm">
            This estimate is not fully priced.
            {totals.notSetUpCount > 0 &&
              ` ${totals.notSetUpCount} work${totals.notSetUpCount === 1 ? " has" : "s have"} no setup at all.`}
            {totals.missingLabourCount > 0 &&
              ` ${totals.missingLabourCount} ${totals.missingLabourCount === 1 ? "has" : "have"} no labour rate.`}
            {totals.missingMaterialRateCount > 0 &&
              ` ${totals.missingMaterialRateCount} ${totals.missingMaterialRateCount === 1 ? "uses a material" : "use materials"} with no rate.`}{" "}
            The totals above count only what is priced.
          </p>
        </Card>
      )}

      <Card className="space-y-4 p-4">
        <div>
          <p className="text-muted text-xs font-semibold tracking-widest uppercase">Works</p>
          <p className="text-muted mt-1 text-sm">
            {estimate.isTemplate
              ? "What this standard villa needs, and what each work costs at today's rates."
              : "What this villa needs, and what each work costs at today's rates."}
          </p>
        </div>

        <AddLineForm estimateId={estimate.id} works={setUpWorks} />

        {estimate.lines.length === 0 ? (
          <p className="text-muted text-sm">Nothing on it yet — add the first work above.</p>
        ) : (
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell className="w-24">Code</TableHeaderCell>
                <TableHeaderCell>Work</TableHeaderCell>
                <TableHeaderCell>Quantity</TableHeaderCell>
                <TableHeaderCell>Labour</TableHeaderCell>
                <TableHeaderCell>Materials</TableHeaderCell>
                <TableHeaderCell>Total</TableHeaderCell>
                <TableHeaderCell></TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {estimate.lines.map((line) => {
                const cost = costByWork.get(line.workItemId);
                const uom = uomByWork.get(line.workItemId) ?? null;
                return (
                  <TableRow key={line.id}>
                    <TableCell className="text-muted text-sm">{line.code}</TableCell>
                    <TableCell className="text-foreground text-sm">
                      {line.name}
                      {line.note && <span className="text-muted block text-xs">{line.note}</span>}
                      {cost && !cost.isSetUp && (
                        <Badge variant="warning" className="mt-1">
                          Not set up
                        </Badge>
                      )}
                      {cost?.isSetUp && !cost.hasRecipe && (
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
                    <TableCell>{formatMoney(cost?.labourCost ?? null)}</TableCell>
                    <TableCell>{formatMoney(cost?.materialCost ?? null)}</TableCell>
                    <TableCell className="text-foreground font-medium">
                      {formatMoney(cost?.totalCost ?? null)}
                    </TableCell>
                    <TableCell>
                      <RemoveLineButton id={line.id} label={line.name} />
                    </TableCell>
                  </TableRow>
                );
              })}
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
            <p className="text-muted mt-1 text-sm">
              Everything the works above consume, added up — mixes expanded into what they are made
              of.
            </p>
          </div>
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>Material</TableHeaderCell>
                <TableHeaderCell>Quantity</TableHeaderCell>
                <TableHeaderCell>Rate</TableHeaderCell>
                <TableHeaderCell>Cost</TableHeaderCell>
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
                  <TableCell>
                    {row.missingRate ? (
                      <Badge variant="warning">Not priced</Badge>
                    ) : (
                      formatMoney(row.material?.rate ?? null)
                    )}
                  </TableCell>
                  <TableCell className="text-foreground">{formatMoney(row.cost)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}
