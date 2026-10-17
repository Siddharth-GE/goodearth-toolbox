// Pure rules, mirrored in RLS and the purchase_orders_guard trigger (0021).
// draft -> issued -> (deletion_requested -> cancelled | issued). issued -> completed is the goods-receipt trigger's alone.
export type PoStatus = "draft" | "issued" | "deletion_requested" | "cancelled" | "completed";

export type PoActor = {
  isAdmin: boolean;
  userId: string;
};

export function canEditPo(status: PoStatus): boolean {
  return status === "draft";
}

export function canIssue(status: PoStatus, lineCount: number, fullyPriced: boolean): boolean {
  return status === "draft" && lineCount > 0 && fullyPriced;
}

export function canDeleteDraft(
  status: PoStatus,
  actor: PoActor,
  createdBy: string | null,
): boolean {
  return status === "draft" && (actor.isAdmin || createdBy === actor.userId);
}

export function canRequestDeletion(status: PoStatus): boolean {
  return status === "issued";
}

export function canWithdrawDeletion(
  status: PoStatus,
  actor: PoActor,
  requestedBy: string | null,
): boolean {
  return status === "deletion_requested" && (actor.isAdmin || requestedBy === actor.userId);
}

/** Removing an issued PO takes an admin's yes. */
export function canApproveDeletion(status: PoStatus, actor: PoActor): boolean {
  return status === "deletion_requested" && actor.isAdmin;
}
