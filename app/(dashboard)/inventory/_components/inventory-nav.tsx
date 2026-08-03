import { NavTabs } from "@/components/ui/tabs";

/**
 * Inventory's four screens are separate routes, not panels of one page,
 * so this is NavTabs — the pill-styled next/link nav — never Radix
 * Tabs (DESIGN.md). Same shape as the Masters and Budgets navs.
 */
export function InventoryNav({
  active,
}: {
  active: "receive" | "stock" | "issues" | "adjustments";
}) {
  return (
    <NavTabs
      tabs={[
        { key: "receive", href: "/inventory", label: "Receive" },
        { key: "stock", href: "/inventory/stock", label: "Stock" },
        { key: "issues", href: "/inventory/issues", label: "Issues" },
        { key: "adjustments", href: "/inventory/adjustments", label: "Adjustments" },
      ]}
      active={active}
    />
  );
}
