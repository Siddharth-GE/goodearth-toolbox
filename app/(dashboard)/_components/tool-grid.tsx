import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import type { ToolSection } from "@/lib/nav/arrange";
import { TOOL_ICONS } from "@/lib/tools";
import Link from "next/link";

export function ToolGrid({ sections }: { sections: ToolSection[] }) {
  return (
    <div className="space-y-8">
      {sections.map(({ key, name, tools: groupTools }) => (
        <section key={key}>
          <p className="text-muted mb-3 text-[11px] font-medium tracking-[0.14em] uppercase">
            {name}
          </p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {groupTools.map((tool) => {
              const Icon = TOOL_ICONS[tool.icon];
              // `tools` is visibleTools()'s output, the sidebar's rule: built ones are held (no requireTool bounce),
              // unbuilt ones lead to the ungated Coming Soon stub.
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
