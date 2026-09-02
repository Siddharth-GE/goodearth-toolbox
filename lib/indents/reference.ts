/**
 * The indent reference — IND/<PROJECT-CODE>/001 — the string a site
 * engineer writes on paper and the commercials team searches for, so its
 * construction is identity, not formatting.
 *
 * The database is the source of truth: create_indent() (migration 0019)
 * mints the reference at creation time and stores it, so editing a
 * project's code later relabels nothing historical. This function is a
 * thin wrapper around the shared core in lib/reference.ts — the mirror
 * of that SQL — used for on-screen previews and pinned by tests. If the
 * format ever changes, change both together.
 */
import { documentReference } from "@/lib/reference";

export function indentReference(projectCode: string, indentNo: number): string {
  return documentReference("IND", [projectCode], indentNo);
}
