/**
 * The Estimator's arithmetic, and nothing else.
 *
 * Pure and import-free so it can be unit-tested without a database —
 * the same reason lib/budgets/carry-forward.ts and
 * lib/indents/pull-rules.ts are shaped this way. Every decision about
 * what a number MEANS lives here; the screens only render what these
 * functions return.
 *
 * THE ONE RULE WORTH STATING: a missing rate produces `null`, never 0.
 * A material nobody has priced yet, or a work with no labour rate, must
 * read as "not priced" on screen — a confident ₹0 in a total is the
 * failure this codebase keeps naming, and a nullable return type is the
 * only version of that rule the compiler can enforce. Quantities are
 * still computed and shown: how much cement a villa needs is knowable
 * whether or not anyone has priced a bag.
 */

export type MaterialDef = {
  id: string;
  name: string;
  uom: string;
  /** null = nobody has priced it yet. */
  rate: number | null;
};

export type MixDef = {
  id: string;
  name: string;
  /** What one unit of the mix is — its components are per one of these. */
  uom: string;
  components: { materialId: string; qtyPerUnit: number }[];
};

export type WorkRecipe = {
  workItemId: string;
  /** null = the work has no estimator setup at all. */
  uom: string | null;
  labourRate: number | null;
  /** Exactly one of materialId / mixId is set on each (the DB enforces it). */
  components: { materialId: string | null; mixId: string | null; qtyPerUnit: number }[];
};

export type LineInput = { workItemId: string; qty: number };

/**
 * A work's material needs per ONE unit of the work, with mixes expanded
 * into their materials and duplicates merged — a material reached both
 * directly and through a mix is one row, not two.
 */
export function expandRecipe(
  recipe: WorkRecipe,
  mixesById: Map<string, MixDef>,
): { materialId: string; qtyPerWorkUnit: number }[] {
  const totals = new Map<string, number>();

  const add = (materialId: string, qty: number) => {
    totals.set(materialId, (totals.get(materialId) ?? 0) + qty);
  };

  for (const component of recipe.components) {
    if (component.materialId) {
      add(component.materialId, component.qtyPerUnit);
      continue;
    }
    if (!component.mixId) continue;
    const mix = mixesById.get(component.mixId);
    // A mix that has been deleted, or one nobody has given a composition
    // yet, contributes nothing rather than throwing — the screens flag
    // an empty mix separately, where the person can act on it.
    if (!mix) continue;
    for (const part of mix.components) {
      add(part.materialId, part.qtyPerUnit * component.qtyPerUnit);
    }
  }

  return [...totals].map(([materialId, qtyPerWorkUnit]) => ({ materialId, qtyPerWorkUnit }));
}

export type LineCost = {
  workItemId: string;
  qty: number;
  /** false = no estimator_work_info row: no unit, no labour rate, nothing. */
  isSetUp: boolean;
  /** false = set up, but nobody has said what it consumes. Labour only. */
  hasRecipe: boolean;
  /** null when the work has no labour rate. */
  labourCost: number | null;
  /** null when ANY material this line needs is unpriced. */
  materialCost: number | null;
  /** null when either half is unknown — a partial total is not a total. */
  totalCost: number | null;
  missingRateMaterialIds: string[];
};

export function computeLine(
  line: LineInput,
  recipe: WorkRecipe | undefined,
  mixesById: Map<string, MixDef>,
  materialsById: Map<string, MaterialDef>,
): LineCost {
  if (!recipe || recipe.uom === null) {
    return {
      workItemId: line.workItemId,
      qty: line.qty,
      isSetUp: false,
      hasRecipe: false,
      labourCost: null,
      materialCost: null,
      totalCost: null,
      missingRateMaterialIds: [],
    };
  }

  const needs = expandRecipe(recipe, mixesById);
  const labourCost = recipe.labourRate === null ? null : recipe.labourRate * line.qty;

  let materialCost: number | null = 0;
  const missingRateMaterialIds: string[] = [];
  for (const need of needs) {
    const material = materialsById.get(need.materialId);
    if (!material || material.rate === null) {
      // Keep collecting the rest: the screen wants to name every
      // unpriced material, not just the first one found.
      if (material) missingRateMaterialIds.push(material.id);
      materialCost = null;
      continue;
    }
    if (materialCost !== null) materialCost += material.rate * need.qtyPerWorkUnit * line.qty;
  }

  return {
    workItemId: line.workItemId,
    qty: line.qty,
    isSetUp: true,
    hasRecipe: needs.length > 0,
    labourCost,
    materialCost,
    totalCost: labourCost === null || materialCost === null ? null : labourCost + materialCost,
    missingRateMaterialIds,
  };
}

export type TakeoffRow = {
  materialId: string;
  quantity: number;
  /** null when the material has no rate — the quantity is still real. */
  cost: number | null;
  missingRate: boolean;
};

/** Every material an estimate needs, summed across all its lines. */
export function computeTakeoff(
  lines: LineInput[],
  recipesByWork: Map<string, WorkRecipe>,
  mixesById: Map<string, MixDef>,
  materialsById: Map<string, MaterialDef>,
): TakeoffRow[] {
  const quantities = new Map<string, number>();

  for (const line of lines) {
    const recipe = recipesByWork.get(line.workItemId);
    if (!recipe || recipe.uom === null) continue;
    for (const need of expandRecipe(recipe, mixesById)) {
      quantities.set(
        need.materialId,
        (quantities.get(need.materialId) ?? 0) + need.qtyPerWorkUnit * line.qty,
      );
    }
  }

  return [...quantities].map(([materialId, quantity]) => {
    const rate = materialsById.get(materialId)?.rate ?? null;
    return {
      materialId,
      quantity,
      cost: rate === null ? null : rate * quantity,
      missingRate: rate === null,
    };
  });
}

export type EstimateTotals = {
  /** Sums of what IS known. Read them beside isComplete, never alone. */
  labour: number;
  material: number;
  grand: number;
  /** false = something is unpriced, so these totals are a floor. */
  isComplete: boolean;
  missingLabourCount: number;
  missingMaterialRateCount: number;
  notSetUpCount: number;
};

export function computeEstimateTotals(lineCosts: LineCost[]): EstimateTotals {
  let labour = 0;
  let material = 0;
  let missingLabourCount = 0;
  let missingMaterialRateCount = 0;
  let notSetUpCount = 0;

  for (const line of lineCosts) {
    if (!line.isSetUp) {
      notSetUpCount += 1;
      continue;
    }
    if (line.labourCost === null) missingLabourCount += 1;
    else labour += line.labourCost;

    if (line.materialCost === null) missingMaterialRateCount += 1;
    else material += line.materialCost;
  }

  return {
    labour,
    material,
    grand: labour + material,
    isComplete: missingLabourCount === 0 && missingMaterialRateCount === 0 && notSetUpCount === 0,
    missingLabourCount,
    missingMaterialRateCount,
    notSetUpCount,
  };
}
