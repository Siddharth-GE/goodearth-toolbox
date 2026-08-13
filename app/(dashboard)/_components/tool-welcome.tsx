import { LinkButton } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Figure, FigureBand, FigureBandCell } from "@/components/ui/figure";
import { formatCount } from "@/lib/format";
import { TOOL_ICONS } from "@/lib/tools";

// The screen a tool opens on: what it's for in plain English, a few live
// counts, and the doors into the real screens. Shared by every Operations
// and Management tool (the founder's ask — no tool drops you straight onto
// a table any more). Lives beside coming-soon.tsx because it's the same
// kind of thing: a cross-tool screen composition, not a ui primitive.
//
// Counts only, never rupees — a welcome screen must not leak what the
// money views gate. Each tool fetches its own stats through its own
// requireTool-gated query and passes plain numbers here.
export function ToolWelcome({
  icon,
  intro,
  stats,
  links,
}: {
  icon: keyof typeof TOOL_ICONS;
  /** 1–2 short plain-English paragraphs. */
  intro: string[];
  stats: { label: string; value: number; hint?: string }[];
  links: { label: string; href: string; primary?: boolean }[];
}) {
  const Icon = TOOL_ICONS[icon];
  // A band whose last row is short shows the border colour through the
  // empty cells, so the column count follows the stat count exactly.
  const bandColumns =
    stats.length === 2
      ? "sm:grid-cols-2 lg:grid-cols-2"
      : stats.length === 3
        ? "sm:grid-cols-3 lg:grid-cols-3"
        : undefined;

  return (
    <div className="space-y-4">
      <Card className="p-5 md:p-6">
        <div className="bg-accent/10 text-accent flex size-9 items-center justify-center rounded-lg">
          <Icon className="size-5" />
        </div>
        <div className="mt-3 max-w-prose space-y-2">
          {intro.map((paragraph) => (
            <p key={paragraph} className="text-muted text-sm">
              {paragraph}
            </p>
          ))}
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {links.map((link) => (
            <LinkButton
              key={link.href}
              href={link.href}
              variant={link.primary ? "primary" : "secondary"}
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
