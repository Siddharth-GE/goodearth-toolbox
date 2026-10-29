import { Attribution } from "@/components/ui/attribution";
import { Badge } from "@/components/ui/badge";
import { LinkButton } from "@/components/ui/button";
import { Heading } from "@/components/ui/heading";
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
import { getOpenAdvances } from "@/lib/bills/payment-queries";
import { getCurrentBillActor } from "@/lib/bills/queries";
import { getSheet } from "@/lib/bills/sheet-queries";
import { formatDate, formatMoney } from "@/lib/format";
import { FileDown } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BillStatusBadge } from "../../_components/status-badge";
import { TakeOffSheet } from "../../[billId]/_components/sheet-buttons";
import { SheetStateBadge } from "../_components/sheet-state-badge";
import { SheetDecisions } from "./_components/sheet-decisions";
import { SheetMoney } from "./_components/sheet-money";
import { SheetPayPanel } from "./_components/sheet-pay-panel";

export default async function SheetPage({ params }: { params: Promise<{ sheetId: string }> }) {
  const { sheetId } = await params;
  const [sheet, actor] = await Promise.all([getSheet(sheetId), getCurrentBillActor()]);
  if (!sheet) notFound();

  const paying = sheet.state === "approved" && sheet.pending > 0;
  const advances = paying ? await getOpenAdvances(sheet.vendor_id, sheet.bills[0]?.project_id) : [];
  const hasMoney = sheet.payments.length + sheet.recoveries.length > 0;
  const party =
    sheet.vendor_name + (sheet.vendor_contractor_no ? ` (${sheet.vendor_contractor_no})` : "");

  return (
    <div className="space-y-4">
      <PageTitle
        title={sheet.reference}
        backHref="/bills/sheets"
        backLabel="Consolidated"
        description={`${party} · ${sheet.company_name} · ${sheet.work_type === "PW" ? "Piece-work" : "Daily wages (NMR)"} · ${sheet.bills.length} ${sheet.bills.length === 1 ? "bill" : "bills"}`}
        actions={
          <>
            <LinkButton href={`/bills/sheets/${sheet.id}/pdf`} variant="secondary" size="sm" plain>
              <FileDown className="size-4" />
              Print
            </LinkButton>
            {sheet.bills.length > 0 && (
              <LinkButton
                href={`/bills/print?sheets=${sheet.id}&bills=${sheet.bills.map((bill) => bill.id).join(",")}`}
                variant="secondary"
                size="sm"
                newTab
              >
                Print with its bills
              </LinkButton>
            )}
            <SheetStateBadge state={sheet.state} />
            <SheetDecisions
              sheetId={sheet.id}
              reference={sheet.reference}
              state={sheet.state}
              total={sheet.total}
              billCount={sheet.bills.length}
              hasMoney={hasMoney}
              onCashRequest={sheet.cash_requests.length > 0}
              actor={actor}
            />
          </>
        }
      />

      {sheet.state === "waiting" && sheet.sent_back_note && (
        <div className="border-warning/40 bg-warning/5 rounded-xl border px-4 py-3">
          <p className="text-foreground text-sm">
            <span className="font-medium">Sent back:</span> {sheet.sent_back_note}
          </p>
          <p className="text-muted mt-1 text-xs">
            Correct a bill, or take it off, then approve the sheet again.
          </p>
        </div>
      )}
      {sheet.state === "waiting" && !sheet.sent_back_note && (
        <div className="border-border bg-surface flex items-center justify-between gap-3 rounded-xl border px-4 py-3">
          <p className="text-foreground text-sm">
            Waiting for approval. Approving it approves every bill on it; a bill can still be
            corrected on its own page, or taken off.
          </p>
          <Attribution name={sheet.created_by_name} label="Made by" />
        </div>
      )}
      {(sheet.state === "approved" || sheet.state === "paid") && (
        <div className="border-border bg-surface flex items-center justify-between gap-3 rounded-xl border px-4 py-3">
          <p className="text-foreground text-sm">
            {sheet.state === "paid" ? "Paid" : "Approved"}
            {sheet.approved_at && (
              <span className="text-muted"> — approved on {formatDate(sheet.approved_at)}</span>
            )}
            {sheet.cash_requests.length > 0 && (
              <>
                {" · on the "}
                <Link
                  href={`/bills/cash-requests/${sheet.cash_requests[0].id}`}
                  className="text-accent hover:underline"
                >
                  {`cash request for the week of ${formatDate(sheet.cash_requests[0].week_of)}`}
                </Link>
              </>
            )}
          </p>
          <Attribution name={sheet.approved_by_name} label="Approved by" />
        </div>
      )}
      {sheet.state === "undone" && (
        <div className="border-border bg-surface flex items-center justify-between gap-3 rounded-xl border px-4 py-3">
          <p className="text-foreground text-sm">
            Undone
            {sheet.undone_at && (
              <span className="text-muted"> on {formatDate(sheet.undone_at)}</span>
            )}
            {" — its bills stand alone again. The sheet stays on record with the bills it had."}
          </p>
          <Attribution name={sheet.undone_by_name} label="Undone by" />
        </div>
      )}

      {sheet.bills.length > 0 && (
        <div className="space-y-2">
          <Heading>Bills</Heading>
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>Bill</TableHeaderCell>
                <TableHeaderCell>Villa</TableHeaderCell>
                <TableHeaderCell>Date</TableHeaderCell>
                <TableHeaderCell>Status</TableHeaderCell>
                <TableHeaderCell className="text-right">Amount</TableHeaderCell>
                <TableHeaderCell className="text-right">Pending</TableHeaderCell>
                <TableHeaderCell />
              </TableRow>
            </TableHead>
            <TableBody>
              {sheet.bills.map((bill) => (
                <TableRow key={bill.id} className="align-top">
                  <TableCell>
                    <Link
                      href={`/bills/${bill.id}`}
                      className="text-accent font-mono text-sm font-medium hover:underline"
                    >
                      {bill.reference}
                    </Link>
                    {bill.invoice_no !== bill.reference && bill.invoice_no !== "—" && (
                      <div className="text-muted text-xs">{`Their ${bill.invoice_no}`}</div>
                    )}
                  </TableCell>
                  <TableCell>
                    {bill.place}
                    <div className="text-muted text-xs">{bill.project_name}</div>
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    {formatDate(bill.invoice_date)}
                  </TableCell>
                  <TableCell>
                    <BillStatusBadge status={bill.status} />
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {formatMoney(bill.total, { paise: true })}
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {formatMoney(bill.pending, { paise: true })}
                  </TableCell>
                  <TableCell className="text-right">
                    {sheet.state === "waiting" && sheet.cash_requests.length === 0 && (
                      <TakeOffSheet billId={bill.id} />
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
            <TableFoot>
              <tr>
                <TableTotalCell colSpan={4}>Total</TableTotalCell>
                <TableTotalCell className="text-right font-mono">
                  {formatMoney(sheet.total, { paise: true })}
                </TableTotalCell>
                <TableTotalCell className="text-right font-mono">
                  {formatMoney(sheet.pending, { paise: true })}
                </TableTotalCell>
                <TableTotalCell />
              </tr>
            </TableFoot>
          </Table>
        </div>
      )}

      {(sheet.state === "approved" || sheet.state === "paid" || hasMoney) && (
        <div className="space-y-2">
          <Heading>Payments</Heading>
          <p className="text-muted text-sm">
            {`Total ${formatMoney(sheet.total, { paise: true })} · paid ${formatMoney(sheet.paid, { paise: true })}${sheet.recovered > 0 ? ` · recovered from advances ${formatMoney(sheet.recovered, { paise: true })}` : ""} · pending ${formatMoney(sheet.pending, { paise: true })}`}
          </p>
          <SheetMoney
            payments={sheet.payments}
            recoveries={sheet.recoveries}
            canReverse={actor.isAdmin || actor.isApprover}
          />
          {paying && (
            <SheetPayPanel
              sheetId={sheet.id}
              pending={sheet.pending}
              bills={sheet.bills.map((bill) => ({
                id: bill.id,
                reference: bill.reference,
                pending: bill.pending,
              }))}
              advances={advances}
            />
          )}
        </div>
      )}

      {sheet.former.length > 0 && (
        <div className="space-y-2">
          <Heading>Taken off</Heading>
          <ul className="space-y-1 text-sm">
            {sheet.former.map((row, index) => (
              <li key={`${row.reference}-${index}`} className="flex flex-wrap items-center gap-2">
                {row.bill_id ? (
                  <Link
                    href={`/bills/${row.bill_id}`}
                    className="text-accent font-mono hover:underline"
                  >
                    {row.reference}
                  </Link>
                ) : (
                  <span className="font-mono">{row.reference}</span>
                )}
                <span className="text-muted">
                  {`${formatDate(row.removed_at)}${row.removed_by ? ` · ${row.removed_by}` : ""}`}
                </span>
                {!row.bill_id && <Badge variant="neutral">Deleted since</Badge>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
