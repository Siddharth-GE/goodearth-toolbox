import { type ClassValue, clsx } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

/**
 * tailwind-merge knows only Tailwind's own scales, so every custom shadow, easing and animation name in
 * globals.css' `@theme inline` must be listed here, or cn() keeps both classes and a caller can't override.
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
