import { ComingSoon } from "../_components/coming-soon";
import { TOOL_ICONS, TOOLS } from "@/lib/tools";

const tool = TOOLS.find((t) => t.href === "/bills")!;

export default function BillsPage() {
  return (
    <ComingSoon icon={TOOL_ICONS[tool.icon]} title={tool.name} description={tool.description} />
  );
}
