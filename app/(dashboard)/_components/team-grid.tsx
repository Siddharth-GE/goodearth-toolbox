import { GROUND_CLASS } from "@/components/ui/ground";
import { formatCount } from "@/lib/format";
import type { ToolSection } from "@/lib/nav/arrange";
import { cn } from "@/lib/utils";
import { ArrowRight } from "lucide-react";
import Link from "next/link";

const SHOWN = 4;

/** The home page's teams as solid brand blocks, each opening its team page. The same sections as the sidebar. */
export function TeamGrid({ sections }: { sections: ToolSection[] }) {
  return (
    <section>
      <p className="text-muted mb-3 text-[11px] font-medium tracking-[0.14em] uppercase">Teams</p>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {sections.map((section) => {
          const more = section.tools.length - SHOWN;
          return (
            <Link
              key={section.key}
              href={`/team/${section.slug}`}
              className={cn(
                GROUND_CLASS[section.ground],
                "bg-ground text-on-ground ease-out-quint hover:shadow-float focus-visible:ring-accent/40 flex min-h-40 flex-col rounded-2xl p-6 transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5 focus-visible:ring-4 focus-visible:outline-none sm:min-h-56",
              )}
            >
              <h2 className="font-display text-3xl font-medium text-balance">{section.name}</h2>
              <ul className="text-on-ground/85 mt-4 space-y-1 text-sm">
                {section.tools.slice(0, SHOWN).map((tool) => (
                  <li key={tool.href} className="truncate">
                    {tool.name}
                  </li>
                ))}
                {more > 0 && <li>and {formatCount(more)} more</li>}
              </ul>
              <span className="mt-auto inline-flex items-center gap-1 pt-6 text-sm font-medium">
                {formatCount(section.tools.length)} {section.tools.length === 1 ? "tool" : "tools"}
                <ArrowRight className="size-4" aria-hidden />
              </span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
