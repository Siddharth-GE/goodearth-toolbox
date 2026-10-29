import { LinkButton } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ListToolbar } from "@/components/ui/list-toolbar";
import { SectionHead } from "@/components/ui/section-head";
import { formatMoney } from "@/lib/format";
import {
  inPlot,
  matches,
  paymentsByOrder,
  totals,
  view,
  type PayState,
} from "@/lib/kaadal-billing/ledger";
import { getLedger } from "@/lib/kaadal-billing/queries";
import Link from "next/link";
import { OrderCard, PlotScope, TotalsBand, withParams } from "../_components/parts";
import { scopeOf } from "../_components/scope";

const GROUPS: { state: PayState; title: string; tone?: "danger" | "info" }[] = [
  { state: "none", title: "Not paid yet", tone: "danger" },
  { state: "part", title: "Part paid" },
  { state: "paid", title: "Fully paid" },
];

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const raw = await searchParams;
  const ledger = await getLedger();
  const { plots, plot, q } = scopeOf(ledger, raw);
  const showPaid = raw.paid === "1";
  const kept = {
    plot: plot === "All" ? undefined : plot,
    q: q || undefined,
    paid: showPaid ? "1" : undefined,
  };
  const vendorName = new Map(ledger.vendors.map((v) => [v.id, v.name]));
  const pays = paymentsByOrder(ledger.payments);

  const rows = ledger.orders
    .filter((o) => inPlot(o, plot) && matches(o, vendorName.get(o.vendorId) ?? "", q))
    .map((o) => ({ o, v: view(o, pays.get(o.id) ?? [], plot) }))
    .filter((x): x is { o: typeof x.o; v: NonNullable<typeof x.v> } => x.v !== null);

  return (
    <div className="space-y-4">
      <TotalsBand totals={totals(ledger, plot)} scope={plot === "All" ? "All plots" : plot} />
      <PlotScope
        plots={plots}
        current={plot}
        href={(p) =>
          withParams("/kaadal-billing/orders", kept, { plot: p === "All" ? undefined : p })
        }
      />
      <ListToolbar
        action="/kaadal-billing/orders"
        values={{ q }}
        keep={{ plot: kept.plot, paid: kept.paid }}
        search={{ placeholder: "Vendor, item, plot or note" }}
      />

      {ledger.orders.length === 0 ? (
        <EmptyState
          title="No orders yet"
          description="Add the first vendor order, with its advance if one was paid."
          action={<LinkButton href="/kaadal-billing/orders/new">New order</LinkButton>}
        />
      ) : rows.length === 0 ? (
        <EmptyState
          title={`Nothing matches “${q}”`}
          description="Try a vendor name, a plot number or an item."
        />
      ) : (
        GROUPS.map(({ state, title, tone }) => {
          const group = rows
            .filter((x) => x.v.state === state)
            .sort((a, b) =>
              state === "paid"
                ? (b.v.last?.paidOn ?? "").localeCompare(a.v.last?.paidOn ?? "")
                : b.v.balance - a.v.balance,
            );
          if (!group.length) return null;
          const sum = group.reduce((s, x) => s + (state === "paid" ? x.v.net : x.v.balance), 0);
          const hint =
            state === "paid" ? `${formatMoney(sum)} settled` : `${formatMoney(sum)} to pay`;
          if (state === "paid" && !showPaid && !q) {
            return (
              <SectionHead
                key={state}
                title={title}
                count={group.length}
                hint={hint}
                aside={
                  <Link
                    href={withParams("/kaadal-billing/orders", kept, { paid: "1" })}
                    className="text-accent text-sm font-medium hover:underline"
                  >
                    Show fully paid orders
                  </Link>
                }
              />
            );
          }
          return (
            <section key={state} className="space-y-2.5">
              <SectionHead title={title} count={group.length} hint={hint} tone={tone} />
              {group.map(({ o, v }) => (
                <OrderCard
                  key={o.id}
                  order={o}
                  vendorName={vendorName.get(o.vendorId) ?? "Unknown vendor"}
                  v={v}
                  plot={plot}
                />
              ))}
            </section>
          );
        })
      )}
    </div>
  );
}
