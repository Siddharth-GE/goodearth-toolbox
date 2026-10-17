// IND/<PROJECT-CODE>/001. The database mints and stores the reference (create_indent, 0019); this mirrors it for previews. Change both together.
import { documentReference } from "@/lib/reference";

export function indentReference(projectCode: string, indentNo: number): string {
  return documentReference("IND", [projectCode], indentNo);
}
