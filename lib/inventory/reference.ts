// GRN/<PROJECT-CODE>/001 and ISS/<PROJECT-CODE>/001, numbered per project. The database mints and stores
// them (0023); this mirrors that SQL for previews via lib/reference.ts. Change both together.
import { documentReference } from "@/lib/reference";

export function grnReference(projectCode: string, grnNo: number): string {
  return documentReference("GRN", [projectCode], grnNo);
}

export function issueReference(projectCode: string, issNo: number): string {
  return documentReference("ISS", [projectCode], issNo);
}
