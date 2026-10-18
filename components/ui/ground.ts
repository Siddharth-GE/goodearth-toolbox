import type { TeamGround } from "@/lib/nav/arrange";

// Literal class names, so Tailwind finds them in the source.
export const GROUND_CLASS: Record<TeamGround, string> = {
  burgundy: "ground-burgundy",
  teal: "ground-teal",
  olive: "ground-olive",
  ochre: "ground-ochre",
  sage: "ground-sage",
  blush: "ground-blush",
  ink: "ground-ink",
};

export const GROUND_SWATCH: Record<TeamGround, string> = {
  burgundy: "bg-brand-burgundy",
  teal: "bg-brand-teal",
  olive: "bg-brand-olive",
  ochre: "bg-brand-ochre",
  sage: "bg-brand-sage",
  blush: "bg-brand-blush",
  ink: "bg-brand-ink",
};
