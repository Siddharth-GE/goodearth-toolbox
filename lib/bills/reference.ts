/**
 * The bill reference — BILL/<PROJECT>/<SCOPE>/001 — where SCOPE is the
 * short code of the plot or unit the bill's anchor belongs to, or "GEN"
 * (founder decision: the bill number carries the unit, and the scope
 * comes from the anchor — the PO's, or the labour contract's — never
 * picked at bill time).
 *
 * The database is the source of truth: create_bill() (migration 0025)
 * resolves the scope from the anchor, mints the number and stores the
 * reference, so editing a code later relabels nothing historical. This
 * function is a thin wrapper around the shared core in lib/reference.ts
 * — the mirror of that SQL — on-screen previews, pinned by tests. If the
 * format ever changes, change both together.
 */
import { documentReference } from "@/lib/reference";

export { GENERAL_SCOPE, resolveScopeCode } from "@/lib/reference";

export function billReference(projectCode: string, scopeCode: string, billNo: number): string {
  return documentReference("BILL", [projectCode, scopeCode], billNo);
}
