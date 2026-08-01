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

/**
 * Design views — the single source of truth for how uploaded renders are
 * sized, everywhere. The upload resizes to this, the editor previews at
 * this shape, and every document lays out at this shape. Change it here
 * and all three follow; nothing else should hardcode a dimension.
 *
 * **16:9 landscape**, a slide proportion. Every view is normalised to it
 * so a document is never a ragged mix of portrait and landscape — the
 * consistency is the point, not the exact number.
 *
 * **1600 × 900.** Across the full A4 content width (~515pt ≈ 7.15in)
 * that prints at roughly 215 DPI, and at half width — two to a row —
 * around 430 DPI. Comfortably past what a client will notice, without
 * storing 5MB renders.
 *
 * **JPEG, not WebP.** @react-pdf/renderer embeds PNG and JPEG only. The
 * catalogue thumbnails are WebP because they only ever appear in a
 * browser; these have to survive being printed, so they can't be.
 *
 * **Letterboxed on white, never cropped.** A render that isn't 16:9 gets
 * padding rather than having a corner of the room cut off. Cropping would
 * give the same consistency while occasionally destroying the drawing.
 */
export const designView = {
  width: 1600,
  height: 900,
  aspect: 16 / 9,
  /** Extension and content type follow from this. */
  format: "jpeg",
  contentType: "image/jpeg",
  extension: "jpg",
  quality: 82,
  /** Above this many in one space, the document lays them two to a row. */
  twoUpFrom: 2,
} as const;

// Number and date formatting lives in lib/format.ts, shared with the
// screens. A document and the screen it was generated from showing the
// same quantity differently is a bug people notice and don't trust —
// which is exactly what happened while this file had its own `formatQty`
// that didn't group digits. Documents import `formatAmount` from there
// (digits with no ₹, since Helvetica can't draw one).
