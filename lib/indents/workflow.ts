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
