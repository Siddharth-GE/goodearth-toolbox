/**
 * The print half of DESIGN.md: its own palette (ink on paper), not the app's screen CSS variables.
 * Same accent green, everything else near-black on white.
 */
export const pdf = {
  color: {
    /** Body text. Not pure black: #000 looks harsh in print. */
    ink: "#1c1c1a",
    muted: "#6b6b66",
    rule: "#d9d7d3",
    ruleStrong: "#1c1c1a",
    accent: "#1f7a5c",
    wash: "#f6f5f3",
    draft: "#c0392b",
  },
  size: {
    display: 18,
    title: 13,
    sectionLabel: 8,
    body: 9,
    small: 8,
    tiny: 7,
  },
  space: {
    pageX: 40,
    pageTop: 36,
    pageBottom: 44,
    gap: 6,
    block: 14,
  },
  font: "Helvetica",
  fontBold: "Helvetica-Bold",
} as const;

/**
 * The chart palette for paper: literal hexes, since a PDF can't resolve CSS variables. It repeats the
 * LIGHT-mode tokens of globals.css in the same measured order; change both together.
 */
export const pdfChart = {
  slots: [
    "#1baf7a", // 1 aqua-green
    "#eda100", // 2 yellow
    "#e87ba4", // 3 magenta
    "#008300", // 4 green
    "#4a3aa7", // 5 violet
    "#e34948", // 6 red
    "#2a78d6", // 7 blue
    "#eb6834", // 8 orange
  ],
  accent: "#1f7a5c",
  rest: "#b9b7b2",
  grid: "#d9d7d3",
  axis: "#6b6b66",
} as const;

/** A screen colour token ("var(--chart-3)") to its print hex; the chart model is shared, only the colours change. */
export function printColor(token: string): string {
  const slot = /^var\(--chart-(\d)\)$/.exec(token);
  if (slot) return pdfChart.slots[Number(slot[1]) - 1] ?? pdfChart.accent;
  if (token === "var(--accent)") return pdfChart.accent;
  if (token === "var(--muted)") return pdfChart.rest;
  // Already a literal (or unknown): pass through rather than guess.
  return token.startsWith("var(") ? pdfChart.accent : token;
}

/**
 * Design views: the one size for uploaded renders everywhere, 1600 × 900, 16:9, letterboxed on white, never cropped.
 * JPEG because react-pdf embeds only PNG and JPEG; one shape so a document is never a ragged mix.
 */
export const designView = {
  width: 1600,
  height: 900,
  aspect: 16 / 9,
  format: "jpeg",
  contentType: "image/jpeg",
  extension: "jpg",
  quality: 82,
  /** Above this many in one space, the document lays them two to a row. */
  twoUpFrom: 2,
} as const;

// Number and date formatting lives in lib/format.ts; import `formatAmount` there (no ₹, Helvetica can't draw one).
