/**
 * The purchase order reference — PO/<PROJECT>/<SCOPE>/001 — where SCOPE
 * is the short code of the one plot or unit the PO belongs to, or "GEN"
 * for a general purchase (founder decision: one PO = one plot/unit, the
 * scope is part of the number, numbers run per scope).
 *
 * The database is the source of truth: create_purchase_order()
 * (migration 0021) resolves the scope, mints the number and stores the
 * reference, so editing a code later relabels nothing historical. These
 * functions are the mirror of that SQL — on-screen previews, pinned by
 * tests — the lib/indents/reference.ts pattern. If the format ever
 * changes, change both together.
 *
 * Pure and import-free so it can be tested directly.
 */

export const GENERAL_SCOPE = "GEN";

/**
 * Which code becomes the number's scope segment: the unit's if the PO is
 * for a unit, else the plot's, else GEN. Mirrors the resolution order in
 * create_purchase_order(). A null here means the chosen plot/unit has no
 * code yet — the database refuses with a pointer to Masters; screens use
 * this to warn before submitting.
 */
export function resolveScopeCode(
  plotCode: string | null,
  unitCode: string | null,
  scope: "plot" | "unit" | "general",
): string | null {
  if (scope === "general") return GENERAL_SCOPE;
  const code = scope === "unit" ? unitCode : plotCode;
  if (code === null || code.trim() === "") return null;
  return code.toUpperCase().replace(/\s+/g, "");
}

export function poReference(projectCode: string, scopeCode: string, poNo: number): string {
  const project = projectCode.toUpperCase().replace(/\s+/g, "");
  const scope = scopeCode.toUpperCase().replace(/\s+/g, "");
  // padStart pads short numbers to 3 digits and leaves longer ones alone
  // — matching the SQL's lpad(no, greatest(3, length(no)), '0'), written
  // that way because a bare lpad TRUNCATES: lpad('1234', 3) is '123'.
  return `PO/${project}/${scope}/${String(poNo).padStart(3, "0")}`;
}
