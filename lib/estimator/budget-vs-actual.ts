// Pure. One villa's budget against actual from villa_cost_facts (0136), per work and per stage (the work's category).
// Estimated: the official estimate, labour and material apart. Committed: issued POs bought for the villa and approved
// work orders. Actual: material issued or delivered to site at its batch rates, and labour billed. Every figure before
// GST. A part whose rate is unknown makes the figure partial, and says which way: the whole is more than shown, or
// (for what is left, when spending is incomplete) less. Never as if it were the whole.

export const COST_KINDS = [
  "estimated_labour",
  "estimated_material",
  "po_committed",
  "wo_committed",
  "material_issued",
  "material_delivered",
  "labour_billed",
  "material_billed",
] as const;
export type CostKind = (typeof COST_KINDS)[number];

export type CostFact = {
  workItemId: string | null;
  kind: string;
  amount: number;
  unpriced: boolean;
};

/** Which way an unpriced part moves the true figure: more than shown, less, or either. */
export type Partial = false | "more" | "less" | "both";

/** A sum that may be missing a part. */
export type Amount = { amount: number; partial: Partial };

function combine(parts: Partial[]): Partial {
  const kinds = new Set(parts.filter((part) => part !== false));
  if (kinds.size === 0) return false;
  if (kinds.has("both") || kinds.size > 1) return "both";
  return [...kinds][0];
}

export type BudgetLine = {
  estimatedLabour: Amount | null;
  estimatedMaterial: Amount | null;
  estimated: Amount | null;
  committed: Amount | null;
  actual: Amount | null;
  /** Estimated less actual: above zero is still within the estimate. Null without either side. */
  left: Amount | null;
};

export type BudgetWork = BudgetLine & { workItemId: string | null; label: string };
export type BudgetStage = BudgetLine & { key: string; label: string; works: BudgetWork[] };
export type BudgetReport = { stages: BudgetStage[]; total: BudgetLine };

export type WorkInfo = { label: string; categoryId: string | null; sortOrder: number };
export type StageInfo = { label: string; sortOrder: number };

export function addAmounts(...parts: (Amount | null)[]): Amount | null {
  const present = parts.filter((part): part is Amount => part !== null);
  if (present.length === 0) return null;
  return {
    amount: present.reduce((sum, part) => sum + part.amount, 0),
    partial: combine(present.map((part) => part.partial)),
  };
}

function lineOf(byKind: Map<string, Amount>): BudgetLine {
  const get = (kind: CostKind) => byKind.get(kind) ?? null;
  const estimatedLabour = get("estimated_labour");
  const estimatedMaterial = get("estimated_material");
  const estimated = addAmounts(estimatedLabour, estimatedMaterial);
  const committed = addAmounts(get("po_committed"), get("wo_committed"));
  const actual = addAmounts(
    get("material_issued"),
    get("material_delivered"),
    get("labour_billed"),
  );
  const left =
    estimated === null && actual === null
      ? null
      : {
          amount: (estimated?.amount ?? 0) - (actual?.amount ?? 0),
          // Unpriced estimate leaves more; unpriced spending leaves less.
          partial: combine([estimated?.partial ? "more" : false, actual?.partial ? "less" : false]),
        };
  return { estimatedLabour, estimatedMaterial, estimated, committed, actual, left };
}

function sumLines(lines: BudgetLine[]): BudgetLine {
  const pick = (key: keyof BudgetLine) => addAmounts(...lines.map((line) => line[key]));
  return {
    estimatedLabour: pick("estimatedLabour"),
    estimatedMaterial: pick("estimatedMaterial"),
    estimated: pick("estimated"),
    committed: pick("committed"),
    actual: pick("actual"),
    left: pick("left"),
  };
}

const NO_WORK = "No work recorded";
const NO_STAGE = "Other";

export function budgetReport(
  facts: CostFact[],
  works: Map<string, WorkInfo>,
  stages: Map<string, StageInfo>,
): BudgetReport {
  const byWork = new Map<string, Map<string, Amount>>();
  for (const fact of facts) {
    const key = fact.workItemId ?? "";
    const kinds = byWork.get(key) ?? new Map<string, Amount>();
    const sum = addAmounts(kinds.get(fact.kind) ?? null, {
      amount: fact.amount,
      partial: fact.unpriced ? "more" : false,
    });
    if (sum) kinds.set(fact.kind, sum);
    byWork.set(key, kinds);
  }

  const stageMap = new Map<
    string,
    { label: string; sortOrder: number; works: { sortOrder: number; work: BudgetWork }[] }
  >();
  for (const [key, kinds] of byWork) {
    const work = key ? works.get(key) : undefined;
    const stageKey = key ? (work?.categoryId ?? "other") : "none";
    const stage = stages.get(stageKey);
    const entry = stageMap.get(stageKey) ?? {
      label: stage?.label ?? (key ? NO_STAGE : NO_WORK),
      sortOrder: stage?.sortOrder ?? Number.MAX_SAFE_INTEGER,
      works: [],
    };
    entry.works.push({
      sortOrder: work?.sortOrder ?? Number.MAX_SAFE_INTEGER,
      work: {
        workItemId: key || null,
        label: work?.label ?? (key ? "A work no longer in Masters" : NO_WORK),
        ...lineOf(kinds),
      },
    });
    stageMap.set(stageKey, entry);
  }

  const result: BudgetStage[] = [...stageMap.entries()]
    .sort(([, a], [, b]) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label))
    .map(([key, stage]) => {
      const sorted = stage.works
        .sort((a, b) => a.sortOrder - b.sortOrder || a.work.label.localeCompare(b.work.label))
        .map((entry) => entry.work);
      return { key, label: stage.label, works: sorted, ...sumLines(sorted) };
    });
  return { stages: result, total: sumLines(result) };
}
