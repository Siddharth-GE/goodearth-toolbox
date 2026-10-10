import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { PageTitle } from "@/components/ui/page-title";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from "@/components/ui/table";
import { CASH_REQUEST_STATUS_LABEL, type CashRequestStatus } from "@/lib/bills/ledger";
import { listCashRequests } from "@/lib/bills/payment-queries";
import { formatCount, formatDate, formatMoney } from "@/lib/format";
import { Wallet } from "lucide-react";
import Link from "next/link";
import { StartRequest } from "./_components/start-request";

const STATUS_VARIANT: Record<CashRequestStatus, "neutral" | "warning" | "info" | "success"> = {
  draft: "neutral",
  submitted: "warning",
  released: "info",
  closed: "success",
};

/**
 * The weekly cash request (0107, plan.md B8): accounts lists the bills
 * and advances to pay this week, a bill approver releases it (cutting
 * amounts if they choose), then each payment is recorded against it.
 */
export default async function CashRequestsPage() {
  const requests = await listCashRequests();

  return (
    <div className="space-y-4">
      <PageTitle
        title="Cash requests"
        backHref="/bills"
        backLabel="Bills"
        description="Each week's list of bills and advances to pay — asked for by accounts, released by a bill approver, then paid line by line."
      />

      <StartRequest />

      {requests.length === 0 ? (
        <EmptyState
          icon={Wallet}
          title="No cash requests yet"
          description="Start one for this week: add the approved bills and any advances to pay, then submit it to a bill approver."
        />
      ) : (
        <Table>
          <TableHead>
            <TableRow>
              <TableHeaderCell>Week of</TableHeaderCell>
              <TableHeaderCell>Status</TableHeaderCell>
              <TableHeaderCell className="text-right">Lines</TableHeaderCell>
              <TableHeaderCell className="text-right">Asked for</TableHeaderCell>
              <TableHeaderCell className="text-right">Released</TableHeaderCell>
              <TableHeaderCell className="text-right">Paid</TableHeaderCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {requests.map((request) => (
              <TableRow key={request.id}>
                <TableCell className="font-medium">
                  <Link
                    href={`/bills/cash-requests/${request.id}`}
                    className="text-accent hover:underline"
                  >
                    {formatDate(request.week_of)}
                  </Link>
                </TableCell>
                <TableCell>
                  <Badge variant={STATUS_VARIANT[request.status]}>
                    {CASH_REQUEST_STATUS_LABEL[request.status]}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">{formatCount(request.item_count)}</TableCell>
                <TableCell className="text-right font-mono">
                  {formatMoney(request.requested)}
                </TableCell>
                <TableCell className="text-right font-mono">
                  {request.status === "draft" || request.status === "submitted"
                    ? "—"
                    : formatMoney(request.released)}
                </TableCell>
                <TableCell className="text-right font-mono">{formatMoney(request.paid)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
