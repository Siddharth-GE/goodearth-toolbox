import { ToolNav } from "@/components/ui/tool-nav";

const TABS = [
  { key: "summary", href: "/saarang-collections/summary", label: "Summary" },
  { key: "reports", href: "/saarang-collections/reports", label: "Reports" },
  { key: "rules", href: "/saarang-collections/rules", label: "Rules" },
] as const;

export function CollectionsNav() {
  return <ToolNav root="/saarang-collections" tabs={TABS} defaultKey="summary" />;
}
