import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from "@/components/ui/table";
import { frozenRateBuildUp } from "@/lib/estimator/calc";
import type {
  EstimateDetail,
  EstimateVariations,
  getEstimateMeasurements,
} from "@/lib/estimator/estimate-queries";
import type { EstimateView } from "@/lib/estimator/estimate-view";
import { formatMoney, formatQuantity } from "@/lib/format";
import Link from "next/link";
import { Fragment } from "react";
import { AddWorksDialog, LineQtyField, RemoveLineButton } from "./line-forms";
import { MeasurementSheetDialog } from "./measurement-forms";
import { FrozenRateDialog, LineRateDialog } from "./rate-forms";

/** The bill of quantities: works under their categories, a subtotal per category. */
export function EstimateWorks({
  estimate,
  view,
  variations,
  measurements,
  canEditMasters,
}: {
  estimate: EstimateDetail;
  view: EstimateView;
  variations: EstimateVariations;
  measurements: Awaited<ReturnType<typeof getEstimateMeasurements>>;
  canEditMasters: boolean;
}) {
  const {
    isDraft,
    boq,
    lineByWork,
    uomByWork,
    unitRateByWork,
    rateViewFor,
    rateOptions,
    frozenLineByWork,
    frozenNameById,
    pickableWorks,
  } = view;
  // After submit the sheets stay openable, read-only, as the record of where each quantity came from.
  const showSheetColumn = !isDraft && measurements.size > 0;
  return (
    <Card className="space-y-4 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-muted text-[11px] font-medium tracking-[0.14em] uppercase">Works</p>
        {isDraft && (
          <AddWorksDialog
            estimateId={estimate.id}
            works={pickableWorks}
            onEstimate={estimate.lines.map((line) => line.workItemId)}
          />
        )}
      </div>

      {estimate.lines.length === 0 ? (
        <p className="text-muted text-sm">
          Nothing on it yet — Add works to list what this villa needs, then measure each one.
        </p>
      ) : (
        <Table>
          <TableHead>
            <TableRow>
              <TableHeaderCell>Work</TableHeaderCell>
              <TableHeaderCell>Quantity</TableHeaderCell>
              <TableHeaderCell className="text-right">Rate</TableHeaderCell>
              <TableHeaderCell className="text-right">Amount</TableHeaderCell>
              {(isDraft || showSheetColumn) && <TableHeaderCell></TableHeaderCell>}
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
                  {(isDraft || showSheetColumn) && <TableCell></TableCell>}
                </TableRow>
                {group.lineCosts.map((cost) => {
                  const line = lineByWork.get(cost.workItemId);
                  if (!line) return null;
                  const uom = uomByWork.get(line.workItemId) ?? null;
                  const sheet = measurements.get(line.id);
                  return (
                    <TableRow key={line.id}>
                      <TableCell className="text-foreground text-sm">
                        {line.name}
                        <span className="text-muted ml-2 text-xs">{line.code}</span>
                        {line.note && <span className="text-muted block text-xs">{line.note}</span>}
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
                        {isDraft &&
                          (variations.byLine.has(line.id) || line.labourRate !== null) && (
                            <Badge variant="info" className="mt-1 ml-1">
                              This villa&apos;s own rate
                            </Badge>
                          )}
                      </TableCell>
                      <TableCell>
                        {isDraft && !sheet ? (
                          <div className="flex items-center gap-2">
                            <LineQtyField id={line.id} qty={line.qty} label={line.name} />
                            <span className="text-muted text-sm">{uom ?? ""}</span>
                          </div>
                        ) : sheet ? (
                          <span className="text-foreground text-sm">
                            {formatQuantity(cost.qty)}{" "}
                            <span className="text-muted">{uom ?? ""}</span>
                            <span className="text-muted block text-xs">
                              From {sheet.length}{" "}
                              {sheet.length === 1 ? "measurement" : "measurements"}
                              {sheet.some((row) => row.fromModel) &&
                                (sheet.every((row) => row.fromModel)
                                  ? ", all from the model"
                                  : `, ${sheet.filter((row) => row.fromModel).length} from the model`)}
                            </span>
                          </span>
                        ) : (
                          <span className="text-foreground text-sm">
                            {formatQuantity(cost.qty)}{" "}
                            <span className="text-muted">{uom ?? ""}</span>
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        {!cost.isSetUp ? (
                          <Link
                            href={`/estimator/works/${line.workItemId}`}
                            className="text-warning underline underline-offset-4"
                          >
                            Set up in the rate book
                          </Link>
                        ) : isDraft ? (
                          <LineRateDialog
                            estimateId={estimate.id}
                            view={rateViewFor(line, uom)}
                            options={rateOptions}
                            canEditMasters={canEditMasters}
                          />
                        ) : frozenLineByWork.has(line.workItemId) ? (
                          (() => {
                            const frozen = frozenRateBuildUp(
                              frozenLineByWork.get(line.workItemId)!,
                              estimate.frozen?.takeoff ?? [],
                            );
                            return (
                              <FrozenRateDialog
                                workName={line.name}
                                workUom={uom}
                                labourRate={frozen.labourRate}
                                rate={frozen.rate}
                                prices={frozen.materials.map((row) => ({
                                  name: frozenNameById.get(row.materialId)?.name ?? "Material",
                                  uom: frozenNameById.get(row.materialId)?.uom ?? "",
                                  qtyPerUnit: row.qtyPerUnit,
                                  price: row.price,
                                  cost: row.cost,
                                }))}
                              />
                            );
                          })()
                        ) : (
                          <>
                            {formatMoney(unitRateByWork.get(line.workItemId) ?? null)}
                            {uom && <span className="text-muted text-xs"> / {uom}</span>}
                          </>
                        )}
                      </TableCell>
                      <TableCell className="text-foreground text-right font-medium">
                        {formatMoney(cost.totalCost)}
                      </TableCell>
                      {isDraft && (
                        <TableCell>
                          <div className="flex items-center justify-end gap-1">
                            <MeasurementSheetDialog
                              lineId={line.id}
                              workName={line.name}
                              workUom={uom}
                              rows={sheet ?? []}
                              readOnly={false}
                              otherLines={estimate.lines
                                .filter((other) => other.id !== line.id)
                                .map((other) => ({
                                  id: other.id,
                                  name: other.name,
                                  uom: uomByWork.get(other.workItemId) ?? null,
                                }))}
                            />
                            <RemoveLineButton id={line.id} label={line.name} />
                          </div>
                        </TableCell>
                      )}
                      {showSheetColumn && (
                        <TableCell className="text-right">
                          {sheet && (
                            <MeasurementSheetDialog
                              lineId={line.id}
                              workName={line.name}
                              workUom={uom}
                              rows={sheet}
                              readOnly
                            />
                          )}
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
  );
}
