/**
 * The purchase order reference — PO/<PROJECT>/<SCOPE>/001 — where SCOPE
 * is the short code of the one plot or unit the PO belongs to, or "GEN"
 * for a general purchase (founder decision: one PO = one plot/unit, the
 * scope is part of the number, numbers run per scope).
 *
 * The database is the source of truth: create_purchase_order()
 * (migration 0021) resolves the scope, mints the number and stores the
 * reference, so editing a code later relabels nothing historical. This
 * function is a thin wrapper around the shared core in lib/reference.ts
 * — the mirror of that SQL — on-screen previews, pinned by tests. If the
 * format ever changes, change both together.
 */
import { documentReference } from "@/lib/reference";

export { GENERAL_SCOPE, resolveScopeCode } from "@/lib/reference";

export function poReference(projectCode: string, scopeCode: string, poNo: number): string {
  return documentReference("PO", [projectCode, scopeCode], poNo);
}
