import { cn } from "@/lib/utils";
import type { ButtonHTMLAttributes } from "react";

/** A square button holding only an icon. `aria-label` is required so the control is never invisible to a screen reader. */
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
