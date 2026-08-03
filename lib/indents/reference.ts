/**
 * The indent reference — IND/<PROJECT-CODE>/001 — the string a site
 * engineer writes on paper and the commercials team searches for, so its
 * construction is identity, not formatting.
 *
 * The database is the source of truth: create_indent() (migration 0019)
 * mints the reference at creation time and stores it, so editing a
 * project's code later relabels nothing historical. This function is the
 * mirror of that SQL — used for on-screen previews and pinned by tests —
 * exactly as lib/budgets/math.ts mirrors the client_rate generated
 * column. If the format ever changes, change both together.
 *
 * Pure and import-free so it can be tested directly.
 */
export function indentReference(projectCode: string, indentNo: number): string {
  const code = projectCode.toUpperCase().replace(/\s+/g, "");
  // padStart pads short numbers to 3 digits and leaves longer ones
  // alone — matching the SQL's lpad(no, greatest(3, length(no)), '0'),
  // which is written that way because a bare lpad TRUNCATES: lpad('1234',
  // 3) is '123'.
  return `IND/${code}/${String(indentNo).padStart(3, "0")}`;
}
