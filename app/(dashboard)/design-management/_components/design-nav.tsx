import { ToolNav } from "@/components/ui/tool-nav";

/** The Board keeps the old /villas href so every link into a villa works. */
const TABS = [
  { key: "board", href: "/design-management/villas", label: "Board" },
  { key: "actions", href: "/design-management/actions", label: "Actions" },
  { key: "stages", href: "/design-management/stages", label: "Design stages" },
] as const;

export function DesignNav() {
  return <ToolNav root="/design-management" tabs={TABS} defaultKey="board" />;
}
