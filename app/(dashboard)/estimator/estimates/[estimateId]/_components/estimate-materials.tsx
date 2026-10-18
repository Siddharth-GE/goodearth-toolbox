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
import type { EstimateDetail, EstimateVariations } from "@/lib/estimator/estimate-queries";
import type { EstimateView } from "@/lib/estimator/estimate-view";
import { formatMoney, formatQuantity } from "@/lib/format";
import { VillaPriceField } from "./rate-forms";

/** Everything the works consume, added up. */
export function EstimateMaterials({
  estimate,
  view,
  variations,
}: {
  estimate: EstimateDetail;
  view: EstimateView;
  variations: EstimateVariations;
}) {
  const { isDraft, takeoffRows, standardRateById } = view;
  return (
    <Card className="space-y-3 p-4">
      <div>
        <p className="text-muted text-[11px] font-medium tracking-[0.14em] uppercase">
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
                {isDraft ? (
                  <VillaPriceField
                    estimateId={estimate.id}
                    itemId={row.materialId}
                    villaPrice={variations.rateByMaterialId.get(row.materialId) ?? null}
                    mastersPrice={standardRateById.get(row.materialId) ?? null}
                    label={row.name}
                  />
                ) : row.missingRate ? (
                  <Badge variant="warning">Not priced</Badge>
                ) : row.quantity > 0 ? (
                  formatMoney(row.cost === null ? null : row.cost / row.quantity)
                ) : (
                  formatMoney(null)
                )}
              </TableCell>
              <TableCell className="text-foreground text-right">{formatMoney(row.cost)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  );
}
