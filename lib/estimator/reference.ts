/**
 * The estimate reference — EST/<PROJECT-CODE>/001 — minted by
 * submit_estimate() (migration 0077) and stored, so editing a project's
 * code later relabels nothing historical. This is the TS mirror of that
 * SQL, used for on-screen previews and pinned by tests, the same
 * arrangement as lib/indents/reference.ts. If the format ever changes,
 * change both together.
 *
 * Pure and import-free so it can be tested directly.
 */
export function estimateReference(projectCode: string, estNo: number): string {
  const code = projectCode.toUpperCase().replace(/\s+/g, "");
  // padStart pads short numbers to 3 digits and leaves longer ones
  // alone — matching the SQL's lpad(no, greatest(3, length(no)), '0'),
  // which is written that way because a bare lpad TRUNCATES.
  return `EST/${code}/${String(estNo).padStart(3, "0")}`;
}
