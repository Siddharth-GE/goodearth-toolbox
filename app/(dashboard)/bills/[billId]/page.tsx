import { Heading } from "@/components/ui/heading";
import { Badge } from "@/components/ui/badge";
import { DeleteOrCancel } from "@/components/ui/delete-or-cancel";
import { Attribution } from "@/components/ui/attribution";
import { LinkButton } from "@/components/ui/button";
import { ChargesBox } from "@/components/ui/charges-box";
import { PageTitle } from "@/components/ui/page-title";
import { MONEY_KIND_LABEL, moneyReversal } from "@/lib/bills/ledger";
import { updateBillCharges } from "@/lib/bills/line-actions";
import { reverseBillMoney } from "@/lib/bills/payment-actions";
import {
  countLabourEntriesOnBill,
  getBillLines,
  getPoLinesForBill,
  getWorkOrderLinesForBill,
} from "@/lib/bills/line-queries";
import {
  getBillMoneyEvents,
  getBillSettlement,
  getOpenAdvances,
} from "@/lib/bills/payment-queries";
import { getBill, getBillVillas, getCurrentBillActor } from "@/lib/bills/queries";
import { groupByVilla, villaLabel, villaOfLine } from "@/lib/bills/villas";
import { canEditBill, canTakePayment } from "@/lib/bills/workflow";
import { formatDate, formatMoney } from "@/lib/format";
import { listActiveGstRates } from "@/lib/masters/gst-rates";
import { listActiveUomNames } from "@/lib/masters/uoms";
import { FileDown } from "lucide-react";
import { notFound } from "next/navigation";
import { BillStatusBadge } from "../_components/status-badge";
import { ActionButtons } from "./_components/action-buttons";
import { BillLinesPanel } from "./_components/bill-lines-panel";
import { BillLinesTable } from "./_components/bill-lines-table";
import { DetailsFields, TotalOverride } from "./_components/details-fields";
import { HeaderFields } from "./_components/header-fields";
import { SettlementPanel } from "./_components/settlement-panel";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from "@/components/ui/table";

export default async function BillPage({ params }: { params: Promise<{ billId: string }> }) {
  const { billId } = await params;
  const [bill, actor, lines, fromLabour] = await Promise.all([
    getBill(billId),
    getCurrentBillActor(),
    getBillLines(billId),
    countLabourEntriesOnBill(billId),
  ]);
  if (!bill) notFound();

  const editable = canEditBill(bill.status);
  const itemised = lines.length > 0;
  const moneyMoves = bill.status !== "recorded";
  // A recorded bill has money only when it was paid, reversed and sent back (0147); its history still shows.
  const [settlement, events, advances, villas] = await Promise.all([
    getBillSettlement(bill.id, bill.total_amount),
    getBillMoneyEvents(bill.id),
    canTakePayment(bill.status) && bill.vendor_id
      ? getOpenAdvances(bill.vendor_id, bill.project_id)
      : Promise.resolve([]),
    getBillVillas(bill),
  ]);
  // A contractor's bill names the villa its lines are on, or how many (0166): lines can move off the header's.
  const villaGroups = villas
    ? groupByVilla(
        lines,
        (line) => villaOfLine(line.villa, villas.bill),
        () => 0,
      )
    : [];
  const placeName =
    villaGroups.length > 1
      ? `${villaGroups.length} villas`
      : villas && villaGroups.length === 1
        ? villaLabel(villaGroups[0].villa, villas)
        : (bill.scope_name ?? "General");
  const hasMoney = events.length > 0;
  const [gstRates, uoms, poLines, workLines] = editable
    ? await Promise.all([
        listActiveGstRates(),
        listActiveUomNames(),
        bill.po_id ? getPoLinesForBill(bill.po_id) : Promise.resolve(undefined),
        bill.labour_contract_id && fromLabour === 0
          ? getWorkOrderLinesForBill(bill.labour_contract_id)
          : Promise.resolve(undefined),
      ])
    : [[], [], undefined, undefined];

  const charges = {
    amount: bill.charges_amount,
    gst_pct: bill.charges_gst_pct,
    note: bill.charges_note,
  };

  const anchorLabel =
    bill.kind === "nmr"
      ? "for labour with no work order"
      : bill.po_reference
        ? `against ${bill.po_reference}`
        : bill.contract_description
          ? `against the work order ${bill.contract_reference ?? ""} "${bill.contract_description}"`
          : null;

  return (
    <div className="space-y-4">
      <PageTitle
        title={bill.reference}
        backHref="/bills/list"
        backLabel="All bills"
        description={
          <>
            {bill.vendor_name ?? "Direct labour — no vendor"}
            {bill.vendor_contractor_no ? ` (${bill.vendor_contractor_no})` : ""}
            {bill.vendor_seq ? ` · their bill ${bill.vendor_seq}` : ""}
            {` · ${bill.project_name}`}
            {` · ${placeName}`}
            {bill.kind === "nmr" ? " · Labour, no work order" : ""}
            {bill.po_reference ? ` · ${bill.po_reference}` : ""}
            {bill.contract_reference ? ` · ${bill.contract_reference}` : ""}
          </>
        }
        actions={
          <>
            <LinkButton href={`/bills/${bill.id}/pdf`} variant="secondary" size="sm" plain>
              <FileDown className="size-4" />
              Print
            </LinkButton>
            {bill.villa_unit_id && (
              <LinkButton
                href={`/estimator/villas/${bill.villa_unit_id}/budget`}
                variant="secondary"
                size="sm"
              >
                Villa budget
              </LinkButton>
            )}
            <BillStatusBadge status={bill.status} />
            <ActionButtons
              billId={bill.id}
              status={bill.status}
              actor={actor}
              createdBy={bill.created_by}
              totalAmount={bill.total_amount}
              hasMoney={hasMoney}
            />
          </>
        }
      />

      {editable && bill.rejection_note && (
        <div className="border-warning/40 bg-warning/5 rounded-xl border px-4 py-3">
          <p className="text-foreground text-sm">
            <span className="font-medium">Sent back:</span> {bill.rejection_note}
          </p>
          <p className="text-muted mt-1 text-xs">
            Fix the figures below — the next approval clears this note.
          </p>
        </div>
      )}

      {editable && !bill.rejection_note && (
        <div className="border-border bg-surface rounded-xl border px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <p className="text-foreground text-sm">
              Recorded {anchorLabel} — waiting for approval. The lines can still be corrected.
            </p>
            <Attribution name={bill.created_by_name} label="Recorded by" />
          </div>
          <p className="text-muted mt-1 text-xs">
            {actor.isAdmin || actor.isApprover
              ? "Yours to decide — approve it, or delete it if it was recorded wrongly."
              : "Waiting for a named bill approver or an admin."}
          </p>
        </div>
      )}

      {bill.status === "approved" && (
        <div className="border-border bg-surface flex items-center justify-between gap-3 rounded-xl border px-4 py-3">
          <p className="text-foreground text-sm">
            Approved
            {bill.approved_at && (
              <span className="text-muted"> on {formatDate(bill.approved_at)}</span>
            )}
            {settlement.paid + settlement.recovered > 0
              ? ` — part paid ${formatMoney(settlement.paid + settlement.recovered, { paise: true })} · pending ${formatMoney(settlement.pending, { paise: true })}.`
              : " — ready to pay."}
          </p>
          <Attribution name={bill.approved_by_name} label="Approved by" />
        </div>
      )}

      {bill.status === "paid" && (
        <div className="border-border bg-surface flex items-center justify-between gap-3 rounded-xl border px-4 py-3">
          <p className="text-foreground text-sm">
            Paid
            {bill.paid_at && <span className="text-muted"> on {formatDate(bill.paid_at)}</span>}
            {bill.payment_ref && (
              <>
                {" · ref "}
                <span className="font-mono text-xs">{bill.payment_ref}</span>
              </>
            )}
          </p>
          <Attribution name={bill.paid_by_name} label="Paid by" />
        </div>
      )}

      {itemised ? (
        <DetailsFields
          billId={bill.id}
          invoiceNo={bill.invoice_no}
          invoiceDate={bill.invoice_date}
          note={bill.note}
          taxableAmount={bill.taxable_amount}
          gstAmount={bill.gst_amount}
          totalAmount={bill.total_amount}
          editable={editable}
        />
      ) : (
        // A bill from before bills had lines keeps its typed figures.
        <HeaderFields
          billId={bill.id}
          invoiceNo={bill.invoice_no}
          invoiceDate={bill.invoice_date}
          taxableAmount={bill.taxable_amount}
          gstAmount={bill.gst_amount}
          totalAmount={bill.total_amount}
          note={bill.note}
          editable={editable}
        />
      )}

      {bill.kind === "nmr" && itemised && editable && (
        <TotalOverride
          billId={bill.id}
          currentTotal={bill.total_amount}
          overrideNote={bill.total_override_note}
        />
      )}
      {bill.kind === "nmr" && itemised && !editable && bill.total_override_note && (
        <p className="text-muted text-sm">{`Total set by hand — ${bill.total_override_note}`}</p>
      )}

      {(moneyMoves || hasMoney) && (
        <div className="space-y-2">
          <Heading>Payments</Heading>
          <p className="text-muted text-sm">
            {`Total ${formatMoney(bill.total_amount, { paise: true })} · paid ${formatMoney(settlement.paid, { paise: true })}${settlement.recovered > 0 ? ` · recovered from advances ${formatMoney(settlement.recovered, { paise: true })}` : ""} · pending ${formatMoney(settlement.pending, { paise: true })}`}
          </p>
          {events.length > 0 && (
            <Table>
              <TableHead>
                <TableRow>
                  <TableHeaderCell>On</TableHeaderCell>
                  <TableHeaderCell>What</TableHeaderCell>
                  <TableHeaderCell>Reference</TableHeaderCell>
                  <TableHeaderCell>By</TableHeaderCell>
                  <TableHeaderCell className="text-right">Amount</TableHeaderCell>
                  <TableHeaderCell />
                </TableRow>
              </TableHead>
              <TableBody>
                {events.map((event) => (
                  <TableRow key={event.id}>
                    <TableCell className="whitespace-nowrap">{formatDate(event.on)}</TableCell>
                    <TableCell>
                      {event.reversal
                        ? MONEY_KIND_LABEL[event.kind].reversal
                        : event.kind === "payment"
                          ? "Payment"
                          : "Advance recovered"}
                      {event.reversed && (
                        <Badge variant="neutral" className="ml-2">
                          Reversed
                        </Badge>
                      )}
                      {(event.reason ?? event.note) && (
                        <div className="text-muted text-xs">{event.reason ?? event.note}</div>
                      )}
                    </TableCell>
                    <TableCell className="font-mono text-xs">{event.reference}</TableCell>
                    <TableCell className="text-muted">{event.by ?? "—"}</TableCell>
                    <TableCell className="text-right font-mono">
                      {formatMoney(event.amount, { paise: true })}
                    </TableCell>
                    <TableCell className="text-right">
                      <DeleteOrCancel
                        noun={MONEY_KIND_LABEL[event.kind].noun}
                        verb="Reverse"
                        reasonPlaceholder="Paid twice by mistake"
                        removal={moneyReversal(event, actor)}
                        cancelNote="The same amount is entered the other way with your reason, so the bill has it pending again. Both entries stay on record. This can't be undone."
                        onCancel={reverseBillMoney.bind(null, event.kind, event.id)}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          {canTakePayment(bill.status) && settlement.pending > 0 && (
            <SettlementPanel billId={bill.id} pending={settlement.pending} advances={advances} />
          )}
        </div>
      )}

      <div className="space-y-2">
        <Heading>Lines</Heading>
        {editable ? (
          <>
            {!itemised && (
              <p className="text-muted text-sm">
                This bill has no lines — its figures are the ones typed above. Adding lines makes
                the figures follow them.
              </p>
            )}
            <BillLinesPanel
              billId={bill.id}
              lines={lines}
              gstRates={gstRates.map((rate) => rate.rate)}
              uoms={uoms}
              poLines={poLines}
              workLines={workLines}
              allowOther={bill.kind !== "po"}
              locked={fromLabour > 0}
              charges={charges}
              villas={villas ?? undefined}
            />
          </>
        ) : itemised ? (
          <BillLinesTable lines={lines} villas={villas ?? undefined} />
        ) : (
          <p className="text-muted text-sm">
            Recorded before bills had lines — its figures are the ones above.
          </p>
        )}
      </div>

      {/* The header re-sums charges only from lines, so a bill without lines has no box. */}
      {itemised && (
        <ChargesBox
          charges={charges}
          gstRates={gstRates.map((rate) => rate.rate)}
          editable={editable}
          save={updateBillCharges.bind(null, bill.id)}
        />
      )}
    </div>
  );
}
