import { cn } from "@/lib/utils";
import type { SelectHTMLAttributes } from "react";

export function Select({ className, children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        "border-border bg-surface text-foreground focus:ring-accent h-11 w-full rounded-xl border px-3.5 text-sm transition-colors focus:ring-2 focus:outline-none",
        className,
      )}
      {...props}
    >
      {children}
    </select>
  );
}
