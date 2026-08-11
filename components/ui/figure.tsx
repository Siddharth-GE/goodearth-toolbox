import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

/**
 * A label over a number the app worked out. Not an input — a conclusion.
 *
 * Built because the same block had been hand-written four times inside
 * Business Planning alone, with four slightly different label styles, and
 * a dozen more times across the other tools. DESIGN.md's rule is to build
 * the THIRD copy into a shared component; this was well past it.
 *
 * `size` is the whole point of having it. A screen where every figure is
 * `text-sm` has no hierarchy, and the reader has to work out which number
 * is the answer. One `hero` per screen, a few `lg`, the rest `sm`.
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
      <p className="text-muted text-xs font-semibold tracking-widest uppercase">{label}</p>
      <p
        className={cn(
          "truncate font-mono tabular-nums",
          size === "sm" && "text-sm font-semibold",
          size === "lg" && "text-xl font-bold tracking-tight",
          size === "hero" && "text-3xl font-extrabold tracking-tight",
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

/**
 * Several figures reading as one object rather than as separate cards.
 *
 * Four stretched cards say "four things"; one divided band says "four
 * views of the same thing", which is what a set of summary figures
 * usually is. Stacks on a phone, where the dividers would only crowd it.
 */
export function FigureBand({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div
      className={cn(
        "divide-border border-border grid gap-px overflow-hidden rounded-xl border",
        "bg-border sm:grid-cols-2 lg:grid-cols-4",
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

/**
 * The block a form uses to show what the model concluded from the fields
 * above it.
 *
 * Deliberately a different surface from the input grid. Business Planning
 * used the same grid, gap and label style for "type this" and "the model
 * says this", so the only thing distinguishing them was whether a box had
 * a border — which is not a distinction anyone reads.
 */
export function ResultPanel({
  title,
  aside,
  raised = false,
  className,
  children,
}: {
  title?: string;
  aside?: ReactNode;
  /**
   * This panel sits on a recessed surface (inside a `nested` Section), so
   * it lifts rather than recessing. Without it the panel and its parent
   * are the same colour and the distinction disappears.
   */
  raised?: boolean;
  className?: string;
  children: ReactNode;
}) {
  // Recessed by default — the page colour showing through a card. Not
  // bg-surface-raised: in light mode `surface` and `surface-raised` are
  // both white, so a "raised" panel inside a white card would be told
  // apart by nothing but its border.
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
            <p className="text-muted text-xs font-semibold tracking-widest uppercase">{title}</p>
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
