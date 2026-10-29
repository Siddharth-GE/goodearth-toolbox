import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ListToolbar } from "@/components/ui/list-toolbar";
import { formatMoney } from "@/lib/format";
import { totals, vendorTotals } from "@/lib/kaadal-billing/ledger";
import { getLedger } from "@/lib/kaadal-billing/queries";
import { searchParam } from "@/lib/list-params";
import Link from "next/link";
import { BankBlock } from "../_components/copy-button";
import { TotalsBand } from "../_components/parts";

export default async function VendorsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const q = searchParam((await searchParams).q) ?? "";
  const ledger = await getLedger();
  const rows = ledger.vendors
    .filter((v) => !q || `${v.name} ${v.bank}`.toLowerCase().includes(q.toLowerCase()))
    .map((v) => ({ v, t: vendorTotals(ledger, v.id) }))
    .sort((a, b) => b.t.balance - a.t.balance || a.v.name.localeCompare(b.v.name));

  return (
    <div className="space-y-4">
      <TotalsBand totals={totals(ledger, "All")} scope="All plots" />
      <ListToolbar
        action="/kaadal-billing/vendors"
        values={{ q }}
        search={{ placeholder: "Vendor or bank details" }}
      />
      {rows.length === 0 ? (
        <EmptyState
          title={q ? `Nothing matches “${q}”` : "No vendors yet"}
          description="Vendors are added when you create a new order."
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map(({ v, t }) => (
            <Card key={v.id} className="space-y-3 p-4">
              <div className="flex items-start gap-3">
                <div className="min-w-0">
                  <p className="text-foreground text-[17px] leading-tight font-semibold tracking-tight">
                    {v.name}
                  </p>
                  <p className="text-muted text-xs tabular-nums">
                    {t.orders} order{t.orders === 1 ? "" : "s"} ·{" "}
                    {t.balance > 0.5 ? `${formatMoney(t.balance)} due` : "nothing due"}
                  </p>
                </div>
                <Link
                  href={`/kaadal-billing/vendors/${v.id}`}
                  className="text-accent ml-auto text-sm font-medium hover:underline"
                >
                  Edit
                </Link>
              </div>
              <BankBlock bank={v.bank} />
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
