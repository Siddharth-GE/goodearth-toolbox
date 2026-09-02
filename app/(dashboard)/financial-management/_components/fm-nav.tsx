import { ToolNav } from "@/components/ui/tool-nav";

/**
 * NavTabs rather than Radix Tabs: three separate routes with their own
 * data and their own loading.tsx, not three panels of one page (the
 * CrmNav reasoning).
 */
const TABS = [
  { key: "cash", href: "/financial-management/cash", label: "Cash" },
  { key: "forward", href: "/financial-management/forward", label: "Forward" },
  { key: "funding", href: "/financial-management/funding", label: "Funding" },
] as const;

export function FmNav() {
  return <ToolNav root="/financial-management" tabs={TABS} defaultKey="cash" />;
}
