import type { ReactNode } from "react";

// Wraps content that appears/disappears based on state (a live preview,
// a validation warning) so it animates in via a height transition
// instead of popping and shoving the rest of the page around. The
// min-w-0 on the inner wrapper is load-bearing, not decorative: an
// unconstrained CSS grid item will size to its widest unwrapped line
// and blow the whole page out horizontally rather than just wrapping
// the text — a real bug this project hit once.
export function AnimatedReveal({ show, children }: { show: boolean; children: ReactNode }) {
  return (
    <div
      className={`grid grid-cols-1 transition-[grid-template-rows] duration-200 ${show ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}
    >
      <div className="min-w-0 overflow-hidden">{children}</div>
    </div>
  );
}
