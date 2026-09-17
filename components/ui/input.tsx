import { cn } from "@/lib/utils";
import type { InputHTMLAttributes } from "react";

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "border-border bg-surface-raised text-foreground placeholder:text-muted/70 focus:border-accent focus:ring-accent/15 h-11 w-full rounded-xl border px-3.5 text-sm transition-[border-color,box-shadow] duration-150 focus:ring-4 focus:outline-none",
        className,
      )}
      {...props}
    />
  );
}
