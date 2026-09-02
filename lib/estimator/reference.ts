/**
 * The estimate reference — EST/<PROJECT-CODE>/001 — minted by
 * submit_estimate() (migration 0077) and stored, so editing a project's
 * code later relabels nothing historical. This is a thin wrapper around
 * the shared core in lib/reference.ts — the TS mirror of that SQL, used
 * for on-screen previews and pinned by tests. If the format ever
 * changes, change both together.
 */
import { documentReference } from "@/lib/reference";

export function estimateReference(projectCode: string, estNo: number): string {
  return documentReference("EST", [projectCode], estNo);
}
