import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { GROUND_CLASS } from "@/components/ui/ground";
import { formatCount } from "@/lib/format";
import type { ToolSection } from "@/lib/nav/arrange";
import { TOOL_ICONS } from "@/lib/tools";
import { cn } from "@/lib/utils";
import { ArrowLeft, ArrowRight } from "lucide-react";
import Link from "next/link";

/** A team's front door: a band in its colour, then its tools as boxes. */
export function TeamTools({ team }: { team: ToolSection }) {
  return (
    <div className="space-y-6">
      <section
        className={cn(
          GROUND_CLASS[team.ground],
          "bg-ground text-on-ground dark:ring-border rounded-2xl p-6 md:p-10 dark:ring-1",
        )}
      >
        <Link
          href="/"
          className="text-on-ground/75 hover:text-on-ground inline-flex items-center gap-1.5 text-[11px] font-medium tracking-[0.14em] uppercase transition-colors"
        >
          <ArrowLeft className="size-3.5" aria-hidden />
          Overview
        </Link>
        <h1 className="font-display mt-8 text-4xl font-medium text-balance md:text-6xl">
          {team.name}
        </h1>
        <p className="text-on-ground/80 mt-3 text-sm">
          {formatCount(team.tools.length)} {team.tools.length === 1 ? "tool" : "tools"}
        </p>
      </section>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {team.tools.map((tool) => {
          const Icon = TOOL_ICONS[tool.icon];
          return (
            <Link key={tool.href} href={tool.href}>
              <Card interactive className="flex h-full min-h-48 flex-col p-6">
                <div className="flex items-start justify-between">
                  <div className="bg-accent/10 text-accent flex size-11 items-center justify-center rounded-xl">
                    <Icon className="size-5" />
                  </div>
                  {!tool.built && <Badge variant="neutral">Coming soon</Badge>}
                </div>
                <h2 className="font-display text-foreground mt-6 text-2xl font-medium">
                  {tool.name}
                </h2>
                <p className="text-muted mt-1.5 text-sm">{tool.description}</p>
                <span className="text-accent mt-auto inline-flex items-center gap-1 pt-5 text-sm font-medium">
                  Open
                  <ArrowRight className="size-4" aria-hidden />
                </span>
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
