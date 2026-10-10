import { Badge } from "@/components/ui/badge";
import { LinkButton } from "@/components/ui/button";
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
import { getCurrentBillActor } from "@/lib/bills/queries";
import { getWorkOrder, getWorkOrderFormOptions } from "@/lib/bills/work-order-queries";
import { workOrderLineAmount } from "@/lib/bills/work-orders";
import { canApproveContract, canEditContract } from "@/lib/bills/workflow";
import { formatDate, formatMoney, formatQuantity } from "@/lib/format";
import { FileDown } from "lucide-react";
import { notFound } from "next/navigation";
import { SaveAsTemplate, WorkOrderActions } from "../_components/work-order-buttons";
import { WorkOrderEditor } from "../_components/work-order-editor";

/**
 * One work order. While it waits for approval its works and terms are
 * edited here; once approved they are permanent (the database guard),
 * and the page reads as the paper does.
 */
export default async function WorkOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [order, actor] = await Promise.all([getWorkOrder(id), getCurrentBillActor()]);
  if (!order) notFound();

  const editable = canEditContract(order.status);
  const options = editable ? await getWorkOrderFormOptions(order.vendor_id) : null;
  const billed = order.billed_total;

  return (
    <div className="space-y-4">
      <PageTitle
        title={order.reference ?? "Work order"}
        backHref="/bills/work-orders"
        backLabel="Work orders"
        description={`${order.vendor_name} · ${order.project_name} · ${order.place} — ${order.description}`}
        actions={
          <>
            <LinkButton
              href={`/bills/work-orders/${order.id}/pdf`}
              variant="secondary"
              size="sm"
              plain
            >
              <FileDown className="size-4" />
              Print
            </LinkButton>
            {order.status === "approved" ? (
              <Badge variant="success">Approved</Badge>
            ) : (
              <Badge variant="warning">Pending approval</Badge>
            )}
            {!order.is_active && <Badge variant="neutral">Switched off</Badge>}
            <WorkOrderActions
              orderId={order.id}
              isActive={order.is_active}
              showApprove={canApproveContract(order.status, actor, order.contract_value)}
            />
          </>
        }
      />

      <div className="border-border bg-surface flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3">
        <p className="text-foreground text-sm">
          {order.status === "approved"
            ? `Approved${order.approved_by_name ? ` by ${order.approved_by_name}` : ""}${order.approved_at ? ` on ${formatDate(order.approved_at)}` : ""} — its works, value and terms are permanent. ${billed > 0 ? `${formatMoney(billed)} billed against it so far.` : "Nothing billed against it yet."}`
            : "Waiting for a bill approver. Its works and terms can change until it is approved."}
        </p>
        {order.lines.length > 0 && <SaveAsTemplate orderId={order.id} />}
      </div>

      {editable && options ? (
        <WorkOrderEditor
          orderId={order.id}
          options={options}
          initial={{
            vendorId: order.vendor_id,
            projectId: order.project_id,
            site: order.unit_id
              ? `unit:${order.unit_id}`
              : order.plot_id
                ? `plot:${order.plot_id}`
                : "",
            description: order.description,
            terms: order.terms ?? "",
            lines: order.lines.map((line) => ({
              workItemId: line.work_item_id,
              description: line.description,
              isLumpSum: line.is_lump_sum,
              quantity: line.quantity === null ? "" : String(line.quantity),
              uom: line.uom ?? "",
              rate: String(line.rate),
            })),
          }}
        />
      ) : (
        <>
          {order.lines.length === 0 ? (
            <p className="text-muted text-sm">
              {`Made before work orders had works — its value is the ${formatMoney(order.contract_value)} typed when it was recorded.`}
            </p>
          ) : (
            <Table>
              <TableHead>
                <TableRow>
                  <TableHeaderCell>Work</TableHeaderCell>
                  <TableHeaderCell className="text-right">Quantity</TableHeaderCell>
                  <TableHeaderCell className="text-right">Rate</TableHeaderCell>
                  <TableHeaderCell className="text-right">Amount</TableHeaderCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {order.lines.map((line) => {
                  const amount = workOrderLineAmount({
                    workItemId: line.work_item_id,
                    description: line.description,
                    isLumpSum: line.is_lump_sum,
                    quantity: line.quantity,
                    uom: line.uom,
                    rate: line.rate,
                  });
                  return (
                    <TableRow key={line.id}>
                      <TableCell>
                        <span className="text-foreground font-medium">{line.description}</span>
                        {line.work_label && (
                          <div className="text-muted text-xs">{line.work_label}</div>
                        )}
                      </TableCell>
                      <TableCell className="text-right whitespace-nowrap">
                        {line.is_lump_sum
                          ? "Lump sum"
                          : `${formatQuantity(line.quantity)} ${line.uom ?? ""}`}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {line.is_lump_sum
                          ? "—"
                          : formatMoney(line.rate, { paise: line.rate % 1 !== 0 })}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {formatMoney(amount, { paise: amount !== null && amount % 1 !== 0 })}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
              <TableFoot>
                <TableRow>
                  <TableTotalCell colSpan={3}>Value</TableTotalCell>
                  <TableTotalCell className="text-right font-mono">
                    {formatMoney(order.contract_value, {
                      paise: order.contract_value % 1 !== 0,
                    })}
                  </TableTotalCell>
                </TableRow>
              </TableFoot>
            </Table>
          )}
          <div>
            <p className="text-muted text-[11px] font-medium tracking-[0.14em] uppercase">
              Terms and conditions
            </p>
            <p className="text-foreground mt-1 text-sm whitespace-pre-line">{order.terms ?? "—"}</p>
          </div>
        </>
      )}
    </div>
  );
}
