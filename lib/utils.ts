import { type ClassValue, clsx } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

/**
 * tailwind-merge knows Tailwind's own scales and nothing else, so the
 * custom names registered in app/globals.css are invisible to it.
 * Measured: `twMerge("shadow-float shadow-none")` returns BOTH classes,
 * which means a caller passing `shadow-none` to a component that already
 * sets `shadow-float` could never turn the shadow off — the last class
 * in the stylesheet would win instead of the last class passed in.
 *
 * So every custom shadow, easing and animation name added to the
 * `@theme inline` block has to be listed here as well, or cn() quietly
 * stops being a merge for that name.
 */
const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      shadow: ["float"],
      ease: ["out-quint", "spring"],
      animate: [
        "pop-in",
        "pop-out",
        "fade-in",
        "fade-out",
        "menu-in",
        "sheet-in",
        "sheet-out",
        "slide-in-left",
        "slide-out-left",
      ],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
