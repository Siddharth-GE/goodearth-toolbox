import { ToolNav } from "@/components/ui/tool-nav";

/**
 * The design board's tabs (root plan.md, twelfth piece). The Board is the
 * Villas screen grown into it, so its href stays /villas and every link
 * into a villa keeps working. A villa's page and its transmittals belong
 * to the Board.
 */
const TABS = [
  { key: "board", href: "/design-management/villas", label: "Board" },
  { key: "actions", href: "/design-management/actions", label: "Actions" },
  { key: "stages", href: "/design-management/stages", label: "Design stages" },
] as const;

export function DesignNav() {
  return <ToolNav root="/design-management" tabs={TABS} defaultKey="board" />;
}
