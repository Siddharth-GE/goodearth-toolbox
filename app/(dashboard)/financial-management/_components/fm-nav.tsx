import { ToolNav } from "@/components/ui/tool-nav";

/** NavTabs, not Radix Tabs: separate routes with their own data and loading.tsx (the CrmNav reasoning). */
const TABS = [
  { key: "cash", href: "/financial-management/cash", label: "Cash" },
  { key: "forward", href: "/financial-management/forward", label: "Forward" },
  { key: "funding", href: "/financial-management/funding", label: "Funding" },
  { key: "birdwing", href: "/financial-management/birdwing", label: "Birdwing" },
] as const;

export function FmNav() {
  return <ToolNav root="/financial-management" tabs={TABS} defaultKey="cash" />;
}
