import { LinkButton } from "@/components/ui/button";
import { Figure, FigureBand, FigureBandCell } from "@/components/ui/figure";
import { GROUND_CLASS } from "@/components/ui/ground";
import { formatCount } from "@/lib/format";
import { teamOfTool } from "@/lib/nav/arrange";
import { getToolArrangement } from "@/lib/nav/queries";
import { TOOL_ICONS, TOOLS } from "@/lib/tools";
import { cn } from "@/lib/utils";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";

// A tool's opening screen: a band in its team's colour, plain English, live counts, doors into the real screens.
// Counts only, never rupees: a welcome screen must not leak what the money views gate.
export async function ToolWelcome({
  icon,
  intro,
  stats,
  links,
}: {
  icon: keyof typeof TOOL_ICONS;
  intro: string[];
  stats: { label: string; value: number; hint?: string }[];
  links: { label: string; href: string; primary?: boolean }[];
}) {
  const Icon = TOOL_ICONS[icon];
  // Each tool has its own icon, so the icon names the tool. The arrangement read is cached per request.
  const href = TOOLS.find((tool) => tool.icon === icon)?.href ?? "";
  const team = teamOfTool(await getToolArrangement(), href);
  // A short last row shows the border colour through empty cells, so columns follow the stat count.
  const bandColumns =
    stats.length === 2
      ? "sm:grid-cols-2 lg:grid-cols-2"
      : stats.length === 3
        ? "sm:grid-cols-3 lg:grid-cols-3"
        : undefined;

  return (
    <div className="space-y-4">
      <section
        className={cn(
          GROUND_CLASS[team.ground],
          "bg-ground text-on-ground dark:ring-border rounded-2xl p-6 md:p-10 dark:ring-1",
        )}
      >
        <div className="flex items-start justify-between gap-4">
          <Link
            href={`/team/${team.slug}`}
            className="text-on-ground/75 hover:text-on-ground inline-flex items-center gap-1.5 text-[11px] font-medium tracking-[0.14em] uppercase transition-colors"
          >
            <ArrowLeft className="size-3.5" aria-hidden />
            {team.name}
          </Link>
          <Icon className="text-ground-mark size-6 shrink-0" aria-hidden />
        </div>
        <div className="mt-6 max-w-prose space-y-3">
          {intro.map((paragraph) => (
            <p key={paragraph} className="text-on-ground text-base leading-relaxed">
              {paragraph}
            </p>
          ))}
        </div>
        <div className="mt-8 flex flex-wrap gap-2">
          {links.map((link) => (
            <LinkButton
              key={link.href}
              href={link.href}
              variant={link.primary ? "ground" : "groundOutline"}
              className="w-full sm:w-auto"
            >
              {link.label}
            </LinkButton>
          ))}
        </div>
      </section>

      {stats.length > 0 && (
        <FigureBand className={bandColumns}>
          {stats.map((stat) => (
            <FigureBandCell key={stat.label}>
              <Figure
                label={stat.label}
                value={formatCount(stat.value)}
                hint={stat.hint}
                size="lg"
              />
            </FigureBandCell>
          ))}
        </FigureBand>
      )}
    </div>
  );
}
