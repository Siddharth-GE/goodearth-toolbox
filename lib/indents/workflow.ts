/**
 * The indent status machine, as pure rules.
 *
 * The same rules exist in three places, deliberately, each catching what
 * the previous one can't: here (drives which buttons render, and the
 * friendly pre-checks in lib/indents/actions.ts), the RLS policies, and
 * the indents_guard trigger (migration 0019), which holds even against a
 * raw PostgREST call. This module exists so the first two can be tested
 * without a database.
 */
export type IndentStatus = "draft" | "submitted" | "approved";

export type Decider = { isAdmin: boolean; isApprover: boolean };

/** Header fields and lines are editable only while the indent is a draft. */
export function canEditIndent(status: IndentStatus): boolean {
  return status === "draft";
}

/** A draft with at least one line can be submitted for approval. */
export function canSubmit(status: IndentStatus, lineCount: number): boolean {
  return status === "draft" && lineCount > 0;
}

/**
 * Approve and reject are one capability: deciding a submitted indent.
 * Named approvers are ticked in Settings; admins always may.
 */
export function canDecide(status: IndentStatus, decider: Decider): boolean {
  return status === "submitted" && (decider.isAdmin || decider.isApprover);
}

/** Only a draft can be thrown away — a submitted or approved indent never. */
export function canDelete(status: IndentStatus): boolean {
  return status === "draft";
}

/**
 * A line outside the estimate (0113): not pulled from an estimate or a
 * budget. It needs a reason to submit and the estimator's yes to approve
 * — the same test indents_guard makes on the anchors.
 */
export function waitsForEstimator(source: string): boolean {
  return source === "direct";
}

export type EstimatorHold = {
  /** Outside lines with no reason yet — the indent cannot be submitted. */
  needReason: number;
  /** Outside lines the estimator has not answered. */
  waiting: number;
  /** Outside lines the estimator refused — it goes back to be changed. */
  refused: number;
};

/** What the estimator rule still holds back, counted over the lines. */
export function estimatorHold(
  lines: {
    source: string;
    off_estimate_reason: string | null;
    estimator_decision: string | null;
  }[],
): EstimatorHold {
  const hold: EstimatorHold = { needReason: 0, waiting: 0, refused: 0 };
  for (const line of lines) {
    if (!waitsForEstimator(line.source)) continue;
    if (!line.off_estimate_reason?.trim()) hold.needReason++;
    if (line.estimator_decision === "refused") hold.refused++;
    else if (line.estimator_decision !== "approved") hold.waiting++;
  }
  return hold;
}

/** Why an approver cannot approve yet, or null when nothing holds it. */
export function approvalBlocker(hold: EstimatorHold): string | null {
  if (hold.refused > 0) {
    return `The estimator refused ${hold.refused} ${hold.refused === 1 ? "line" : "lines"} — send it back so ${hold.refused === 1 ? "it can" : "they can"} be changed.`;
  }
  if (hold.waiting > 0) {
    return `Waiting for the estimator on ${hold.waiting} ${hold.waiting === 1 ? "line" : "lines"} outside the estimate.`;
  }
  return null;
}

/**
 * What is still to buy on a line: requested less what live POs have
 * ordered against it. Never negative — a line ordered in full reads 0.
 */
export function stillToBuy(quantity: number, ordered: number): number {
  return Math.max(0, Math.round((quantity - ordered) * 1e6) / 1e6);
}
