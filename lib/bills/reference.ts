/**
 * The bill reference — BILL/<PROJECT>/<SCOPE>/001 — where SCOPE is the
 * short code of the plot or unit the bill's anchor belongs to, or "GEN"
 * (founder decision: the bill number carries the unit, and the scope
 * comes from the anchor — the PO's, or the labour contract's — never
 * picked at bill time).
 *
 * The database is the source of truth: create_bill() (migration 0025)
 * resolves the scope from the anchor, mints the number and stores the
 * reference, so editing a code later relabels nothing historical. These
 * functions are the mirror of that SQL — on-screen previews, pinned by
 * tests — the lib/purchase-orders/reference.ts pattern. If the format
 * ever changes, change both together.
 *
 * Pure and import-free so it can be tested directly.
 */

export const GENERAL_SCOPE = "GEN";

/**
 * Which code becomes the number's scope segment: the unit's if the
 * anchor is for a unit, else the plot's, else GEN. Mirrors the
 * resolution order in create_bill(). A null here means the plot/unit
 * has no code yet — the database refuses with a pointer to Masters;
 * screens use this to warn before submitting.
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

export function billReference(projectCode: string, scopeCode: string, billNo: number): string {
  const project = projectCode.toUpperCase().replace(/\s+/g, "");
  const scope = scopeCode.toUpperCase().replace(/\s+/g, "");
  // padStart pads short numbers to 3 digits and leaves longer ones alone
  // — matching the SQL's lpad(no, greatest(3, length(no)), '0'), written
  // that way because a bare lpad TRUNCATES: lpad('1234', 3) is '123'.
  return `BILL/${project}/${scope}/${String(billNo).padStart(3, "0")}`;
}
