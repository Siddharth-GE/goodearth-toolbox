import { ToolNav } from "@/components/ui/tool-nav";

const TABS = [
  { key: "orders", href: "/kaadal-billing/orders", label: "Orders" },
  { key: "payments", href: "/kaadal-billing/payments", label: "Payments" },
  { key: "plots", href: "/kaadal-billing/plots", label: "Plots" },
  { key: "vendors", href: "/kaadal-billing/vendors", label: "Vendors" },
  { key: "checks", href: "/kaadal-billing/checks", label: "Checks" },
] as const;

export function BillingNav() {
  return <ToolNav root="/kaadal-billing" tabs={TABS} defaultKey="orders" />;
}
