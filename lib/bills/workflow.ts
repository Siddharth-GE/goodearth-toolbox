// Pure rules, mirrored in RLS and the bills_guard trigger (0025).
// recorded -> approved -> paid; send-back needs a note. Self-approval is allowed, so no recorder parameter here.
export type BillStatus = "recorded" | "approved" | "paid";

/** A PO, a labour contract, or NMR (daily wages: no anchor, optional vendor). */
export type BillKind = "po" | "contract" | "nmr";

export type ContractStatus = "pending_approval" | "approved";

export type BillDecider = {
  isAdmin: boolean;
  isApprover: boolean;
  /** Null is unlimited, never "nothing"; admins ignore it (0033). */
  approvalLimit?: number | null;
};

export type BillActor = {
  isAdmin: boolean;
  userId: string;
};

export function canEditBill(status: BillStatus): boolean {
  return status === "recorded";
}

/** Admins are never limited. A null limit is unlimited and the comparison is `<=`, so a limit approves that exact amount. Mirrors bills_guard (0033). */
export function exceedsApprovalLimit(decider: BillDecider, amount: number | null): boolean {
  if (decider.isAdmin) return false;
  const limit = decider.approvalLimit ?? null;
  if (limit === null || amount === null) return false;
  return amount > limit;
}

/** A named approver or an admin, within their limit if they have one. */
export function canApprove(
  status: BillStatus,
  decider: BillDecider,
  amount: number | null = null,
): boolean {
  if (status !== "recorded") return false;
  if (!(decider.isAdmin || decider.isApprover)) return false;
  return !exceedsApprovalLimit(decider, amount);
}

/** Not limit-gated on purpose: returning a bill authorises no spending. */
export function canSendBack(status: BillStatus, decider: BillDecider): boolean {
  return status === "approved" && (decider.isAdmin || decider.isApprover);
}

/** Money goes out only against an approved bill (0107); it becomes paid by itself when payments and recoveries reach its total. */
export function canTakePayment(status: BillStatus): boolean {
  return status === "approved";
}

/** Only the recorder (or an admin), and only while recorded; approved and paid bills are permanent record. */
export function canDeleteBill(
  status: BillStatus,
  actor: BillActor,
  createdBy: string | null,
): boolean {
  return status === "recorded" && (actor.isAdmin || createdBy === actor.userId);
}

/** Same deciders and limit as a bill (its value is the amount at stake); terms lock on approval. */
export function canApproveContract(
  status: ContractStatus,
  decider: BillDecider,
  contractValue: number | null = null,
): boolean {
  if (status !== "pending_approval") return false;
  if (!(decider.isAdmin || decider.isApprover)) return false;
  return !exceedsApprovalLimit(decider, contractValue);
}

export function canEditContract(status: ContractStatus): boolean {
  return status === "pending_approval";
}

/** WARNS, NEVER BLOCKS: real invoices legitimately differ. A null anchor total means no warning (NMR bills pass null: daily wages have no ceiling). */
export function exceedsAnchor(
  anchorTotal: number | null,
  alreadyBilled: number,
  billTotal: number,
): boolean {
  if (anchorTotal === null) return false;
  return alreadyBilled + billTotal > anchorTotal;
}
