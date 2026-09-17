import { cn } from "@/lib/utils";
import type { SelectHTMLAttributes } from "react";

export function Select({ className, children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        "border-border bg-surface-raised text-foreground focus:border-accent focus:ring-accent/15 h-11 w-full rounded-xl border px-3.5 text-sm transition-[border-color,box-shadow] duration-150 focus:ring-4 focus:outline-none",
        className,
      )}
      {...props}
    >
      {children}
    </select>
  );
}
