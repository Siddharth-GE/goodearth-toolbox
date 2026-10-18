import { cn } from "@/lib/utils";
import type { HTMLAttributes } from "react";

// The shared loading indicator for loading.tsx and Suspense fallbacks (DESIGN.md "Loading states"): functional, not decorative.
// The fade-in lives on a wrapper: `.spinner-keeps-turning` sets one animation-duration for the element, which would make a fade on the ring loop forever.
export function Spinner({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className="animate-fade-in inline-block opacity-0 [animation-delay:160ms] [animation-fill-mode:forwards]">
      <div
        role="status"
        aria-label="Loading"
        className={cn(
          // spinner-keeps-turning opts out of the global reduced-motion freeze: a stopped spinner looks broken.
          "border-border border-t-accent spinner-keeps-turning size-8 animate-spin rounded-full border-2",
          className,
        )}
        {...props}
      />
    </div>
  );
}
