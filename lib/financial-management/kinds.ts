/**
 * The two closed vocabularies of the funding area, with their on-screen
 * names. Pure data — imported by screens, actions and queries alike, so
 * a label change lands everywhere at once.
 *
 * These mirror the CHECK constraints in 0058; a value added here without
 * a migration extending the constraint will be refused by the database.
 */

export const FACILITY_KINDS = ["bank_loan", "private_equity", "private_debt"] as const;
export type FacilityKind = (typeof FACILITY_KINDS)[number];

export const FACILITY_KIND_LABELS: Record<FacilityKind, string> = {
  bank_loan: "Bank loan",
  private_equity: "Private equity",
  private_debt: "Private debt",
};

export const MOVEMENT_KINDS = ["drawdown", "repayment", "interest"] as const;
export type MovementKind = (typeof MOVEMENT_KINDS)[number];

export const MOVEMENT_KIND_LABELS: Record<MovementKind, string> = {
  drawdown: "Drawdown",
  // On a private-equity facility this doubles as return of capital —
  // PLAN.md's open item; rename only with the founder.
  repayment: "Repayment",
  interest: "Interest paid",
};
