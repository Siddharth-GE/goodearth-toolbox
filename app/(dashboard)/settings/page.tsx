import { ComingSoon } from "../_components/coming-soon";
import { TOOL_ICONS, TOOLS } from "@/lib/tools";

const tool = TOOLS.find((t) => t.href === "/settings")!;

export default function SettingsPage() {
  return <ComingSoon icon={TOOL_ICONS[tool.icon]} title={tool.name} description={tool.description} />;
}
