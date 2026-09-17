import { cn } from "@/lib/utils";
import type { ButtonHTMLAttributes } from "react";

/**
 * A square button holding only an icon.
 *
 * Four of these were written by hand across Selections alone — a delete
 * control, a view reorder control, and two quantity steppers that were
 * the same component twice, differing only by `size-8` versus `size-7`.
 * They drifted: some had a focus ring, some didn't; some dimmed when
 * disabled, some stayed clickable.
 *
 * `aria-label` is required, not optional. An icon-only control with no
 * label is invisible to a screen reader, and making it a required prop
 * is the only way that stays true as more get added.
 */
type Tone = "default" | "danger";
type Size = "sm" | "md";

const toneClasses: Record<Tone, string> = {
  default: "text-muted hover:bg-foreground/[0.05] hover:text-foreground",
  danger: "text-muted hover:bg-danger/10 hover:text-danger",
};

const sizeClasses: Record<Size, string> = {
  sm: "size-7",
  md: "size-8",
};

export function IconButton({
  className,
  tone = "default",
  size = "md",
  bordered = false,
  type = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  "aria-label": string;
  tone?: Tone;
  size?: Size;
  /** Steppers and reorder controls read better with an outline. */
  bordered?: boolean;
}) {
  return (
    <button
      type={type}
      className={cn(
        "focus-visible:ring-accent inline-flex items-center justify-center rounded-lg transition-[background-color,color,transform] focus-visible:ring-2 focus-visible:outline-none active:scale-95 disabled:pointer-events-none disabled:opacity-30",
        toneClasses[tone],
        sizeClasses[size],
        bordered && "border-border border",
        className,
      )}
      {...props}
    />
  );
}
