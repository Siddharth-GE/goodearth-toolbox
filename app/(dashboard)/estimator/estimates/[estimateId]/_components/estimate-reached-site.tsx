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
import type { compareIssuesToEstimate } from "@/lib/estimator/compare";
import type {
  getIssuedAgainstEstimate,
  getReconciliationApprovals,
} from "@/lib/estimator/estimate-queries";
import type { WorkStatusRow } from "@/lib/estimator/works-queries";
import { formatDate, formatQuantity } from "@/lib/format";
import Link from "next/link";
import { ApproveReconciliationButton } from "./reconciliation-forms";

type Approval = Awaited<ReturnType<typeof getReconciliationApprovals>>[number];

/** What reached the villa against what the official estimate froze; unplanned arrivals need approval (0083). */
export function EstimateReachedSite({
  estimateId,
  comparison,
  issuedData,
  works,
  approvalByKey,
}: {
  estimateId: string;
  comparison: ReturnType<typeof compareIssuesToEstimate>;
  issuedData: Awaited<ReturnType<typeof getIssuedAgainstEstimate>>;
  works: WorkStatusRow[];
  approvalByKey: Map<string, Approval>;
}) {
  return (
    <Card className="space-y-3 p-4">
      <div>
        <p className="text-muted text-[11px] font-medium tracking-[0.14em] uppercase">
          Reached the site
        </p>
        <p className="text-muted mt-1 text-sm">
          What has actually reached this villa — store issues and direct-to-site deliveries — per
          work, against what the estimate froze. Both name their work when they are recorded; that
          is what lines these up. Every villa at once is in{" "}
          <Link className="underline underline-offset-2" href="/estimator/site-check">
            Site check
          </Link>
          .
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
                  <TableRow key={`${row.workItemId}-${row.itemId ?? row.materialName}`}>
                    <TableCell className="text-sm">
                      {work ? `${work.code} — ${work.name}` : "—"}
                    </TableCell>
                    <TableCell className="text-foreground text-sm">{row.materialName}</TableCell>
                    <TableCell className="text-right text-sm whitespace-nowrap">
                      {formatQuantity(row.estimated)} {row.uom}
                    </TableCell>
                    <TableCell className="text-right text-sm whitespace-nowrap">
                      {row.issued !== null ? (
                        `${formatQuantity(row.issued)} ${row.uom}`
                      ) : (
                        <span className="text-muted">
                          Not compared — from before materials were items
                        </span>
                      )}
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
        <div className="border-border space-y-2 border-t pt-3">
          <p className="text-muted text-[11px] font-medium tracking-[0.14em] uppercase">
            Outside the estimate
          </p>
          <p className="text-muted text-sm">
            This material reached the villa but the official estimate never planned it — a direct
            purchase, or an issue for a work the estimate does not pair it with. Each entry needs an
            estimator&apos;s approval, and it stays here with its flag permanently either way.
          </p>
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>Work</TableHeaderCell>
                <TableHeaderCell>Item</TableHeaderCell>
                <TableHeaderCell className="text-right">Reached the site</TableHeaderCell>
                <TableHeaderCell></TableHeaderCell>
                <TableHeaderCell></TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {comparison.unmatched.map((row) => {
                const work = row.workItemId
                  ? works.find((w) => w.workItemId === row.workItemId)
                  : null;
                const workName = work ? `${work.code} — ${work.name}` : null;
                const itemName = issuedData.itemNamesById.get(row.itemId) ?? "An item";
                const approval = approvalByKey.get(`${row.workItemId ?? ""} ${row.itemId}`);
                return (
                  <TableRow key={`${row.workItemId ?? "untagged"}-${row.itemId}`}>
                    <TableCell className="text-sm">{workName ?? "Not tagged to a work"}</TableCell>
                    <TableCell className="text-foreground text-sm">{itemName}</TableCell>
                    <TableCell className="text-right text-sm whitespace-nowrap">
                      {formatQuantity(row.quantity)} {issuedData.itemUomById.get(row.itemId) ?? ""}
                    </TableCell>
                    <TableCell>
                      <Badge variant="warning">Outside the estimate</Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      {approval ? (
                        <span className="text-muted text-xs">
                          Approved by {approval.approvedByName} on {formatDate(approval.approvedAt)}
                          {approval.note ? ` — ${approval.note}` : ""}
                        </span>
                      ) : (
                        <ApproveReconciliationButton
                          estimateId={estimateId}
                          itemId={row.itemId}
                          workItemId={row.workItemId}
                          itemName={itemName}
                          workName={workName}
                        />
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </Card>
  );
}
