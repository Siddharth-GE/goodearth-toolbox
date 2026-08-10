/**
 * How every number and date in this app is written.
 *
 * One module, used by screens, PDFs and exports alike, because the same
 * value appearing in three places must read the same way in all three.
 * Before this existed, `items.indicative_price` rendered as `₹12,345` on
 * the margins screen, `₹12,345` in the catalogue picker (via a separate
 * `Intl.NumberFormat` declared in that file), and `12,345` with no
 * currency symbol at all in the Masters items table — three answers for
 * one column.
 *
 * Pure functions with no imports, so this is safe in Server Components,
 * Client Components, Route Handlers and react-pdf documents. Do not add
 * anything here that touches the database, the request, or the DOM.
 *
 * Indian conventions throughout: lakh/crore digit grouping (12,34,567 —
 * not 1,234,567), and dates day-first.
 */

/** The one place the grouping locale is named. */
const LOCALE = "en-IN";

// ---------------------------------------------------------------------
// Money
// ---------------------------------------------------------------------

/**
 * Rupees for the screen, e.g. `₹12,34,567`.
 *
 * Whole rupees by default: paise on a construction budget are noise.
 * Missing money is a dash, never `₹0` — an unpriced line and a free line
 * are different things, and showing zero for the first is how a quote
 * goes out with something given away.
 */
export function formatMoney(
  value: number | null | undefined,
  options?: { paise?: boolean },
): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  const digits = options?.paise ? 2 : 0;
  return value.toLocaleString(LOCALE, {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

/**
 * Rupees for print: the same digits, grouped the same way, but with NO
 * currency symbol.
 *
 * Not a stylistic preference. `@react-pdf/renderer` embeds Helvetica,
 * which has no glyph for `₹` (U+20B9) — using formatMoney in a document
 * puts a blank box on every amount on the page. Documents state the
 * currency once in a heading instead, which reads better anyway.
 *
 * Rounding happens here and nowhere earlier, so a column of rounded lines
 * still adds up to a total summed at full precision.
 */
export function formatAmount(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return Math.round(value).toLocaleString(LOCALE, { maximumFractionDigits: 0 });
}

/**
 * Rupees at the scale a business plan is discussed in: `₹26.66 Cr`,
 * `₹12.5 L`, `₹4,500`.
 *
 * Not a stylistic flourish. A development plan's figures run to ten
 * digits, and `₹1,19,82,25,000` next to `₹1,29,77,74,045` is two numbers
 * nobody can tell apart at a glance — which is the entire job of a
 * summary. The founder's own workbook ends with a block headed "KEY
 * OUTPUTS IN ₹ CRORE" for exactly this reason.
 *
 * Two decimals in crore (₹0.01 Cr is ₹1 lakh — the resolution a plan is
 * actually decided at), one in lakh, and plain rupees below that, where
 * rounding to "₹0.0 L" would lose the number entirely. Negatives keep
 * their sign: `−₹5.91 Cr`. Missing is a dash, never `₹0 Cr`.
 *
 * Use this on summaries and headline figures. Line-item tables that must
 * add up still use formatMoney — a column of rounded crore figures does
 * not tally, and looking like it should is worse than being long.
 */
export function formatCrore(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";

  const CRORE = 10_000_000;
  const LAKH = 100_000;
  const magnitude = Math.abs(value);
  // The minus goes before the ₹, the way a person writes it, rather than
  // inside the number where toLocaleString would put it.
  const sign = value < 0 ? "−" : "";

  if (magnitude >= CRORE) {
    return `${sign}₹${(magnitude / CRORE).toLocaleString(LOCALE, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })} Cr`;
  }
  if (magnitude >= LAKH) {
    return `${sign}₹${(magnitude / LAKH).toLocaleString(LOCALE, {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    })} L`;
  }
  return formatMoney(value);
}

// ---------------------------------------------------------------------
// Quantities and percentages
// ---------------------------------------------------------------------

/**
 * A quantity, grouped, with trailing zeroes dropped: `12,345`, `2.125`.
 *
 * Used on screen AND in documents. The PDF theme used to have its own
 * version that didn't group digits at all despite a comment saying it
 * should, so the same quantity read `12,345` on screen and `12345` on the
 * sheet a client was handed.
 */
export function formatQuantity(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  // Three decimals is past anything a site measurement carries; Number()
  // then drops the trailing zeroes so 2.500 reads as 2.5.
  return Number(value.toFixed(3)).toLocaleString(LOCALE);
}

/** A margin or share, e.g. `12.5%`. Missing is a dash, not `0%`. */
export function formatPercent(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return `${Number(value.toFixed(2)).toLocaleString(LOCALE)}%`;
}

// ---------------------------------------------------------------------
// Dates and times
// ---------------------------------------------------------------------

/** `01 Aug 2026` — unambiguous, and the same on every screen and document. */
export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString(LOCALE, { day: "2-digit", month: "short", year: "numeric" });
}

/** `Saturday, 01 August 2026` — for a greeting, not a table. */
export function formatLongDate(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString(LOCALE, {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

/** `4:05 pm` — Marathon's entry lists, where only the time of day matters. */
export function formatTime(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleTimeString(LOCALE, { hour: "numeric", minute: "2-digit" });
}

/** A plain grouped integer: counts, totals of things rather than money. */
export function formatCount(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return value.toLocaleString(LOCALE);
}
