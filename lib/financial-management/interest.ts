/**
 * What a funding facility owes and what interest has built up. Pure, no imports, tested.
 *
 * 1. Dates are ISO strings compared lexically and `today` is passed in: a UTC server and an IST
 *    founder disagree about "today" for five and a half hours a day.
 * 2. The computed accrual is informational; the recorded movements are the truth.
 * 3. Interest movements never touch principal. Drawdowns raise it, repayments lower it.
 *
 * Formula: for every completed calendar month, interest = principal outstanding at its end ×
 * ratePct / 1200. Limits: no day-count (a mid-month drawdown accrues a full month), no
 * compounding, one rate for all time (editing it recomputes history). No rate gives null (a
 * dash), never zero, which would read as "nothing owed".
 */

/** Money either side of a rounding boundary counts as settled. */
const EPSILON = 0.005;

/** A century of months — the walk guard against a mistyped year. */
const MAX_MONTHS = 1200;

export type MovementInput = {
  kind: "drawdown" | "repayment" | "interest";
  amount: number;
  happenedOn: string;
};

export type FacilityPosition = {
  drawn: number;
  repaid: number;
  /** drawn − repaid, not floored: a negative means more was repaid than drawn, a data-entry mistake to show. */
  outstanding: number;
  interestPaid: number;
  /** Null when the facility has no rate — a dash, never a zero. */
  accrued: number | null;
  /** accrued − interestPaid. Negative is real (a deal paying more than the formula); never clamped. */
  accruedGap: number | null;
  isSettled: boolean;
};

function monthOf(isoDate: string): string {
  return isoDate.slice(0, 7);
}

function nextMonth(key: string): string {
  const year = Number(key.slice(0, 4));
  const month = Number(key.slice(5, 7));
  return month === 12 ? `${year + 1}-01` : `${year}-${String(month + 1).padStart(2, "0")}`;
}

export function facilityPosition(
  movements: readonly MovementInput[],
  ratePct: number | null,
  today: string,
): FacilityPosition {
  let drawn = 0;
  let repaid = 0;
  let interestPaid = 0;

  // Principal changes bucketed by calendar month: the accrual walks month ends.
  const monthlyDelta = new Map<string, number>();
  let firstMonth: string | null = null;

  for (const movement of movements) {
    if (movement.kind === "interest") {
      interestPaid += movement.amount;
      continue;
    }
    const delta = movement.kind === "drawdown" ? movement.amount : -movement.amount;
    if (movement.kind === "drawdown") drawn += movement.amount;
    else repaid += movement.amount;

    const key = monthOf(movement.happenedOn);
    monthlyDelta.set(key, (monthlyDelta.get(key) ?? 0) + delta);
    if (firstMonth === null || key < firstMonth) firstMonth = key;
  }

  const outstanding = drawn - repaid;
  const isSettled = drawn > 0 && outstanding <= EPSILON;

  if (ratePct === null) {
    return { drawn, repaid, outstanding, interestPaid, accrued: null, accruedGap: null, isSettled };
  }

  // Walk every completed month from the first principal movement; the current month has not accrued.
  let accrued = 0;
  const currentMonth = monthOf(today);
  if (firstMonth !== null) {
    let principal = 0;
    let month = firstMonth;
    let steps = 0;
    while (month < currentMonth && steps < MAX_MONTHS) {
      principal += monthlyDelta.get(month) ?? 0;
      // A repayment before any drawdown makes principal negative; accrual floors at zero while `outstanding` tells the truth.
      accrued += Math.max(0, principal) * (ratePct / 1200);
      month = nextMonth(month);
      steps += 1;
    }
  }

  return {
    drawn,
    repaid,
    outstanding,
    interestPaid,
    accrued,
    accruedGap: accrued - interestPaid,
    isSettled,
  };
}
