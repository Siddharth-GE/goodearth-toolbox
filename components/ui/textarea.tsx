import { cn } from "@/lib/utils";
import type { TextareaHTMLAttributes } from "react";

// Same visual language as Input, but auto-height is deliberately left to
// the caller's `rows` — a note field that grows while you type shifts
// everything below it, which is exactly what a dense line grid must not do.
export function Textarea({ className, rows = 3, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      rows={rows}
      className={cn(
        "w-full rounded-xl border border-border bg-surface px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted transition-colors focus:outline-none focus:ring-2 focus:ring-accent",
        className,
      )}
      {...props}
    />
  );
}
