import { cn } from "@/lib/utils";
import type { SelectHTMLAttributes } from "react";

export function Select({ className, children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        "h-11 w-full rounded-xl border border-border bg-surface px-3.5 text-sm text-foreground transition-colors focus:outline-none focus:ring-2 focus:ring-accent",
        className,
      )}
      {...props}
    >
      {children}
    </select>
  );
}
