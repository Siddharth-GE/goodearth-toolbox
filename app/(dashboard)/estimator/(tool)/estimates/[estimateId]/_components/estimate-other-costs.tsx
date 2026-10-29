import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableFoot,
  TableHead,
  TableHeaderCell,
  TableRow,
  TableTotalCell,
} from "@/components/ui/table";
import type { EstimateDetail } from "@/lib/estimator/estimate-queries";
import { otherCostAmount, type EstimateView } from "@/lib/estimator/estimate-view";
import { formatMoney, formatQuantity } from "@/lib/format";
import { DeleteOtherCostButton, OtherCostDialog } from "./other-cost-forms";

/** What the rate book has no work for (0174): the model's allowances at the plugin's rates, and costs typed here. */
export function EstimateOtherCosts({
  estimate,
  view,
}: {
  estimate: EstimateDetail;
  view: EstimateView;
}) {
  const { isDraft, other } = view;
  if (estimate.otherCosts.length === 0 && !isDraft) return null;
  return (
    <Card className="space-y-3 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-muted text-[11px] font-medium tracking-[0.14em] uppercase">
            Other costs
          </p>
          <p className="text-muted mt-1 text-sm">
            What the rate book has no work for: MEP materials, hardware, the site. The model&apos;s
            come from its project settings and change only when it is sent again; typed ones stay.
            None of these reach Indents.
          </p>
        </div>
        {isDraft && <OtherCostDialog estimateId={estimate.id} />}
      </div>
      {estimate.otherCosts.length === 0 ? (
        <p className="text-muted text-sm">None yet.</p>
      ) : (
        <Table>
          <TableHead>
            <TableRow>
              <TableHeaderCell>Cost</TableHeaderCell>
              <TableHeaderCell>Quantity</TableHeaderCell>
              <TableHeaderCell className="text-right">Rate</TableHeaderCell>
              <TableHeaderCell className="text-right">Amount</TableHeaderCell>
              {isDraft && <TableHeaderCell className="sr-only">Change</TableHeaderCell>}
            </TableRow>
          </TableHead>
          <TableBody>
            {estimate.otherCosts.map((cost) => {
              const amount = otherCostAmount(cost);
              return (
                <TableRow key={cost.id}>
                  <TableCell>
                    <span className="text-foreground font-medium">
                      {cost.code ? `${cost.code} · ` : ""}
                      {cost.name}
                    </span>
                    <span className="text-muted mt-0.5 flex flex-wrap items-center gap-2 text-xs">
                      {cost.fromModel ? (
                        <Badge variant="info">Model</Badge>
                      ) : (
                        <Badge variant="neutral">Typed</Badge>
                      )}
                      {cost.note}
                    </span>
                  </TableCell>
                  <TableCell>
                    {cost.qty === null ? "—" : `${formatQuantity(cost.qty)} ${cost.unit ?? ""}`}
                  </TableCell>
                  <TableCell className="text-right">
                    {cost.rate === null ? (
                      <Badge variant="warning">No rate</Badge>
                    ) : (
                      formatMoney(cost.rate)
                    )}
                  </TableCell>
                  <TableCell className="text-foreground text-right">
                    {formatMoney(amount)}
                  </TableCell>
                  {isDraft && (
                    <TableCell className="text-right whitespace-nowrap">
                      {!cost.fromModel && (
                        <>
                          <OtherCostDialog estimateId={estimate.id} cost={cost} />
                          <DeleteOtherCostButton cost={cost} />
                        </>
                      )}
                    </TableCell>
                  )}
                </TableRow>
              );
            })}
          </TableBody>
          <TableFoot>
            <TableRow>
              <TableTotalCell colSpan={3}>
                Other costs{other.unpriced > 0 ? ` — ${other.unpriced} not priced yet` : ""}
              </TableTotalCell>
              <TableTotalCell className="text-right">{formatMoney(other.amount)}</TableTotalCell>
              {isDraft && <TableTotalCell />}
            </TableRow>
          </TableFoot>
        </Table>
      )}
    </Card>
  );
}
