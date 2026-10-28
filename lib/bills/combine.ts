// Pure. combine_contractor_bills (0167) holds these same rules; the screen says them before anything is sent.

export type CombineCandidate = {
  id: string;
  reference: string;
  status: string;
  createdAt: string;
  total: number;
  hasMoney: boolean;
  onCashRequest: boolean;
  hasCharges: boolean;
  totalByHand: boolean;
  lineCount: number;
};

/** Why this bill can't be combined, in the database's words; undefined when it can. */
export function combineProblem(bill: CombineCandidate): string | undefined {
  if (bill.status !== "recorded" && bill.status !== "approved") return `It is ${bill.status}.`;
  if (bill.hasMoney) return "Money is on record against it, so it stays as it is.";
  if (bill.onCashRequest) return "It is on a cash request — take it off first.";
  if (bill.hasCharges) return "It has additional charges — put them on a line first.";
  if (bill.totalByHand) return "Its total is set by hand — clear it first.";
  if (bill.lineCount === 0) return "It has no lines — give it lines first.";
  return undefined;
}

/** The bill the others fold into: the oldest made, as the database picks it. */
export function keptBill<T extends Pick<CombineCandidate, "id" | "createdAt">>(
  bills: T[],
): T | undefined {
  const order = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
  return [...bills].sort((a, b) => order(a.createdAt, b.createdAt) || order(a.id, b.id))[0];
}
