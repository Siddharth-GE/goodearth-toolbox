import { PageTitle } from "@/components/ui/page-title";
import { getWelcomeCounts } from "@/lib/inventory/receipts-queries";

import { ToolWelcome } from "../_components/tool-welcome";

// The welcome screen (founder, 2026-08-13: every Operations and
// Management tool opens on one). The Receive screen lives one click in
// at /inventory/receive.
export default async function InventoryPage() {
  const counts = await getWelcomeCounts();

  return (
    <div className="space-y-4">
      <PageTitle
        title="Inventory"
        description="What arrived, what each store holds, what went out."
      />
      <ToolWelcome
        icon="Warehouse"
        intro={[
          "Every material movement on site, recorded as it happens: goods arriving against a purchase order, stock sitting in each store, and issues going out to a plot or another store. No prices anywhere — quantities are this tool's whole language.",
          "Receive is the everyday screen: pick the purchase order, tick off what the lorry actually brought, and the stock is up to date.",
        ]}
        stats={[
          {
            label: "Awaiting delivery",
            value: counts.awaitingDelivery,
            hint: "issued purchase orders",
          },
          {
            label: "Deliveries this month",
            value: counts.receivedThisMonth,
            hint: "goods received",
          },
          { label: "Issues this month", value: counts.issuedThisMonth, hint: "stock sent out" },
        ]}
        links={[
          { label: "Receive", href: "/inventory/receive", primary: true },
          { label: "Stock", href: "/inventory/stock" },
          { label: "Issues", href: "/inventory/issues" },
        ]}
      />
    </div>
  );
}
