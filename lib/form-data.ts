/**
 * Reading what a person typed into a form.
 *
 * Every action that takes a FormData used to spell these out itself —
 * three tools carried a byte-identical `text()`, two carried the same
 * number parser under different names, and the rest inlined
 * `String(formData.get(...))` with or without the trim. One home, so a
 * missing field, a stray space and a rupee sign mean the same thing on
 * every screen.
 *
 * Import-free on purpose: file-level "use server" modules import this,
 * and anything it pulled in would be dragged toward the client bundle
 * (the same rule as lib/action-state.ts).
 */

/** The trimmed text of a field; a missing field reads as "". */
export function text(formData: FormData, field: string): string {
  return String(formData.get(field) ?? "").trim();
}

/** The trimmed text of a field, or null when it was left blank — for optional columns. */
export function optionalText(formData: FormData, field: string): string | null {
  return text(formData, field) || null;
}

/**
 * A number the way people type them: "1,20,000", "₹ 450", " 12.5 ".
 * Blank is null (nothing entered), which is different from 0 (entered as
 * zero). Junk comes back as NaN so the caller can say what was wrong.
 */
export function parseNumber(raw: FormDataEntryValue | null): number | null {
  const cleaned = String(raw ?? "").replace(/[,\s₹]/g, "");
  if (!cleaned) return null;
  return Number(cleaned);
}
