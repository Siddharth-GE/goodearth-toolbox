/** Masters' code without its "P" ("P22-23" → "22-23"), else the name without "Plot", "Villa" or "Unit". */
export function plotNumber(code: string | null, name: string): string {
  const fromCode = code?.trim();
  if (fromCode) return /^P\d/i.test(fromCode) ? fromCode.slice(1) : fromCode;
  const fromName = name.replace(/^(plot|villa|unit)\s*/i, "").trim();
  return fromName || name;
}
