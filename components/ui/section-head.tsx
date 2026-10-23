import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

/** A titled run of cards on a board or a villa page: the title, a count, and a hint that wraps under it on a phone. */
export function SectionHead({
  title,
  count,
  hint,
  tone,
  aside,
}: {
  title: string;
  count?: number;
  hint?: string;
  tone?: "danger" | "info" | "muted";
  aside?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5 px-0.5 pt-4 pb-1">
      <h3
        className={cn(
          "text-[15px] font-semibold tracking-tight",
          tone === "danger" && "text-danger",
          tone === "info" && "text-info",
          tone === "muted" && "text-muted",
          !tone && "text-foreground",
        )}
      >
        {title}
      </h3>
      {count !== undefined ? (
        <span className="text-muted text-xs font-semibold tabular-nums">{count}</span>
      ) : null}
      {hint ? (
        <span className="text-muted ml-auto text-xs max-sm:ml-0 max-sm:w-full">{hint}</span>
      ) : null}
      {aside ? <span className="ml-auto self-center">{aside}</span> : null}
    </div>
  );
}
