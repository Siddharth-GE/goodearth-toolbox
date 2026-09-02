/**
 * Inventory's two references — GRN/<PROJECT-CODE>/001 for a goods
 * receipt and ISS/<PROJECT-CODE>/001 for a stock issue. Both run per
 * project (the indent numbering pattern, confirmed by the founder at
 * the Phase 7 kickoff) and carry no scope segment, unlike a PO number.
 *
 * The database is the source of truth: create_goods_receipt() and
 * create_stock_issue() (migration 0023) mint the number and store the
 * reference, so editing a project's code later relabels nothing
 * historical. These functions are thin wrappers around the shared core
 * in lib/reference.ts — the mirror of that SQL — on-screen previews,
 * pinned by tests. If the format ever changes, change both together.
 */
import { documentReference } from "@/lib/reference";

export function grnReference(projectCode: string, grnNo: number): string {
  return documentReference("GRN", [projectCode], grnNo);
}

export function issueReference(projectCode: string, issNo: number): string {
  return documentReference("ISS", [projectCode], issNo);
}
