import { cn } from "@/lib/utils";
import type { TextareaHTMLAttributes } from "react";

/** The multi-line counterpart to Input. */
export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(
        "border-border bg-surface-raised text-foreground placeholder:text-muted/70 focus:border-accent focus:ring-accent/15 w-full rounded-xl border px-3.5 py-2.5 text-sm transition-[border-color,box-shadow] duration-150 focus:ring-4 focus:outline-none",
        className,
      )}
      {...props}
    />
  );
}
