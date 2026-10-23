import { cn } from "@/lib/utils";

/** The fill of a segment, by what the stage is doing; empty means not started. */
export type RailFill = "working" | "waiting" | "trouble" | "done" | null;

export type RailSegment = {
  key: string;
  /** Read aloud as "name: status", so the picture is never the only way to know. */
  label: string;
  status: string;
  fill: RailFill;
  /** The stage being worked: drawn taller, so it stands out among forty. */
  current?: boolean;
};

const FILL: Record<Exclude<RailFill, null>, string> = {
  working: "bg-info",
  waiting: "bg-warning",
  trouble: "bg-danger",
  done: "bg-accent",
};

/** Where something stands across its stages: one segment per stage, in order. Labels only when there are few enough to read. */
export function StageRail({
  segments,
  labels = false,
  className,
}: {
  segments: RailSegment[];
  labels?: boolean;
  className?: string;
}) {
  const description = segments.map((segment) => `${segment.label}: ${segment.status}`).join(", ");
  return (
    <div
      role="img"
      aria-label={description}
      className={cn("grid items-end", segments.length > 20 ? "gap-0.5" : "gap-1", className)}
      style={{ gridTemplateColumns: `repeat(${Math.max(segments.length, 1)}, minmax(0, 1fr))` }}
    >
      {segments.map((segment) => (
        <span key={segment.key} className="min-w-0">
          <span
            className={cn(
              "bg-foreground/[0.08] block overflow-hidden rounded-full",
              segment.current ? "h-3" : "h-1.5",
            )}
          >
            {segment.fill ? (
              <span className={cn("block h-full rounded-full", FILL[segment.fill])} />
            ) : null}
          </span>
          {labels ? (
            <span className="text-muted mt-1 block truncate text-[11px]" aria-hidden="true">
              {segment.label}
            </span>
          ) : null}
        </span>
      ))}
    </div>
  );
}
