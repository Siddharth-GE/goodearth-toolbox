import { Badge } from "@/components/ui/badge";
import { DeleteOrCancel } from "@/components/ui/delete-or-cancel";
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
import { MONEY_KIND_LABEL, moneyReversal, type MoneyKind } from "@/lib/bills/ledger";
import { reverseBillMoney } from "@/lib/bills/payment-actions";
import { reverseSheetMoney } from "@/lib/bills/sheet-actions";
import { listPaymentsLedger } from "@/lib/bills/payment-queries";
import { getCurrentBillActor } from "@/lib/bills/queries";
import { formatCount, formatDate, formatMoney } from "@/lib/format";
import { dateParam, idParam, searchParam } from "@/lib/list-params";
import { listProjects } from "@/lib/masters/projects";
import { listVendors } from "@/lib/masters/vendors";
import { Banknote } from "lucide-react";
import Link from "next/link";

const VARIANT: Record<MoneyKind, "neutral" | "info" | "warning"> = {
  payment: "neutral",
  advance: "info",
  recovery: "warning",
};

const REVERSE_NOTE: Record<MoneyKind, string> = {
  payment:
    "The same amount is entered the other way with your reason, so the bill has it pending again. Both entries stay on record. This can't be undone.",
  advance:
    "The same amount is entered the other way with your reason, so the advance no longer counts as given. Both entries stay on record. This can't be undone.",
  recovery:
    "The same amount is entered the other way with your reason, so the bill has it pending again and the advance has it to recover. Both entries stay on record. This can't be undone.",
};

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

  const [rows, vendors, projects, actor] = await Promise.all([
    listPaymentsLedger({ q, vendorId: vendor, projectId: project, from, to }),
    listVendors(),
    listProjects(),
    getCurrentBillActor(),
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
              <TableHeaderCell>Bill or sheet</TableHeaderCell>
              <TableHeaderCell>Reference</TableHeaderCell>
              <TableHeaderCell className="text-right">Amount</TableHeaderCell>
              <TableHeaderCell />
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={`${row.kind}-${row.id}`}>
                <TableCell className="whitespace-nowrap">{formatDate(row.on)}</TableCell>
                <TableCell>
                  <Badge variant={row.reversal ? "neutral" : VARIANT[row.kind]}>
                    {MONEY_KIND_LABEL[row.kind][row.reversal ? "reversal" : "entry"]}
                  </Badge>
                  {row.reversed && <div className="text-muted mt-1 text-xs">Reversed</div>}
                  {row.reason && <div className="text-muted mt-1 text-xs">{row.reason}</div>}
                </TableCell>
                <TableCell>
                  {row.vendor_name}
                  <div className="text-muted text-xs">{row.project_name}</div>
                </TableCell>
                <TableCell className="font-mono text-xs">
                  {row.sheet_id ? (
                    <Link
                      href={`/bills/sheets/${row.sheet_id}`}
                      className="text-accent hover:underline"
                    >
                      {row.bill_reference}
                    </Link>
                  ) : row.bill_id ? (
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
                <TableCell className="text-right">
                  <DeleteOrCancel
                    noun={MONEY_KIND_LABEL[row.kind].noun}
                    verb="Reverse"
                    reasonPlaceholder="Paid twice by mistake"
                    removal={moneyReversal(row, actor)}
                    cancelNote={
                      row.sheet_entry_id
                        ? "The same amount is entered the other way on every bill of the sheet, with your reason, so the sheet has it pending again. Both entries stay on record. This can't be undone."
                        : REVERSE_NOTE[row.kind]
                    }
                    onCancel={
                      row.sheet_entry_id && row.kind !== "advance"
                        ? reverseSheetMoney.bind(null, row.kind, row.sheet_entry_id)
                        : reverseBillMoney.bind(null, row.kind, row.id)
                    }
                  />
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
              <TableTotalCell />
            </TableRow>
          </TableFoot>
        </Table>
      )}
      {rows.length > 0 && (
        <p className="text-muted text-xs">
          The total is money out — payments and advances. A recovery moves an advance onto a bill,
          so it is not counted again. A reversal is entered the other way, so it takes its entry
          back out of every total.
        </p>
      )}
    </div>
  );
}
