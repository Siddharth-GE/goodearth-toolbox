import { formatDate } from "@/lib/format";
import { allPlots, paymentsByOrder } from "@/lib/kaadal-billing/ledger";
import { getLedger } from "@/lib/kaadal-billing/queries";
import { idParam } from "@/lib/list-params";
import { notFound } from "next/navigation";
import { OrderWorkspace } from "../../_components/order-workspace";
import { DetailHead, PlotPill } from "../../_components/parts";
import { Stamp } from "../../_components/stamp";

export default async function OrderPage({
  params,
  searchParams,
}: {
  params: Promise<{ orderId: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const orderId = idParam((await params).orderId);
  const raw = await searchParams;
  const ledger = await getLedger();
  const order = ledger.orders.find((o) => o.id === orderId);
  if (!order) notFound();
  const pays = paymentsByOrder(ledger.payments).get(order.id) ?? [];
  const vendor = ledger.vendors.find((v) => v.id === order.vendorId) ?? {
    id: order.vendorId,
    name: "Unknown vendor",
    bank: "",
  };
  const editPaymentId = idParam(raw.payment) ?? null;

  return (
    <div className="space-y-4">
      <DetailHead
        back={{ href: "/kaadal-billing/orders", label: "Orders" }}
        title={vendor.name}
        meta={
          <>
            {order.plots.map((p) => (
              <PlotPill key={p} plot={p} />
            ))}
            {order.item ? <span>{order.item}</span> : null}
            {order.orderedOn ? <span>· ordered {formatDate(order.orderedOn)}</span> : null}
          </>
        }
      />
      <OrderWorkspace
        // A new payment or edit opened from a link starts the form afresh.
        key={`${order.id}:${editPaymentId ?? ""}`}
        order={order}
        pays={pays}
        vendor={{ id: vendor.id, name: vendor.name, bank: vendor.bank }}
        vendors={ledger.vendors.map((v) => ({ id: v.id, name: v.name, bank: v.bank }))}
        plots={allPlots(ledger)}
        today={ledger.today}
        editPaymentId={editPaymentId}
        focusPay={raw.pay === "1"}
      />
      <Stamp
        at={order.updatedAt}
        by={order.updatedBy ? ledger.names[order.updatedBy] : undefined}
      />
    </div>
  );
}
