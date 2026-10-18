import { Avatar } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import Link from "next/link";
import type { ButtonHTMLAttributes, ReactNode } from "react";

/**
 * The tracker's pills (a plot, a date, a person, a status) and the trigger of every chip menu. Status tones carry fixed meaning (DESIGN.md):
 * danger is overdue or waiting on management, info is due soon, warning is waiting on someone else or a missing date, success is done. Words ride with the colour.
 */
export type PillTone = "plain" | "danger" | "info" | "warning" | "success" | "ink" | "dashed";

const TONES: Record<PillTone, string> = {
  plain: "border-border bg-surface-raised text-foreground/80",
  danger: "border-transparent bg-danger/10 text-danger font-semibold dark:bg-danger/20",
  info: "border-transparent bg-info/10 text-info dark:bg-info/20",
  warning: "border-transparent bg-warning/10 text-warning dark:bg-warning/20",
  success: "border-transparent bg-success/10 text-success dark:bg-success/20",
  ink: "border-transparent bg-foreground text-background",
  dashed: "border-dashed border-border bg-transparent text-muted",
};

export function pillClassName(tone: PillTone = "plain", interactive = false): string {
  return cn(
    "inline-flex h-7 max-w-full min-w-0 items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium whitespace-nowrap",
    TONES[tone],
    interactive &&
      "focus-visible:ring-accent/25 hover:border-foreground/20 cursor-pointer focus-visible:ring-4 focus-visible:outline-none",
  );
}

export function Pill({
  tone = "plain",
  className,
  children,
}: {
  tone?: PillTone;
  className?: string;
  children: ReactNode;
}) {
  return <span className={cn(pillClassName(tone), className)}>{children}</span>;
}

export function PillButton({
  tone = "plain",
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { tone?: PillTone }) {
  return (
    <button
      type="button"
      className={cn(
        pillClassName(tone, true),
        "disabled:cursor-default disabled:opacity-60",
        className,
      )}
      {...props}
    />
  );
}

/** "10 · Sanjeev Sudheer" — a plot by its number, set like a surveyed lot. */
export function PlotChip({
  number,
  clientName,
  href,
}: {
  number: string;
  clientName?: string | null;
  href?: string;
}) {
  const inner = (
    <>
      <span className="text-foreground font-mono font-bold tracking-tight">{number}</span>
      {clientName ? (
        <span className="text-muted max-w-40 truncate font-normal">{clientName}</span>
      ) : null}
    </>
  );
  const className = cn(
    pillClassName("plain", Boolean(href)),
    "bg-foreground/[0.05] border-transparent",
  );
  return href ? (
    <Link href={href} className={className}>
      {inner}
    </Link>
  ) : (
    <span className={className}>{inner}</span>
  );
}

export function PersonName({ name, size = 20 }: { name: string; size?: number }) {
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5">
      <Avatar name={name} size={size} letters={2} />
      <span className="truncate">{name.split(" ")[0]}</span>
    </span>
  );
}

/** Several faces, overlapping, with the rest counted — who is on a stage. */
export function Faces({
  names,
  max = 3,
  size = 22,
}: {
  names: string[];
  max?: number;
  size?: number;
}) {
  if (names.length === 0) return null;
  const shown = names.slice(0, max);
  const rest = names.length - shown.length;
  return (
    <span className="inline-flex items-center" title={names.join(", ")}>
      <span className="sr-only">{names.join(", ")}</span>
      {shown.map((name, index) => (
        <span
          key={`${name}-${index}`}
          aria-hidden="true"
          className={cn("ring-surface rounded-full ring-2", index > 0 && "-ml-1.5")}
        >
          <Avatar name={name} size={size} letters={2} />
        </span>
      ))}
      {rest > 0 ? (
        <span aria-hidden="true" className="text-muted ml-1 text-xs tabular-nums">
          +{rest}
        </span>
      ) : null}
    </span>
  );
}
