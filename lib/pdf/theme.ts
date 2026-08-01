/**
 * The print half of DESIGN.md.
 *
 * Deliberately its own palette rather than importing the app's CSS
 * variables: those are tuned for screens (and have a dark mode), while
 * this is ink on paper. Same accent green so a printed sheet and the app
 * look like the same company, everything else near-black on white.
 *
 * Shared by every document the platform produces — Selections today,
 * Purchase Orders and Bills later — so they can't drift apart.
 */
export const pdf = {
  color: {
    /** Body text. Not pure black: #000 looks harsh in print. */
    ink: "#1c1c1a",
    muted: "#6b6b66",
    /** Hairlines. Anything heavier turns a table into a cage. */
    rule: "#d9d7d3",
    ruleStrong: "#1c1c1a",
    accent: "#1f7a5c",
    /** Very light fill for table headers and the meta block. */
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
    /** A4 margins. Generous, because whitespace is the structure here. */
    pageX: 40,
    pageTop: 36,
    pageBottom: 44,
    gap: 6,
    block: 14,
  },
  /** react-pdf ships Helvetica; see lib/pdf/document.tsx on using Geist. */
  font: "Helvetica",
  fontBold: "Helvetica-Bold",
} as const;

/** Quantities read better grouped, and prices are lakh-scale here. */
export const formatQty = (value: number) =>
  Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/\.00$/, "");

export const formatDate = (value: string | null) =>
  value
    ? new Date(value).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })
    : "—";
