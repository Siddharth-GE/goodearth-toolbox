/**
 * The bill status machine, as pure rules.
 *
 * The lib/indents/workflow.ts pattern: the same rules exist in three
 * places on purpose — here (which buttons render, friendly pre-checks in
 * actions), the RLS policies, and the bills_guard trigger (migration
 * 0025), which holds even against a raw PostgREST call. This module
 * exists so the first two can be tested without a database.
 *
 * recorded -> approved -> paid, with send-back (approved -> recorded)
 * carrying a mandatory note. Self-approval is allowed (founder
 * decision): approving takes the bill_approvers list or an admin, and
 * the recorder may sit on that list — so no recorder parameter here,
 * deliberately.
 */
export type BillStatus = "recorded" | "approved" | "paid";

/** What a bill is recorded against: a PO, a labour contract, or NMR
 * (daily wages — no anchor, optional vendor). */
export type BillKind = "po" | "contract" | "nmr";

export type ContractStatus = "pending_approval" | "approved";

/** Whether the current user may decide bills — the indents Decider shape. */
export type BillDecider = {
  isAdmin: boolean;
  isApprover: boolean;
  /**
   * The most this approver may approve, or null for no ceiling (0033).
   * Null is "unlimited", never "nothing" — every approver who predates
   * limits has null, and admins ignore it entirely.
   */
  approvalLimit?: number | null;
};

export type BillActor = {
  isAdmin: boolean;
  /** auth user id, for the recorder-ownership delete rule. */
  userId: string;
};

/** Invoice fields and amounts are editable only while still recorded. */
export function canEditBill(status: BillStatus): boolean {
  return status === "recorded";
}

/**
 * True when this amount is beyond what the decider may approve.
 *
 * Admins are never limited — the ceiling delegates authority downward,
 * it doesn't cap the person handing it out. A null limit is unlimited,
 * and the comparison is `<=`, so a ₹50,000 limit approves a ₹50,000
 * bill exactly. Mirrors the bills_guard check (0033).
 */
export function exceedsApprovalLimit(decider: BillDecider, amount: number | null): boolean {
  if (decider.isAdmin) return false;
  const limit = decider.approvalLimit ?? null;
  if (limit === null || amount === null) return false;
  return amount > limit;
}

/**
 * A recorded bill is approved by a named approver or an admin — and, if
 * that approver has a limit, only up to it. The amount is optional so
 * callers with nothing to compare (a list row) keep the old meaning.
 */
export function canApprove(
  status: BillStatus,
  decider: BillDecider,
  amount: number | null = null,
): boolean {
  if (status !== "recorded") return false;
  if (!(decider.isAdmin || decider.isApprover)) return false;
  return !exceedsApprovalLimit(decider, amount);
}

/**
 * An approved (unpaid) bill can be sent back, with a note, by a decider.
 * Deliberately NOT limit-gated: returning a bill authorises no spending,
 * and someone who spots a problem on a large bill must be able to say so.
 */
export function canSendBack(status: BillStatus, decider: BillDecider): boolean {
  return status === "approved" && (decider.isAdmin || decider.isApprover);
}

/** Paying takes an approved bill and a real payment reference. */
export function canMarkPaid(status: BillStatus, paymentRef: string): boolean {
  return status === "approved" && paymentRef.trim() !== "";
}

/**
 * A wrongly recorded bill is its recorder's (or an admin's) to throw
 * away, and only while still recorded — approved and paid bills are
 * permanent record.
 */
export function canDeleteBill(
  status: BillStatus,
  actor: BillActor,
  createdBy: string | null,
): boolean {
  return status === "recorded" && (actor.isAdmin || createdBy === actor.userId);
}

/** A pending labour contract is approved by the same deciders as a
 * bill (founder decision: one list), and against the same limit — its
 * value is the amount at stake. Its terms lock on approval. */
export function canApproveContract(
  status: ContractStatus,
  decider: BillDecider,
  contractValue: number | null = null,
): boolean {
  if (status !== "pending_approval") return false;
  if (!(decider.isAdmin || decider.isApprover)) return false;
  return !exceedsApprovalLimit(decider, contractValue);
}

/** A contract takes bills only once approved and while active. */
export function isContractBillable(status: ContractStatus, isActive: boolean): boolean {
  return status === "approved" && isActive;
}

/** A contract's terms are editable only before approval. */
export function canEditContract(status: ContractStatus): boolean {
  return status === "pending_approval";
}

/**
 * The over-billing check: true when recording this bill would take the
 * anchor past its total. WARNS, NEVER BLOCKS (founder decision — real
 * invoices legitimately differ; a human decides): callers render a
 * warning line, no rule refuses. A null anchor total means there is
 * nothing to compare against — no warning (NMR bills always pass null:
 * daily wages have no contracted ceiling, by design).
 */
export function exceedsAnchor(
  anchorTotal: number | null,
  alreadyBilled: number,
  billTotal: number,
): boolean {
  if (anchorTotal === null) return false;
  return alreadyBilled + billTotal > anchorTotal;
}
