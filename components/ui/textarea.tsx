import { cn } from "@/lib/utils";
import type { TextareaHTMLAttributes } from "react";

/**
 * The multi-line counterpart to Input.
 *
 * DESIGN.md listed this as "deliberately not built — add only when a real
 * tool needs it". Two tools now do (the issue-revision note and the
 * item-request spec note), and both had copied the same 100-character
 * class string by hand, so the rule has done its job and this is the
 * answer it was waiting for.
 */
export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(
        "border-border bg-surface text-foreground placeholder:text-muted focus:ring-accent w-full rounded-xl border px-3.5 py-2.5 text-sm transition-colors focus:ring-2 focus:outline-none",
        className,
      )}
      {...props}
    />
  );
}
