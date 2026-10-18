import { NavTabs } from "@/components/ui/tabs";

// Separate routes, so NavTabs (next/link pills), never Radix Tabs (DESIGN.md).
export function InventoryNav({
  active,
}: {
  active: "receive" | "stock" | "issues" | "adjustments";
}) {
  return (
    <NavTabs
      tabs={[
        { key: "receive", href: "/inventory/receive", label: "Receive" },
        { key: "stock", href: "/inventory/stock", label: "Stock" },
        { key: "issues", href: "/inventory/issues", label: "Issues" },
        { key: "adjustments", href: "/inventory/adjustments", label: "Adjustments" },
      ]}
      active={active}
    />
  );
}
