/** EST/<PROJECT-CODE>/001, minted by submit_estimate() (0077) and stored. A thin wrapper on lib/reference.ts, the TS mirror of that SQL: change both together. */
import { documentReference } from "@/lib/reference";

export function estimateReference(projectCode: string, estNo: number): string {
  return documentReference("EST", [projectCode], estNo);
}
