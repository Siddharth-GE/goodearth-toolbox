// PO/<PROJECT>/<SCOPE>/001: SCOPE is the short code of the one plot or unit, or "GEN" for a general purchase; numbers run per scope.
// The database mints and stores the reference (create_purchase_order, 0021); this mirrors it for previews. Change both together.
import { documentReference } from "@/lib/reference";

export { GENERAL_SCOPE, resolveScopeCode } from "@/lib/reference";

export function poReference(projectCode: string, scopeCode: string, poNo: number): string {
  return documentReference("PO", [projectCode, scopeCode], poNo);
}
