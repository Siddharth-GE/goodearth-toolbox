import { cn } from "@/lib/utils";
import type { HTMLAttributes } from "react";

type Variant = "default" | "success" | "warning" | "danger" | "info";

// "default" applies no color — Marathon's CategoryBadge (and anything
// else picking its own identity color) supplies that via className,
// which tailwind-merge lets win over these. The four status variants
// are for anything with fixed meaning (Pending/Approved/Rejected,
// validation states) — see DESIGN.md.
const variantClasses: Record<Variant, string> = {
  default: "",
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
