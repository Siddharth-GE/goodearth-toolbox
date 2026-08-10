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
        // spinner-keeps-turning opts back out of the global
        // reduced-motion freeze in globals.css: a spinner that stops is a
        // page that looks broken, which helps nobody.
        "border-border border-t-accent spinner-keeps-turning size-10 animate-spin rounded-full border-4",
        className,
      )}
      {...props}
    />
  );
}
