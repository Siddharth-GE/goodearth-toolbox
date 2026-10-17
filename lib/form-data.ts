/**
 * Reading what a person typed, so a blank, a space and a rupee sign mean the same on every screen.
 * Import-free: "use server" files import it.
 */

export function text(formData: FormData, field: string): string {
  return String(formData.get(field) ?? "").trim();
}

/** The trimmed text of a field, or null when it was left blank — for optional columns. */
export function optionalText(formData: FormData, field: string): string | null {
  return text(formData, field) || null;
}

/** A typed number ("1,20,000", "₹ 450"). Blank is null, not 0; junk is NaN so the caller can say what was wrong. */
export function parseNumber(raw: FormDataEntryValue | null): number | null {
  const cleaned = String(raw ?? "").replace(/[,\s₹]/g, "");
  if (!cleaned) return null;
  return Number(cleaned);
}
