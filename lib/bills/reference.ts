// BILL/<PROJECT>/<SCOPE>/001: SCOPE is the short code of the anchor's (PO or labour contract) plot or unit, or "GEN"; never picked at bill time.
// The database mints and stores the reference (create_bill, 0025); this mirrors it for previews. Change both together.
import { documentReference } from "@/lib/reference";

export { GENERAL_SCOPE, resolveScopeCode } from "@/lib/reference";

export function billReference(projectCode: string, scopeCode: string, billNo: number): string {
  return documentReference("BILL", [projectCode, scopeCode], billNo);
}
