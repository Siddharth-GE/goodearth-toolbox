/**
 * The client quotation's reference — the string a client quotes back on
 * the phone, so its construction is identity, not formatting.
 *
 * Includes the version so re-opening an approved budget to correct a
 * rate produces a quotation a client can tell apart from the one they
 * already have; without it both would say QT/PLOT6/R2 (the exact
 * ambiguity migration 0012 exists to prevent). Spaces are stripped and
 * case is fixed so "Plot 6" and "plot 6" can never mint two different
 * references for one unit — which is also why unit names are unique per
 * project (migration 0017).
 *
 * Pure and import-free so it can be tested directly.
 */
export function quoteReference(unitName: string, revisionNo: number, version: number): string {
  return `QT/${unitName}/R${revisionNo}-V${version}`.toUpperCase().replace(/\s+/g, "");
}
