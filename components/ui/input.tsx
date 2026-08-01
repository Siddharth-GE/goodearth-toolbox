import { cn } from "@/lib/utils";
import type { InputHTMLAttributes } from "react";

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "border-border bg-surface text-foreground placeholder:text-muted focus:ring-accent h-11 w-full rounded-xl border px-3.5 text-sm transition-colors focus:ring-2 focus:outline-none",
        className,
      )}
      {...props}
    />
  );
}
