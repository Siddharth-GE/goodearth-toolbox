import { Badge } from "@/components/ui/badge";
import { Figure, FigureBand, FigureBandCell } from "@/components/ui/figure";
import { PageTitle } from "@/components/ui/page-title";
import { CASH_REQUEST_STATUS_LABEL } from "@/lib/bills/ledger";
import { getCashRequest, listPayableBills } from "@/lib/bills/payment-queries";
import { getContractFormOptions, getCurrentBillActor } from "@/lib/bills/queries";
import { listWorkOrders } from "@/lib/bills/work-order-queries";
import { formatDate, formatMoney } from "@/lib/format";
import { listVendors } from "@/lib/masters/vendors";
import { notFound } from "next/navigation";
import { AddAdvance, AddBills, RequestActions, RequestLines } from "./_components/request-board";

/**
 * One week's cash request (0107): drafted by accounts, released by a
 * bill approver (who may cut any line), then paid line by line. "Pending"
 * on a bill is what is left after every payment and recovery so far.
 */
export default async function CashRequestPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [request, actor] = await Promise.all([getCashRequest(id), getCurrentBillActor()]);
  if (!request) notFound();

  const drafting = request.status === "draft";
  const [payable, options, vendors, workOrders] = drafting
    ? await Promise.all([
        listPayableBills(),
        getContractFormOptions(),
        listVendors(true),
        listWorkOrders({ status: "approved" }),
      ])
    : [[], null, [], []];
  const onRequest = new Set(request.items.flatMap((item) => (item.bill_id ? [item.bill_id] : [])));
  const isApprover = actor.isAdmin || actor.isApprover;

  return (
    <div className="space-y-4">
      <PageTitle
        title={`Cash request — week of ${formatDate(request.week_of)}`}
        backHref="/bills/cash-requests"
        backLabel="Cash requests"
        description={[
          request.created_by_name && `Made by ${request.created_by_name}`,
          request.submitted_at &&
            `submitted ${formatDate(request.submitted_at)}${request.submitted_by_name ? ` by ${request.submitted_by_name}` : ""}`,
          request.released_at &&
            `released ${formatDate(request.released_at)}${request.released_by_name ? ` by ${request.released_by_name}` : ""}`,
        ]
          .filter(Boolean)
          .join(" · ")}
        actions={<Badge variant="neutral">{CASH_REQUEST_STATUS_LABEL[request.status]}</Badge>}
      />

      {drafting && request.sent_back_note && (
        <div className="border-warning/40 bg-warning/5 rounded-xl border px-4 py-3">
          <p className="text-foreground text-sm">
            <span className="font-medium">Sent back:</span> {request.sent_back_note}
          </p>
        </div>
      )}
      {!drafting && request.note && <p className="text-muted text-sm">{request.note}</p>}

      <FigureBand className="sm:grid-cols-4 lg:grid-cols-4">
        <FigureBandCell>
          <Figure label="Asked for" value={formatMoney(request.figures.requested)} />
        </FigureBandCell>
        <FigureBandCell>
          <Figure
            label="Released"
            value={
              drafting || request.status === "submitted"
                ? "—"
                : formatMoney(request.figures.released)
            }
          />
        </FigureBandCell>
        <FigureBandCell>
          <Figure label="Paid" value={formatMoney(request.figures.paid)} />
        </FigureBandCell>
        <FigureBandCell>
          <Figure
            label="Still to pay"
            value={request.status === "released" ? formatMoney(request.figures.toPay) : "—"}
          />
        </FigureBandCell>
      </FigureBand>

      {request.items.length === 0 ? (
        <p className="text-muted text-sm">Nothing on it yet — add bills and advances below.</p>
      ) : (
        <RequestLines request={request} isApprover={isApprover} />
      )}

      {request.status === "submitted" && isApprover && (
        <p className="text-muted text-sm">
          Cut any line by changing what is released for it; anything left as asked is released in
          full when you press Release.
        </p>
      )}

      <RequestActions request={request} isApprover={isApprover} />

      {drafting && options && (
        <>
          <div className="space-y-2">
            <h2 className="text-foreground text-lg font-bold tracking-tight">Add bills</h2>
            <AddBills
              requestId={request.id}
              bills={payable.filter((bill) => !onRequest.has(bill.id))}
            />
          </div>
          <div className="space-y-2">
            <h2 className="text-foreground text-lg font-bold tracking-tight">Add an advance</h2>
            <AddAdvance
              requestId={request.id}
              contractors={vendors
                .filter((vendor) => vendor.is_contractor)
                .map(({ id, name }) => ({ id, name }))}
              projects={options.projects.map(({ id, name }) => ({ id, name }))}
              workOrders={workOrders.map((order) => ({
                id: order.id,
                reference: order.reference,
                vendor_id: order.vendor_id,
                project_id: order.project_id,
                description: order.description,
              }))}
            />
          </div>
        </>
      )}
    </div>
  );
}
