/**
 * What a client owes, and how late it is.
 *
 * The only real arithmetic in Client Relations, which is why it lives in a
 * pure module with no imports and gets the tests. Everything on the
 * Collections tab and the whole Dues page is this file's output rendered.
 *
 * Two rules worth knowing before reading the code:
 *
 *   1. DATES ARE ISO STRINGS ('2026-08-11'), compared lexically, and
 *      `today` is always passed in. No `new Date()` anywhere. A server in
 *      UTC and a founder in IST disagree about what "today" is for five
 *      and a half hours every day, and "overdue" is exactly the kind of
 *      answer that must not depend on which one asked.
 *   2. AN UNALLOCATED RECEIPT SETTLES THE OLDEST UNPAID MILESTONE FIRST.
 *      Money often arrives before anyone decides what it is for; leaving
 *      it out of the arithmetic would show a plot as overdue for money
 *      already in the bank.
 */

/** Money either side of a rounding boundary counts as settled. */
const EPSILON = 0.005;

export type MilestoneInput = {
  id: string;
  stage: string;
  sortOrder: number;
  /** Null until someone has decided the amount — not the same as zero. */
  dueAmount: number | null;
  dueOn: string | null;
  invoicedOn: string | null;
};

export type ReceiptInput = {
  id: string;
  /** Null = arrived, not yet assigned to a milestone. */
  milestoneId: string | null;
  amount: number;
  receivedOn: string;
};

export type MilestoneDue = MilestoneInput & {
  /** Allocated to this milestone: direct receipts plus any spillover. */
  received: number;
  /** Never negative. Overpayment shows up in the summary, not here. */
  outstanding: number;
  isSettled: boolean;
  isOverdue: boolean;
};

export type DuesSummary = {
  /** Every amount anyone has put on the schedule. */
  scheduled: number;
  /** The part of the schedule that has actually been billed. */
  invoiced: number;
  /** Every rupee received, allocated or not. */
  received: number;
  /** Scheduled minus received, floored at zero. */
  outstanding: number;
  /** Outstanding on milestones whose due date has already passed. */
  overdue: number;
  overdueCount: number;
  /** Received beyond the whole schedule. Zero in the normal case. */
  overpaid: number;
  /** The soonest unsettled due date, or null. */
  nextDueOn: string | null;
  nextDueAmount: number | null;
};

/**
 * Spread receipts across the schedule and say where each milestone stands.
 *
 * Returned in schedule order (`sortOrder`), not the order handed in, so a
 * caller can render the result directly.
 */
export function allocateReceipts(
  milestones: readonly MilestoneInput[],
  receipts: readonly ReceiptInput[],
  today: string,
): MilestoneDue[] {
  const ordered = [...milestones].sort((a, b) => a.sortOrder - b.sortOrder);

  // Directly allocated receipts first. A receipt naming a milestone that
  // isn't in this list is ignored here and still counted in the summary's
  // `received` — the composite FK in 0050 makes the cross-villa case
  // impossible, so this only happens mid-delete.
  const direct = new Map<string, number>();
  let unallocated = 0;
  for (const receipt of receipts) {
    if (receipt.milestoneId && ordered.some((m) => m.id === receipt.milestoneId)) {
      direct.set(receipt.milestoneId, (direct.get(receipt.milestoneId) ?? 0) + receipt.amount);
    } else if (!receipt.milestoneId) {
      unallocated += receipt.amount;
    }
  }

  return ordered.map((milestone) => {
    const due = milestone.dueAmount ?? 0;
    let received = direct.get(milestone.id) ?? 0;

    // Spill the unallocated pool into whatever is still short, oldest rung
    // first. A milestone with no amount set absorbs nothing — there is no
    // shortfall to settle.
    if (unallocated > 0 && due - received > EPSILON) {
      const take = Math.min(unallocated, due - received);
      received += take;
      unallocated -= take;
    }

    const outstanding = Math.max(0, due - received);
    const isSettled = milestone.dueAmount !== null && outstanding <= EPSILON;

    return {
      ...milestone,
      received,
      outstanding,
      isSettled,
      // No due date is never late, however much is owed. The founder's
      // sheet leaves most of these blank, and inventing urgency from a
      // blank cell would make the Dues page cry wolf on every plot.
      isOverdue: milestone.dueOn !== null && milestone.dueOn < today && outstanding > EPSILON,
    };
  });
}

/** The figures above the grid, and the ones the Dues page totals. */
export function summariseDues(
  milestones: readonly MilestoneInput[],
  receipts: readonly ReceiptInput[],
  today: string,
): DuesSummary {
  const rows = allocateReceipts(milestones, receipts, today);

  const scheduled = rows.reduce((sum, row) => sum + (row.dueAmount ?? 0), 0);
  const invoiced = rows.reduce((sum, row) => sum + (row.invoicedOn ? (row.dueAmount ?? 0) : 0), 0);
  // Every receipt, not just the allocated ones: money in the bank is money
  // in the bank whether or not it has been filed against a rung yet.
  const received = receipts.reduce((sum, receipt) => sum + receipt.amount, 0);

  const overdueRows = rows.filter((row) => row.isOverdue);

  const nextDue =
    rows
      .filter((row) => row.dueOn !== null && !row.isSettled && row.outstanding > EPSILON)
      .sort((a, b) => (a.dueOn ?? "").localeCompare(b.dueOn ?? ""))[0] ?? null;

  return {
    scheduled,
    invoiced,
    received,
    outstanding: Math.max(0, scheduled - received),
    overdue: overdueRows.reduce((sum, row) => sum + row.outstanding, 0),
    overdueCount: overdueRows.length,
    overpaid: Math.max(0, received - scheduled),
    nextDueOn: nextDue?.dueOn ?? null,
    nextDueAmount: nextDue?.outstanding ?? null,
  };
}

/**
 * Add up summaries that were each worked out on their own.
 *
 * THIS IS NOT THE SAME as merging every plot's milestones and receipts
 * into one list and summarising that, and the difference is a real bug
 * rather than a nicety: an unallocated receipt spills into the oldest
 * unpaid rung it can find, so a merged run would let money received
 * against Villa 17 quietly settle Villa 39's foundation instalment. Each
 * plot's schedule is its own ledger. Roll up the answers, never the inputs.
 */
export function combineSummaries(summaries: readonly DuesSummary[]): DuesSummary {
  const total = summaries.reduce(
    (acc, one) => ({
      scheduled: acc.scheduled + one.scheduled,
      invoiced: acc.invoiced + one.invoiced,
      received: acc.received + one.received,
      outstanding: acc.outstanding + one.outstanding,
      overdue: acc.overdue + one.overdue,
      overdueCount: acc.overdueCount + one.overdueCount,
      overpaid: acc.overpaid + one.overpaid,
      nextDueOn: null,
      nextDueAmount: null,
    }),
    {
      scheduled: 0,
      invoiced: 0,
      received: 0,
      outstanding: 0,
      overdue: 0,
      overdueCount: 0,
      overpaid: 0,
      nextDueOn: null,
      nextDueAmount: null,
    } as DuesSummary,
  );

  // The soonest date anyone owes anything, and what is owed on that date.
  const next = summaries
    .filter((one): one is DuesSummary & { nextDueOn: string } => one.nextDueOn !== null)
    .sort((a, b) => a.nextDueOn.localeCompare(b.nextDueOn))[0];

  return {
    ...total,
    nextDueOn: next?.nextDueOn ?? null,
    nextDueAmount: next?.nextDueAmount ?? null,
  };
}
