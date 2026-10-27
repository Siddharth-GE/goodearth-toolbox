/** Saarang Collections' vocabulary: 0161's CHECK lists and small pure helpers. Imports nothing, so "use server" files and client components can share it. */

export const GRANT = "/saarang-collections";

export const PROJECTS = ["plot", "villa"] as const;
export type Project = (typeof PROJECTS)[number];
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
    project in FIGURE_KEYS &&
    (FIGURE_KEYS[project as FigureProject] as readonly string[]).includes(key)
  );
}

/** The calendar month before the one `iso` falls in: the collection period the page offers. */
export function previousMonth(iso: string): { from: string; to: string } {
  const [year, month] = iso.split("-").map(Number);
  const y = month === 1 ? year - 1 : year;
  const m = month === 1 ? 12 : month - 1;
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const mm = String(m).padStart(2, "0");
  return { from: `${y}-${mm}-01`, to: `${y}-${mm}-${String(last).padStart(2, "0")}` };
}

export const UNIT_PATTERN = /^SAARANG-(PLOT|VILLA)-/;
