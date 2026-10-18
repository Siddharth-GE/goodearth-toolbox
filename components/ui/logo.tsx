import { cn } from "@/lib/utils";

// The Kaadal 'K' mark from the brand artwork (`kaadal-k-*.svg`); change the paths only from that artwork.
// Brand colours, not theme tokens: burgundy on light, blush on dark, so the mark is never just the text colour.
const MARK_PATHS = [
  "M36.57 0.00L63.77 0.00C61.11 9.14 46.99 20.49 30.44 26.74C46.30 9.72 36.57 0.00 36.57 0.00",
  "M24.77 65.74L0.00 65.74C1.73 63.89 2.31 61.57 2.31 58.91L2.31 6.25C2.31 3.82 1.73 1.85 0.00 0.00L21.76 0.00L21.76 58.91C21.76 61.57 22.92 63.89 24.77 65.74",
  "M53.82 65.74L67.13 65.74C61.11 62.73 54.40 40.28 52.78 35.53C52.78 35.53 44.10 41.90 30.44 29.74L39.35 56.25C41.78 64.00 49.54 65.74 53.82 65.74",
];

export function Logo({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 67.13 65.74"
      className={cn("size-7 shrink-0 fill-[#521323] dark:fill-[#dec8b7]", className)}
      aria-hidden="true"
    >
      {MARK_PATHS.map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}
