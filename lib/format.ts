/**
 * How every number and date is written, on screens, PDFs and exports alike. Indian conventions: lakh/crore grouping, day-first dates.
 * Pure and import-free: safe in server, client and react-pdf code.
 */

/** The one place the grouping locale is named. */
const LOCALE = "en-IN";

/** Rupees for the screen, whole rupees. Missing is a dash, never `₹0`: an unpriced line is not a free one. */
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
 * Rupees for print, with NO ₹: react-pdf's Helvetica has no glyph for it, so state the currency in a heading.
 * Rounding happens here only, so rounded lines still add up to a total summed at full precision.
 */
export function formatAmount(
  value: number | null | undefined,
  options?: { paise?: boolean },
): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  // A tax invoice states paise: its GST halves are worked to the paisa.
  if (options?.paise) {
    return value.toLocaleString(LOCALE, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  return Math.round(value).toLocaleString(LOCALE, { maximumFractionDigits: 0 });
}

/**
 * Rupees at plan scale: `₹26.66 Cr`, `₹12.5 L`, plain rupees below a lakh. Missing is a dash.
 * For summaries only: line-item tables that must add up use formatMoney.
 */
export function formatCrore(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";

  const CRORE = 10_000_000;
  const LAKH = 100_000;
  const magnitude = Math.abs(value);
  // The sign goes before the ₹, not inside the number.
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

/** A grouped quantity with trailing zeroes dropped: `12,345`, `2.125`. Used on screen and in documents. */
export function formatQuantity(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  // Three decimals is past site measurement; Number() drops the trailing zeroes.
  return Number(value.toFixed(3)).toLocaleString(LOCALE);
}

/** A margin or share, e.g. `12.5%`. Missing is a dash, not `0%`. */
export function formatPercent(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return `${Number(value.toFixed(2)).toLocaleString(LOCALE)}%`;
}

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

/** `Fri, 17 Oct` — the weekday matters, the year goes without saying. */
export function formatDayDate(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString(LOCALE, { weekday: "short", day: "numeric", month: "short" });
}

/** `17 Oct` — a recent date in a caption, beside who did it. */
export function formatShortDate(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString(LOCALE, { day: "numeric", month: "short" });
}

/** `Nov 2026` — a month mark on a date strip. */
export function formatMonthMark(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString(LOCALE, { month: "short", year: "numeric", timeZone: "UTC" });
}

/** `4:05 pm`, for where only the time of day matters. */
export function formatTime(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleTimeString(LOCALE, { hour: "numeric", minute: "2-digit" });
}

/**
 * Today in India as "YYYY-MM-DD". Asia/Kolkata is named because the server runs in UTC, which disagrees about the day for 5.5 hours.
 * Pure modules take `today` as an argument; only screens and actions call this.
 */
export function todayInIndia(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/** The hour in India, 0–23; pure modules take it as an argument rather than call this. */
export function hourInIndia(): number {
  const hour = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    hourCycle: "h23",
  }).format(new Date());
  return Number(hour) % 24;
}

/** A plain grouped integer: counts, totals of things rather than money. */
export function formatCount(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return value.toLocaleString(LOCALE);
}

/** "A", "A and B", "A, B and C": a list read as one phrase in a sentence. */
export function joinInWords(parts: readonly string[]): string {
  if (parts.length <= 1) return parts[0] ?? "";
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

const ONES = [
  "",
  "One",
  "Two",
  "Three",
  "Four",
  "Five",
  "Six",
  "Seven",
  "Eight",
  "Nine",
  "Ten",
  "Eleven",
  "Twelve",
  "Thirteen",
  "Fourteen",
  "Fifteen",
  "Sixteen",
  "Seventeen",
  "Eighteen",
  "Nineteen",
];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

/** 0–999 in words; "" for zero, so the caller decides what nothing reads as. */
function hundredsInWords(value: number): string {
  const hundreds = Math.floor(value / 100);
  const rest = value % 100;
  const parts: string[] = [];
  if (hundreds) parts.push(`${ONES[hundreds]} Hundred`);
  if (rest >= 20)
    parts.push([TENS[Math.floor(rest / 10)], ONES[rest % 10]].filter(Boolean).join(" "));
  else if (rest) parts.push(ONES[rest]);
  return parts.join(" ");
}

/** Rupees in words as an Indian invoice prints them (crore, lakh, thousand). Paise rounded; missing is a dash. */
export function amountInWords(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  const totalPaise = Math.round(Math.abs(value) * 100);
  let rupees = Math.floor(totalPaise / 100);
  const paise = totalPaise % 100;

  const parts: string[] = [];
  const crore = Math.floor(rupees / 10_000_000);
  rupees %= 10_000_000;
  const lakh = Math.floor(rupees / 100_000);
  rupees %= 100_000;
  const thousand = Math.floor(rupees / 1000);
  rupees %= 1000;
  // Above 999 crore the crore count is itself read in this system.
  if (crore) parts.push(`${amountInWords(crore).replace(/^Rupees |\s*Only$/g, "")} Crore`);
  if (lakh) parts.push(`${hundredsInWords(lakh)} Lakh`);
  if (thousand) parts.push(`${hundredsInWords(thousand)} Thousand`);
  if (rupees) parts.push(hundredsInWords(rupees));

  const words = parts.join(" ") || "Zero";
  const sign = value < 0 ? "Minus " : "";
  const paiseWords = paise ? ` and ${hundredsInWords(paise)} Paise` : "";
  return `${sign}Rupees ${words}${paiseWords} Only`;
}
