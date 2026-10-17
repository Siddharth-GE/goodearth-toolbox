import type { ReactNode } from "react";

// Animates appearing content via a height transition. The inner min-w-0 is load-bearing:
// a grid item otherwise sizes to its widest line and blows the page out sideways.
export function AnimatedReveal({ show, children }: { show: boolean; children: ReactNode }) {
  return (
    <div
      className={`grid grid-cols-1 transition-[grid-template-rows] duration-200 ${show ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}
    >
      <div className="min-w-0 overflow-hidden">{children}</div>
    </div>
  );
}
