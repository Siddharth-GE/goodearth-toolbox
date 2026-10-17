// Pure rules, mirrored in the RLS policies and the indents_guard trigger (0019), which holds even against a raw PostgREST call.
export type IndentStatus = "draft" | "submitted" | "approved";

export type Decider = { isAdmin: boolean; isApprover: boolean };

export function canEditIndent(status: IndentStatus): boolean {
  return status === "draft";
}

export function canSubmit(status: IndentStatus, lineCount: number): boolean {
  return status === "draft" && lineCount > 0;
}

// Approve and reject are one capability: deciding a submitted indent.
export function canDecide(status: IndentStatus, decider: Decider): boolean {
  return status === "submitted" && (decider.isAdmin || decider.isApprover);
}

export function canDelete(status: IndentStatus): boolean {
  return status === "draft";
}

// A line outside the estimate (0113) needs a reason to submit and the estimator's yes to approve, as indents_guard tests.
export function waitsForEstimator(source: string): boolean {
  return source === "direct";
}

export type EstimatorHold = {
  needReason: number;
  waiting: number;
  refused: number;
};

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

export function approvalBlocker(hold: EstimatorHold): string | null {
  if (hold.refused > 0) {
    return `The estimator refused ${hold.refused} ${hold.refused === 1 ? "line" : "lines"} — send it back so ${hold.refused === 1 ? "it can" : "they can"} be changed.`;
  }
  if (hold.waiting > 0) {
    return `Waiting for the estimator on ${hold.waiting} ${hold.waiting === 1 ? "line" : "lines"} outside the estimate.`;
  }
  return null;
}

/** Requested less live PO orders; never negative. */
export function stillToBuy(quantity: number, ordered: number): number {
  return Math.max(0, Math.round((quantity - ordered) * 1e6) / 1e6);
}
