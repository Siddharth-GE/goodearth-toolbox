import { LinkButton } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Figure, FigureBand, FigureBandCell } from "@/components/ui/figure";
import { formatCount } from "@/lib/format";
import { TOOL_ICONS } from "@/lib/tools";

// A tool's opening screen: plain English, live counts, doors into the real screens.
// Counts only, never rupees: a welcome screen must not leak what the money views gate.
export function ToolWelcome({
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
  // A short last row shows the border colour through empty cells, so columns follow the stat count.
  const bandColumns =
    stats.length === 2
      ? "sm:grid-cols-2 lg:grid-cols-2"
      : stats.length === 3
        ? "sm:grid-cols-3 lg:grid-cols-3"
        : undefined;

  return (
    <div className="space-y-4">
      <Card className="p-6 md:p-8">
        <div className="bg-accent/10 text-accent flex size-12 items-center justify-center rounded-2xl">
          <Icon className="size-6" />
        </div>
        <div className="mt-3 max-w-prose space-y-2">
          {intro.map((paragraph) => (
            <p key={paragraph} className="text-muted text-base leading-relaxed">
              {paragraph}
            </p>
          ))}
        </div>
        <div className="mt-5 flex flex-wrap gap-2">
          {links.map((link) => (
            <LinkButton
              key={link.href}
              href={link.href}
              variant={link.primary ? "primary" : "secondary"}
              className="w-full sm:w-auto"
            >
              {link.label}
            </LinkButton>
          ))}
        </div>
      </Card>

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
