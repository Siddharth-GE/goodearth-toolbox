import { roundPaise } from "@/lib/line-money";
// Pure rules. While an order has lines its value is their sum (the database writes it, rounded to paise); this says the same sum before saving.

export type WorkOrderLineInput = {
  workItemId: string | null;
  description: string;
  isLumpSum: boolean;
  quantity: number | null;
  uom: string | null;
  rate: number | null;
};

export function workOrderLineAmount(line: WorkOrderLineInput): number | null {
  if (line.rate === null || !Number.isFinite(line.rate)) return null;
  if (line.isLumpSum) return line.rate;
  if (line.quantity === null || !Number.isFinite(line.quantity)) return null;
  return line.quantity * line.rate;
}

export function workOrderTotal(lines: WorkOrderLineInput[]): number {
  const sum = lines.reduce((total, line) => total + (workOrderLineAmount(line) ?? 0), 0);
  return roundPaise(sum);
}

/** What is wrong with one line, in words — the 0105 shape CHECK, said first. */
export function workOrderLineProblem(line: WorkOrderLineInput): string | undefined {
  if (!line.description.trim()) return "Every work needs a description.";
  if (line.rate === null || !Number.isFinite(line.rate) || line.rate < 0) {
    return line.isLumpSum
      ? "Enter the lump sum for every lump-sum work."
      : "Enter a rate for every work.";
  }
  if (line.isLumpSum) return undefined;
  if (line.quantity === null || !Number.isFinite(line.quantity) || line.quantity <= 0) {
    return "Enter a quantity for every work that isn't a lump sum.";
  }
  if (!line.uom) return "Pick the unit for every work that isn't a lump sum.";
  return undefined;
}

/** A work the form can offer, with the rate book's unit and labour rate (work_labour_rate_facts). */
export type RateBookWork = {
  id: string;
  name: string;
  category: string;
  uom: string | null;
  labour_rate: number | null;
};

/** A stage's package works are the ones its rate book prices per sqft (Masters, 2026-10-22): Superstructure's and MEP's
 * share of the stage rate. A work order paid by stage carries one line per package, so a bill names the stage it pays. */
export const isPackageWork = (work: RateBookWork) =>
  work.uom === "sqft" && work.labour_rate !== null;

export function packageStages(works: RateBookWork[]): string[] {
  return [...new Set(works.filter(isPackageWork).map((work) => work.category))].sort();
}

/** One line per package work of the stage, at the rate book's rate, for the villa's built-up sqft; works already on the order are left alone. */
export function packageLines(
  works: RateBookWork[],
  stage: string,
  sqft: number,
  onOrder: (string | null)[] = [],
): WorkOrderLineInput[] {
  const present = new Set(onOrder);
  return works
    .filter((work) => work.category === stage && isPackageWork(work) && !present.has(work.id))
    .map((work) => ({
      workItemId: work.id,
      description: work.name,
      isLumpSum: false,
      quantity: sqft,
      uom: "sqft",
      rate: work.labour_rate,
    }));
}

export type WorkOrderInput = {
  vendorId: string;
  projectId: string;
  description: string;
  lines: WorkOrderLineInput[];
};

export function workOrderProblem(order: WorkOrderInput): string | undefined {
  if (!order.vendorId) return "Choose the contractor.";
  if (!order.projectId) return "Choose the project.";
  if (!order.description.trim()) return "Say what the work order covers.";
  if (order.lines.length === 0) return "Add at least one work.";
  for (const line of order.lines) {
    const problem = workOrderLineProblem(line);
    if (problem) return problem;
  }
  if (workOrderTotal(order.lines) <= 0) return "The work order's value must be more than zero.";
  return undefined;
}
