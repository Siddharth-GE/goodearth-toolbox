import { Card } from "@/components/ui/card";
import { HealthPill } from "@/components/ui/health-pill";
import { Section } from "@/components/ui/section";
import { formatMoney } from "@/lib/format";
import { figures, orderLabel, paymentsByOrder, vendorTotals } from "@/lib/kaadal-billing/ledger";
import { getLedger } from "@/lib/kaadal-billing/queries";
import { idParam } from "@/lib/list-params";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DetailHead } from "../../_components/parts";
import { Stamp } from "../../_components/stamp";
import { VendorForm } from "../../_components/vendor-form";

export default async function VendorPage({ params }: { params: Promise<{ vendorId: string }> }) {
  const vendorId = idParam((await params).vendorId);
  const ledger = await getLedger();
  const vendor = ledger.vendors.find((v) => v.id === vendorId);
  if (!vendor) notFound();
  const t = vendorTotals(ledger, vendor.id);
  const pays = paymentsByOrder(ledger.payments);
  const orders = ledger.orders.filter((o) => o.vendorId === vendor.id);

  return (
    <div className="space-y-4">
      <DetailHead
        back={{ href: "/kaadal-billing/vendors", label: "Vendors" }}
        title={vendor.name}
        meta={
          <span className="tabular-nums">
            {t.orders} order{t.orders === 1 ? "" : "s"} · {formatMoney(t.paid)} paid ·{" "}
            {formatMoney(Math.max(t.balance, 0))} due
          </span>
        }
      />
      <VendorForm vendor={vendor} canDelete={orders.length === 0} />
      <Section title="Orders">
        {orders.length ? (
          <div className="space-y-2">
            {orders.map((o) => {
              const f = figures(o, pays.get(o.id) ?? []);
              return (
                <Card
                  key={o.id}
                  interactive
                  className="relative flex flex-wrap items-center gap-x-4 gap-y-1 p-3"
                >
                  <Link
                    href={`/kaadal-billing/orders/${o.id}`}
                    className="text-foreground font-medium after:absolute after:inset-0 after:rounded-2xl"
                  >
                    {orderLabel(o)}
                  </Link>
                  <span className="text-muted text-xs tabular-nums">
                    Order {formatMoney(f.net)} · paid {formatMoney(f.paid)}
                  </span>
                  <span className="ml-auto text-sm tabular-nums">
                    {f.state === "paid" ? (
                      <HealthPill label="Paid" tone="success" />
                    ) : (
                      `${formatMoney(f.balance)} due`
                    )}
                  </span>
                </Card>
              );
            })}
          </div>
        ) : (
          <p className="text-muted text-sm">No orders for this vendor.</p>
        )}
      </Section>
      <Stamp
        at={vendor.updatedAt}
        by={vendor.updatedBy ? ledger.names[vendor.updatedBy] : undefined}
      />
    </div>
  );
}
