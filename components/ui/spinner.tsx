import { cn } from "@/lib/utils";
import type { HTMLAttributes } from "react";

// The shared loading indicator — used inside a route's loading.tsx and
// any Suspense fallback for a slow widget. See DESIGN.md's "Loading
// states" note: this is functional, not decorative motion.
//
// The fade-in lives on a wrapper, not on the ring itself. The ring needs
// two animations at once (the spin, plus a 160ms-delayed fade so a fast
// page never flashes), and `.spinner-keeps-turning`'s reduced-motion
// override sets a single `animation-duration`/`animation-iteration-count`
// that would apply to BOTH animations on one element — the fade would
// loop forever instead of settling at opaque. Keeping the ring's own
// animation to just `animate-spin` (untouched) means the reduced-motion
// opt-out still does only what it says: the ring keeps turning, nothing
// else. The wrapper's fade is ordinary motion, so the global
// reduced-motion rule freezes it (near-instantly) like everything else.
export function Spinner({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className="animate-fade-in inline-block opacity-0 [animation-delay:160ms] [animation-fill-mode:forwards]">
      <div
        role="status"
        aria-label="Loading"
        className={cn(
          // spinner-keeps-turning opts back out of the global
          // reduced-motion freeze in globals.css: a spinner that stops is
          // a page that looks broken, which helps nobody.
          "border-border border-t-accent spinner-keeps-turning size-8 animate-spin rounded-full border-2",
          className,
        )}
        {...props}
      />
    </div>
  );
}
