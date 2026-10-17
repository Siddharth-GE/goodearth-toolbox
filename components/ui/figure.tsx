import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

/**
 * A label over a number the app worked out: a conclusion, not an input. `size` is the point:
 * one `hero` per screen, a few `lg`, the rest `sm`, or there is no hierarchy. The steps stay close together.
 */
export function Figure({
  label,
  value,
  hint,
  tone,
  size = "sm",
  className,
}: {
  label: string;
  /** Already formatted — everything goes through lib/format.ts first. */
  value: ReactNode;
  hint?: ReactNode;
  tone?: "good" | "warn" | "bad";
  size?: "sm" | "lg" | "hero";
  className?: string;
}) {
  return (
    <div className={cn("min-w-0", className)}>
      <p className="text-muted text-[11px] font-medium tracking-[0.14em] uppercase">{label}</p>
      <p
        className={cn(
          "truncate tabular-nums",
          size === "sm" && "text-sm font-semibold",
          size === "lg" && "text-xl font-semibold tracking-tight",
          size === "hero" && "text-3xl font-semibold tracking-tight",
          tone === "good" && "text-success",
          tone === "warn" && "text-warning",
          tone === "bad" && "text-danger",
          !tone && "text-foreground",
        )}
      >
        {value}
      </p>
      {hint ? <p className="text-muted truncate text-xs">{hint}</p> : null}
    </div>
  );
}

/** Several figures as one divided band, not separate cards. Stacks on a phone. */
export function FigureBand({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div
      // The hairlines are the grid's 1px gaps with the border colour showing through, so they land both ways when it wraps (divide-x would not).
      className={cn(
        "border-border bg-border grid gap-px overflow-hidden rounded-2xl border",
        "sm:grid-cols-2 lg:grid-cols-4",
        className,
      )}
    >
      {children}
    </div>
  );
}

/** One cell of a FigureBand. Carries the surface the band's gaps reveal. */
export function FigureBandCell({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return <div className={cn("bg-surface px-4 py-3", className)}>{children}</div>;
}

/** What the model concluded from the fields above it, on a different surface from the input grid so "type this" and "the model says this" read apart. */
export function ResultPanel({
  title,
  aside,
  raised = false,
  className,
  children,
}: {
  title?: string;
  aside?: ReactNode;
  /** On a recessed surface (inside a `nested` Section) it lifts instead of recessing. */
  raised?: boolean;
  className?: string;
  children: ReactNode;
}) {
  // Recessed by default. Not bg-surface-raised: in light mode surface and surface-raised are both white.
  return (
    <div
      className={cn(
        "border-border rounded-xl border p-4",
        raised ? "bg-surface" : "bg-background",
        className,
      )}
    >
      {title || aside ? (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          {title ? (
            <p className="text-muted text-[11px] font-medium tracking-[0.14em] uppercase">
              {title}
            </p>
          ) : (
            <span />
          )}
          {aside}
        </div>
      ) : null}
      {children}
    </div>
  );
}
