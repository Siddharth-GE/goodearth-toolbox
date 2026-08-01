import { cn } from "@/lib/utils";
import type { InputHTMLAttributes } from "react";

export function Checkbox({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      type="checkbox"
      className={cn(
        "border-border text-accent accent-accent focus-visible:ring-accent size-4 shrink-0 rounded-md border transition-colors focus-visible:ring-2 focus-visible:outline-none disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}
