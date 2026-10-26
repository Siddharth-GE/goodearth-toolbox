import { formatCount } from "@/lib/format";
import type { PlateLine } from "@/lib/overview/plate";
import { cn } from "@/lib/utils";
import { ChevronRight } from "lucide-react";
import Link from "next/link";

/** One plate line: the count, what it is and which tool, then up to five by name. A tap opens where it is done. */
export function PlateLines({
  lines,
  withItems = true,
}: {
  lines: PlateLine[];
  withItems?: boolean;
}) {
  return (
    <ul className="divide-border divide-y">
      {lines.map((entry) => (
        <li key={entry.key} className="py-2.5 first:pt-0 last:pb-0">
          <Link
            href={entry.href}
            className="hover:bg-foreground/[0.025] focus-visible:ring-accent/25 -mx-2 flex min-h-11 items-center gap-3 rounded-xl px-2 focus-visible:ring-4 focus-visible:outline-none"
          >
            <span
              className={cn(
                "min-w-9 shrink-0 text-right font-mono text-lg font-semibold tabular-nums",
                entry.urgent ? "text-warning" : "text-foreground",
              )}
            >
              {formatCount(entry.count)}
            </span>
            <span className="min-w-0 flex-1">
              <span className="text-foreground block text-sm font-medium">{entry.label}</span>
              <span className="text-muted block text-xs">{entry.tool}</span>
            </span>
            <ChevronRight className="text-muted size-4 shrink-0" aria-hidden />
          </Link>
          {withItems && entry.items.length > 0 && (
            <ul className="mt-1 ml-12 space-y-1">
              {entry.items.map((item) => (
                <li key={`${item.href}|${item.label}`}>
                  <Link href={item.href} className="text-muted text-xs hover:underline">
                    <span className="text-foreground">{item.label}</span>
                    {item.detail ? ` · ${item.detail}` : ""}
                  </Link>
                </li>
              ))}
              {entry.count > entry.items.length && (
                <li className="text-muted text-xs">
                  {`and ${formatCount(entry.count - entry.items.length)} more`}
                </li>
              )}
            </ul>
          )}
        </li>
      ))}
    </ul>
  );
}
