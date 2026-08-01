import { cn } from "@/lib/utils";
import type { HTMLAttributes } from "react";

type Variant = "default" | "neutral" | "success" | "warning" | "danger" | "info";

// The four status variants are for anything with fixed meaning
// (Pending/Approved/Rejected, validation states) — see DESIGN.md.
//
// "default" applies no colour at all, for badges that supply their own
// identity colour via className (Marathon's CategoryBadge), which
// tailwind-merge lets win over these.
//
// "neutral" is the one to reach for otherwise. Plain "default" renders as
// bare text with padding — so an "Inactive" badge sat invisibly next to a
// green "Active" on the vendors and stores screens, reading as if nothing
// were there. One screen had already worked around it by hand with
// `className="bg-muted/15 text-muted"`; this is that, named.
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
        "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold",
        variantClasses[variant],
        className,
      )}
      {...props}
    />
  );
}
