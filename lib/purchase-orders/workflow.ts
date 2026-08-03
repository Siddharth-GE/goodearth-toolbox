/**
 * The purchase order status machine, as pure rules.
 *
 * The lib/indents/workflow.ts pattern: the same rules exist in three
 * places on purpose — here (which buttons render, friendly pre-checks in
 * actions), the RLS policies, and the purchase_orders_guard trigger
 * (migration 0021), which holds even against a raw PostgREST call. This
 * module exists so the first two can be tested without a database.
 *
 * draft -> issued -> (deletion_requested -> cancelled | back to issued),
 * plus issued -> completed, which only Phase 7's goods-receipt trigger
 * performs — no button ever offers it, so it has no rule here.
 */
export type PoStatus = "draft" | "issued" | "deletion_requested" | "cancelled" | "completed";

export type PoActor = {
  isAdmin: boolean;
  /** auth user id, for creator/requester ownership rules. */
  userId: string;
};

/** Header fields and lines are editable only while the PO is a draft. */
export function canEditPo(status: PoStatus): boolean {
  return status === "draft";
}

/** A draft with at least one line, every line priced, can be issued. */
export function canIssue(status: PoStatus, lineCount: number, fullyPriced: boolean): boolean {
  return status === "draft" && lineCount > 0 && fullyPriced;
}

/** A draft is its creator's (or an admin's) to throw away. */
export function canDeleteDraft(status: PoStatus, actor: PoActor, createdBy: string | null): boolean {
  return status === "draft" && (actor.isAdmin || createdBy === actor.userId);
}

/** Anyone with the app can ask for an issued PO to be removed. */
export function canRequestDeletion(status: PoStatus): boolean {
  return status === "issued";
}

/** The requester may take a deletion request back; an admin may refuse it. */
export function canWithdrawDeletion(
  status: PoStatus,
  actor: PoActor,
  requestedBy: string | null,
): boolean {
  return status === "deletion_requested" && (actor.isAdmin || requestedBy === actor.userId);
}

/** The founder's rule: removing an issued PO takes an admin's yes. */
export function canApproveDeletion(status: PoStatus, actor: PoActor): boolean {
  return status === "deletion_requested" && actor.isAdmin;
}
