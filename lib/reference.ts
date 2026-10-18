/**
 * Shared core of every document number: normalise a code, zero-pad to at least three digits, join with "/".
 * Mirrors the SQL lpad(no, greatest(3, length(no)), '0'); a bare lpad TRUNCATES. Pure and import-free.
 */

/** Upper-case, whitespace removed: "sr 12" → "SR12". */
export function normaliseCode(code: string): string {
  return code.toUpperCase().replace(/\s+/g, "");
}

/** `PREFIX/PART/…/NNN`, zero-padded to at least three digits, never truncated (mirrors the SQL lpad). */
export function documentReference(prefix: string, parts: string[], no: number): string {
  const segments = [prefix, ...parts.map(normaliseCode), String(no).padStart(3, "0")];
  return segments.join("/");
}

export const GENERAL_SCOPE = "GEN";

/** The code for the scope segment: unit's, else plot's, else GEN. Null means no code yet; screens warn before submitting. */
export function resolveScopeCode(
  plotCode: string | null,
  unitCode: string | null,
  scope: "plot" | "unit" | "general",
): string | null {
  if (scope === "general") return GENERAL_SCOPE;
  const code = scope === "unit" ? unitCode : plotCode;
  if (code === null || code.trim() === "") return null;
  return normaliseCode(code);
}
