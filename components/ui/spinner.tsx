import { cn } from "@/lib/utils";
import type { HTMLAttributes } from "react";

// The shared loading indicator — used inside a route's loading.tsx and
// any Suspense fallback for a slow widget. See DESIGN.md's "Loading
// states" note: this is functional, not decorative motion.
export function Spinner({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      role="status"
      aria-label="Loading"
      className={cn(
        "border-border border-t-accent size-10 animate-spin rounded-full border-4",
        className,
      )}
      {...props}
    />
  );
}
