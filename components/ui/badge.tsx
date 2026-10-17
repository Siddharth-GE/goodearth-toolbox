import { cn } from "@/lib/utils";
import type { HTMLAttributes } from "react";

type Variant = "default" | "neutral" | "success" | "warning" | "danger" | "info";

// The four status variants are for anything with fixed meaning (DESIGN.md). "default" applies no colour,
// so badges can supply their own via className. "neutral" is the one to reach for otherwise:
// plain "default" renders as bare text with padding.
const variantClasses: Record<Variant, string> = {
  default: "",
  neutral: "bg-muted/15 text-muted",
  success: "bg-success/10 text-success dark:bg-success/20",
  warning: "bg-warning/10 text-warning dark:bg-warning/20",
  danger: "bg-danger/10 text-danger dark:bg-danger/20",
  info: "bg-info/10 text-info dark:bg-info/20",
};

export function Badge({
  className,
  variant = "default",
  ...props
}: HTMLAttributes<HTMLSpanElement> & { variant?: Variant }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium tracking-wide ring-1 ring-current/10 ring-inset",
        variantClasses[variant],
        className,
      )}
      {...props}
    />
  );
}
