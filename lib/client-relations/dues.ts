/**
 * What a client owes. Pure, no imports: the only real arithmetic in Client Relations.
 * Dates are ISO strings compared lexically and `today` is passed in, so "overdue" never depends on server timezone versus IST.
 * An unallocated receipt settles the oldest unpaid milestone first, or a plot shows overdue for money already in the bank.
 */

/** Money either side of a rounding boundary counts as settled. */
const EPSILON = 0.005;

export type MilestoneInput = {
  id: string;
  stage: string;
  sortOrder: number;
  /** Null until someone decides the amount; not the same as zero. */
  dueAmount: number | null;
  dueOn: string | null;
  invoicedOn: string | null;
};

export type ReceiptInput = {
  id: string;
  /** Null = not yet assigned to a milestone. */
  milestoneId: string | null;
  amount: number;
  receivedOn: string;
};

export type MilestoneDue = MilestoneInput & {
  received: number;
  /** Never negative; overpayment shows in the summary. */
  outstanding: number;
  isSettled: boolean;
  isOverdue: boolean;
};

export type DuesSummary = {
  overdueCount: number;
  overpaid: number;
  nextDueOn: string | null;
  nextDueAmount: number | null;
};

export function allocateReceipts(
  milestones: readonly MilestoneInput[],
  receipts: readonly ReceiptInput[],
  today: string,
): MilestoneDue[] {
  const ordered = [...milestones].sort((a, b) => a.sortOrder - b.sortOrder);

  // A receipt naming a milestone missing from this list (mid-delete only) is skipped here but still counted in `received`.
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

    // Spill the unallocated pool into the oldest short rung; a milestone with no amount absorbs nothing.
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
      // No due date is never late: the sheet leaves most blank, and inventing urgency would make the Dues page cry wolf.
      isOverdue: milestone.dueOn !== null && milestone.dueOn < today && outstanding > EPSILON,
    };
  });
}

export function summariseDues(
  milestones: readonly MilestoneInput[],
  receipts: readonly ReceiptInput[],
  today: string,
): DuesSummary {
  const rows = allocateReceipts(milestones, receipts, today);

  const scheduled = rows.reduce((sum, row) => sum + (row.dueAmount ?? 0), 0);
  const invoiced = rows.reduce((sum, row) => sum + (row.invoicedOn ? (row.dueAmount ?? 0) : 0), 0);
  // Every receipt, allocated or not: money in the bank is money in the bank.
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
 * Add up summaries each worked out on its own. Never merge the inputs: an unallocated receipt spills into the oldest unpaid
 * rung, so a merged run would let Villa 17's money settle Villa 39's instalment. Each plot is its own ledger.
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

  const next = summaries
    .filter((one): one is DuesSummary & { nextDueOn: string } => one.nextDueOn !== null)
    .sort((a, b) => a.nextDueOn.localeCompare(b.nextDueOn))[0];

  return {
    ...total,
    nextDueOn: next?.nextDueOn ?? null,
    nextDueAmount: next?.nextDueAmount ?? null,
  };
}
