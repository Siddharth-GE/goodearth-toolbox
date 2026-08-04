import { cn } from "@/lib/utils";

// The Goodearth swirl, redrawn as vectors from the brand artwork: six
// arms (three blue, three green) around a white eye, one arm path
// rotated in 60° steps and the whole thing mirrored to match the
// original's direction. Inline SVG so it stays crisp at any size and
// needs no asset fetch; paths repeat instead of <use> because the brand
// renders more than once per page (rail + phone bar) and duplicate ids
// would be invalid. Brand artwork colors, not theme tokens — the mark
// must not change with light/dark mode.
const LOGO_ARM =
  "M 196,100 A 96,96 0 0 1 161.71,173.54 A 64,64 0 0 1 76.82,106.21 " +
  "A 24,24 0 0 0 89.86,121.75 A 64,64 0 0 0 196,100 Z";
const LOGO_BLUE = "#1B5EA6";
const LOGO_GREEN = "#8DC63F";

export function Logo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 200 200" className={cn("size-7 shrink-0", className)} aria-hidden="true">
      <g transform="translate(200 0) scale(-1 1)">
        {[0, 60, 120, 180, 240, 300].map((angle, index) => (
          <path
            key={angle}
            d={LOGO_ARM}
            transform={`rotate(${angle} 100 100)`}
            fill={index % 2 ? LOGO_GREEN : LOGO_BLUE}
          />
        ))}
      </g>
    </svg>
  );
}
