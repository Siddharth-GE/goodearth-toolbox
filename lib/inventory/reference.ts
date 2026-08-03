/**
 * Inventory's two references — GRN/<PROJECT-CODE>/001 for a goods
 * receipt and ISS/<PROJECT-CODE>/001 for a stock issue. Both run per
 * project (the indent numbering pattern, confirmed by the founder at
 * the Phase 7 kickoff) and carry no scope segment, unlike a PO number.
 *
 * The database is the source of truth: create_goods_receipt() and
 * create_stock_issue() (migration 0023) mint the number and store the
 * reference, so editing a project's code later relabels nothing
 * historical. These functions are the mirror of that SQL — on-screen
 * previews, pinned by tests — the lib/indents/reference.ts pattern. If
 * the format ever changes, change both together.
 *
 * Pure and import-free so it can be tested directly.
 */

function reference(prefix: string, projectCode: string, no: number): string {
  const code = projectCode.toUpperCase().replace(/\s+/g, "");
  // padStart pads short numbers to 3 digits and leaves longer ones
  // alone — matching the SQL's lpad(no, greatest(3, length(no)), '0'),
  // which is written that way because a bare lpad TRUNCATES:
  // lpad('1234', 3) is '123'.
  return `${prefix}/${code}/${String(no).padStart(3, "0")}`;
}

export function grnReference(projectCode: string, grnNo: number): string {
  return reference("GRN", projectCode, grnNo);
}

export function issueReference(projectCode: string, issNo: number): string {
  return reference("ISS", projectCode, issNo);
}
