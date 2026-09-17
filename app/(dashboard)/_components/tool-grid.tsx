import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { TOOL_ICONS, type Tool, type ToolGroup } from "@/lib/tools";
import Link from "next/link";

// Mirrors the sidebar's group order (components/layout/sidebar.tsx's
// GROUP_ORDER isn't exported, so it's duplicated here).
const GROUP_ORDER: ToolGroup[] = ["Management", "Operations", "Events", "People", "Admin"];

export function ToolGrid({ tools }: { tools: Tool[] }) {
  const groups = GROUP_ORDER.map((group) => ({
    group,
    tools: tools.filter((tool) => tool.group === group),
  })).filter((g) => g.tools.length > 0);

  return (
    <div className="space-y-8">
      {groups.map(({ group, tools: groupTools }) => (
        <section key={group}>
          <p className="text-muted mb-3 text-[11px] font-medium tracking-[0.14em] uppercase">
            {group}
          </p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {groupTools.map((tool) => {
              const Icon = TOOL_ICONS[tool.icon];
              // Every card links. `tools` is visibleTools()'s own output —
              // the same rule the sidebar uses — so a built tool here is one
              // the person holds (the click cannot bounce off requireTool),
              // and an unbuilt one leads to its ungated Coming Soon stub.
              const card = (
                <Card interactive className="h-full p-5">
                  <div className="flex items-start justify-between">
                    <div className="bg-accent/10 text-accent flex size-10 items-center justify-center rounded-xl">
                      <Icon className="size-5" />
                    </div>
                    {!tool.built && <Badge variant="neutral">Coming soon</Badge>}
                  </div>
                  <h3 className="text-foreground mt-3 text-sm font-semibold">{tool.name}</h3>
                  <p className="text-muted mt-1 text-sm">{tool.description}</p>
                </Card>
              );
              return (
                <Link key={tool.href} href={tool.href}>
                  {card}
                </Link>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
