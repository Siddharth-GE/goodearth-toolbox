/** The two closed vocabularies of the funding area, with on-screen names. They mirror the 0058 CHECK constraints: a value added here needs a migration extending the constraint. */

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
  // On a private-equity facility this doubles as return of capital (PLAN.md open item).
  repayment: "Repayment",
  interest: "Interest paid",
};
