import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { TOOL_ICONS, TOOLS } from "@/lib/tools";
import Link from "next/link";

const MANAGEMENT_TOOLS = TOOLS.filter((tool) => tool.group === "Management");

export function ManagementVision() {
  return (
    <section>
      <div className="mb-3">
        <p className="text-muted text-xs font-semibold tracking-widest uppercase">Management</p>
        <p className="text-muted mt-1 text-xs">
          The next layer of the toolbox — planned, coming tool by tool.
        </p>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {MANAGEMENT_TOOLS.map((tool) => {
          const Icon = TOOL_ICONS[tool.icon];
          return (
            <Link key={tool.href} href={tool.href}>
              <Card className="hover:border-accent/40 h-full p-5 transition-colors">
                <div className="flex items-start justify-between">
                  <div className="bg-accent/10 text-accent flex size-10 items-center justify-center rounded-xl">
                    <Icon className="size-5" />
                  </div>
                  <Badge variant="neutral">Coming Soon</Badge>
                </div>
                <h3 className="text-foreground mt-3 text-sm font-semibold">{tool.name}</h3>
                <p className="text-muted mt-1 text-sm">{tool.description}</p>
              </Card>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
