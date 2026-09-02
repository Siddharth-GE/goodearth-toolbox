/**
 * The shared core behind every document number in the toolbox — indents,
 * estimates, GRNs, stock issues, bills and purchase orders each used to
 * carry their own copy of the same three lines (normalise a code, pad a
 * number to at least three digits, join with "/"). One home means the
 * SQL rule they all mirror — lpad(no, greatest(3, length(no)), '0'),
 * written that way because a bare lpad TRUNCATES: lpad('1234', 3) is
 * '123' — is written down once instead of six times drifting apart.
 *
 * Pure and import-free so it can be tested directly.
 */

/** Upper-case with whitespace removed: "sr 12" → "SR12". The one rule for every code that goes into a document number. */
export function normaliseCode(code: string): string {
  return code.toUpperCase().replace(/\s+/g, "");
}

/** `PREFIX/PART/…/NNN` — each part normalised, the number zero-padded to at least three digits, never truncated (mirrors the SQL lpad the database uses). */
export function documentReference(prefix: string, parts: string[], no: number): string {
  const segments = [prefix, ...parts.map(normaliseCode), String(no).padStart(3, "0")];
  return segments.join("/");
}

export const GENERAL_SCOPE = "GEN";

/**
 * Which code becomes the number's scope segment: the unit's if the
 * anchor is for a unit, else the plot's, else GEN. A null here means the
 * plot/unit has no code yet — the database refuses with a pointer to
 * Masters; screens use this to warn before submitting.
 */
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
