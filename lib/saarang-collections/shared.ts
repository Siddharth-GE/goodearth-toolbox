/** Saarang Collections' vocabulary: 0161's CHECK lists and small pure helpers, safe in "use server" files and client components. */
import { lastDayOfMonth, shiftMonth } from "@/lib/dates";
import type { Project, ValueKey } from "./core";

export const GRANT = "/saarang-collections";

export const PROJECT_NAMES: Record<Project, string> = {
  plot: "Saarang Plot",
  villa: "Saarang Villa",
};

/** The cells typed by hand, as 0161's saarang_collection_figures_key_known allows them. */
export const FIGURE_KEYS = {
  plot: ["C", "D", "G", "I", "J", "K", "N", "Q", "R", "T"],
  villa: ["C", "D", "G", "I", "J", "K", "N", "Q", "R", "T"],
  phase3: ["C", "E", "N", "O", "P", "F", "M", "H", "MTD", "T"],
} as const;
export type FigureProject = keyof typeof FIGURE_KEYS;

export function isFigureCell(project: string, key: string): project is FigureProject {
  return (
    Object.hasOwn(FIGURE_KEYS, project) &&
    (FIGURE_KEYS[project as FigureProject] as readonly string[]).includes(key)
  );
}

/** The calendar month before the one `iso` falls in: the collection period the page offers. */
export function previousMonth(iso: string): { from: string; to: string } {
  const month = shiftMonth(iso.slice(0, 7), -1);
  return { from: `${month}-01`, to: lastDayOfMonth(month) };
}

export const UNIT_PATTERN = /^SAARANG-(PLOT|VILLA)-/;

// A Record, so a figure core.ts gains fails to compile until it is kept too (and 0162's CHECK widened).
const KEPT: Record<ValueKey, true> = {
  E: true,
  F: true,
  H: true,
  L: true,
  M: true,
  MTD: true,
  Munits: true,
  O: true,
  P: true,
  S: true,
};

/** The worked-out figures kept for Turing, as 0162's CHECK lists them. */
export const SUMMARY_KEYS = Object.keys(KEPT) as ValueKey[];
