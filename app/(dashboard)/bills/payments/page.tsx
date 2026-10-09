import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { ListToolbar } from "@/components/ui/list-toolbar";
import { PageTitle } from "@/components/ui/page-title";
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
import { listPaymentsLedger } from "@/lib/bills/payment-queries";
import { formatCount, formatDate, formatMoney } from "@/lib/format";
import { dateParam, idParam, searchParam } from "@/lib/list-params";
import { listProjects } from "@/lib/masters/projects";
import { listVendors } from "@/lib/masters/vendors";
import { Banknote } from "lucide-react";
import Link from "next/link";

const KIND: Record<
  "payment" | "advance" | "recovery",
  { label: string; variant: "neutral" | "info" | "warning" }
> = {
  payment: { label: "Payment", variant: "neutral" },
  advance: { label: "Advance", variant: "info" },
  recovery: { label: "Recovered", variant: "warning" },
};

/**
 * Every rupee out (0107, plan.md B8): payments against bills, advances
 * to contractors, and advances recovered from bills — searchable,
 * filtered, and summed over every match (the A4 bar).
 */
export default async function PaymentsPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    vendor?: string;
    project?: string;
    from?: string;
    to?: string;
  }>;
}) {
  const raw = await searchParams;
  const q = searchParam(raw.q);
  const vendor = idParam(raw.vendor);
  const project = idParam(raw.project);
  const from = dateParam(raw.from);
  const to = dateParam(raw.to);

  const [rows, vendors, projects] = await Promise.all([
    listPaymentsLedger({ q, vendorId: vendor, projectId: project, from, to }),
    listVendors(),
    listProjects(),
  ]);
  const paid = rows
    .filter((row) => row.kind === "payment")
    .reduce((sum, row) => sum + row.amount, 0);
  const advanced = rows
    .filter((row) => row.kind === "advance")
    .reduce((sum, row) => sum + row.amount, 0);
  const recovered = rows
    .filter((row) => row.kind === "recovery")
    .reduce((sum, row) => sum + row.amount, 0);
  const filtered = Boolean(q || vendor || project || from || to);

  return (
    <div className="space-y-4">
      <PageTitle
        title="Payments"
        backHref="/bills"
        backLabel="Bills"
        description="Every payment against a bill, every advance to a contractor, and every advance recovered from a bill."
      />

      <ListToolbar
        action="/bills/payments"
        values={{ q, vendor, project, from, to }}
        search={{ placeholder: "UTR or reference, vendor, bill number…" }}
        dates={{ label: "Paid" }}
        filters={[
          {
            param: "vendor",
            label: "Vendor / contractor",
            allLabel: "Everyone",
            options: vendors.map((row) => ({ value: row.id, label: row.name })),
          },
          {
            param: "project",
            label: "Project",
            allLabel: "All projects",
            options: projects.map((row) => ({ value: row.id, label: row.name })),
          },
        ]}
      />

      {rows.length === 0 ? (
        <EmptyState
          icon={Banknote}
          title={filtered ? "Nothing matches these filters" : "Nothing paid yet"}
          description={
            filtered
              ? undefined
              : "Payments are recorded on an approved bill, or line by line on a released cash request."
          }
        />
      ) : (
        <Table>
          <TableHead>
            <TableRow>
              <TableHeaderCell>On</TableHeaderCell>
              <TableHeaderCell>What</TableHeaderCell>
              <TableHeaderCell>To</TableHeaderCell>
              <TableHeaderCell>Bill</TableHeaderCell>
              <TableHeaderCell>Reference</TableHeaderCell>
              <TableHeaderCell className="text-right">Amount</TableHeaderCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={`${row.kind}-${row.id}`}>
                <TableCell className="whitespace-nowrap">{formatDate(row.on)}</TableCell>
                <TableCell>
                  <Badge variant={KIND[row.kind].variant}>{KIND[row.kind].label}</Badge>
                </TableCell>
                <TableCell>
                  {row.vendor_name}
                  <div className="text-muted text-xs">{row.project_name}</div>
                </TableCell>
                <TableCell className="font-mono text-xs">
                  {row.bill_id ? (
                    <Link href={`/bills/${row.bill_id}`} className="text-accent hover:underline">
                      {row.bill_reference}
                    </Link>
                  ) : (
                    "—"
                  )}
                </TableCell>
                <TableCell className="text-muted font-mono text-xs">{row.reference}</TableCell>
                <TableCell className="text-right font-mono">
                  {formatMoney(row.amount, { paise: true })}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
          <TableFoot>
            <TableRow>
              <TableTotalCell colSpan={5}>
                {`${formatCount(rows.length)} ${rows.length === 1 ? "entry" : "entries"} · paid ${formatMoney(paid)} · advanced ${formatMoney(advanced)} · recovered ${formatMoney(recovered)}`}
              </TableTotalCell>
              <TableTotalCell className="text-right font-mono">
                {formatMoney(paid + advanced, { paise: true })}
              </TableTotalCell>
            </TableRow>
          </TableFoot>
        </Table>
      )}
      {rows.length > 0 && (
        <p className="text-muted text-xs">
          The total is money out — payments and advances. A recovery moves an advance onto a bill,
          so it is not counted again.
        </p>
      )}
    </div>
  );
}
