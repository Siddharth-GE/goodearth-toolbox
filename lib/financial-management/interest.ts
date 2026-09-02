/**
 * What a funding facility owes and what interest has built up.
 *
 * The only real arithmetic in Financial Management's funding area, so it
 * lives in a pure module with no imports and gets the tests — the
 * lib/client-relations/dues.ts doctrine, written out again here because
 * one tool never imports another tool's code.
 *
 * Rules worth knowing before reading the code:
 *
 *   1. DATES ARE ISO STRINGS ('2026-08-13'), compared lexically, and
 *      `today` is always passed in. No `new Date()` in the arithmetic. A
 *      server in UTC and a founder in IST disagree about what "today" is
 *      for five and a half hours every day.
 *   2. THE COMPUTED ACCRUAL IS INFORMATIONAL, the recorded movements are
 *      the truth. Terms across banks, PE and private lenders are mixed
 *      and different; the formula here is the simplest honest one, and
 *      its limits are stated below so nobody mistakes it for a bank
 *      statement.
 *   3. INTEREST MOVEMENTS NEVER TOUCH PRINCIPAL. Drawdowns raise it,
 *      repayments lower it; interest paid is its own ledger, and the
 *      screen shows computed-vs-paid side by side.
 *
 * THE FORMULA, stated plainly: monthly simple accrual at month-end
 * granularity. For every completed calendar month, interest for that
 * month = principal outstanding at the end of it × ratePct / 1200.
 * Its limits: no day-count — a drawdown mid-month accrues a full month
 * at that month's end; non-compounding — unpaid interest does not itself
 * accrue; one rate for all time — editing the rate recomputes the whole
 * history. A facility with no rate gets no computed figure at all
 * (null, rendered as a dash) — never zero, which would read as "nothing
 * owed".
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
  /**
   * drawn − repaid, NOT floored at zero: a negative number means more
   * was repaid than drawn, which is a data-entry mistake the screen
   * should show, not hide.
   */
  outstanding: number;
  interestPaid: number;
  /** Null when the facility has no rate — a dash, never a zero. */
  accrued: number | null;
  /**
   * accrued − interestPaid. Negative is fine and real: an irregular
   * deal that pays more than the formula says. Never clamped.
   */
  accruedGap: number | null;
  isSettled: boolean;
};

/** '2026-08-13' → '2026-08'. */
function monthOf(isoDate: string): string {
  return isoDate.slice(0, 7);
}

function nextMonth(key: string): string {
  const year = Number(key.slice(0, 4));
  const month = Number(key.slice(5, 7));
  return month === 12 ? `${year + 1}-01` : `${year}-${String(month + 1).padStart(2, "0")}`;
}

/**
 * Where a facility stands: the principal ledger, the interest ledger,
 * and the informational accrual.
 */
export function facilityPosition(
  movements: readonly MovementInput[],
  ratePct: number | null,
  today: string,
): FacilityPosition {
  let drawn = 0;
  let repaid = 0;
  let interestPaid = 0;

  // Principal changes bucketed by calendar month — the accrual walks
  // month ends, so within a month the order of events does not matter.
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

  // Walk every completed month from the first principal movement up to,
  // and excluding, the month `today` falls in. The current month is not
  // finished, so it has not accrued.
  let accrued = 0;
  const currentMonth = monthOf(today);
  if (firstMonth !== null) {
    let principal = 0;
    let month = firstMonth;
    let steps = 0;
    while (month < currentMonth && steps < MAX_MONTHS) {
      principal += monthlyDelta.get(month) ?? 0;
      // A repayment recorded before any drawdown drives principal
      // negative; interest on a negative balance is nonsense, so the
      // accrual floors at zero while `outstanding` still tells the truth.
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
