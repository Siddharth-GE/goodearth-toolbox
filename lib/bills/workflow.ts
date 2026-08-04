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

/** Whether the current user may decide bills — the indents Decider shape. */
export type BillDecider = {
  isAdmin: boolean;
  isApprover: boolean;
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

/** A recorded bill is approved by a named approver or an admin. */
export function canApprove(status: BillStatus, decider: BillDecider): boolean {
  return status === "recorded" && (decider.isAdmin || decider.isApprover);
}

/** An approved (unpaid) bill can be sent back, with a note, by a decider. */
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

/**
 * The over-billing check: true when recording this bill would take the
 * anchor past its total. WARNS, NEVER BLOCKS (founder decision — real
 * invoices legitimately differ; a human decides): callers render a
 * warning line, no rule refuses. A null anchor total means there is
 * nothing to compare against — no warning.
 */
export function exceedsAnchor(
  anchorTotal: number | null,
  alreadyBilled: number,
  billTotal: number,
): boolean {
  if (anchorTotal === null) return false;
  return alreadyBilled + billTotal > anchorTotal;
}
