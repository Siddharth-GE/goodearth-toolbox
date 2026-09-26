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
/**
 * The estimate's own view of the recipe book: the standard everywhere,
 * with this villa's variations laid over it (0087 recipes, 0088 labour
 * rates). An override REPLACES — a customised component list is the
 * whole list, not a delta — and anything with no override keeps
 * following the master, which is what makes "reset" mean something.
 *
 * Applied before any arithmetic runs, so computeLine, computeTakeoff
 * and the submit snapshot all see one already-correct recipe book and
 * none of them needs to know overrides exist.
 */
export function applyEstimateOverrides(
  recipes: WorkRecipe[],
  componentsByWork: Map<string, WorkRecipe["components"]>,
  labourRateByWork: Map<string, number>,
): WorkRecipe[] {
  return recipes.map((recipe) => {
    const components = componentsByWork.get(recipe.workItemId);
    const labourRate = labourRateByWork.get(recipe.workItemId);
    if (components === undefined && labourRate === undefined) return recipe;
    return {
      ...recipe,
      components: components ?? recipe.components,
      // `?? recipe.labourRate` would be wrong: a villa rate of 0 is a
      // real answer (labour included in a contract), not "unpriced".
      labourRate: labourRate === undefined ? recipe.labourRate : labourRate,
    };
  });
}

/** This villa's material prices (0088) over Masters' — one price per
 * material per estimate, so no two works can disagree. */
export function applyRateOverrides(
  materials: MaterialDef[],
  rateByMaterialId: Map<string, number>,
): MaterialDef[] {
  if (rateByMaterialId.size === 0) return materials;
  return materials.map((material) => {
    const rate = rateByMaterialId.get(material.id);
    return rate === undefined ? material : { ...material, rate };
  });
}

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

/**
 * How ONE unit of a work is priced — the answer to "why is this rate
 * what it is?": the labour rate, then every material it consumes (mixes
 * expanded) at its price, each one's share of the rate, and the rate
 * itself. Same null rule as everywhere: an unpriced material, or no
 * labour rate, makes the rate unknown — each known part still shows.
 * Null when the work has no setup at all.
 */
export type RateBuildUp = {
  labourRate: number | null;
  materials: {
    materialId: string;
    qtyPerUnit: number;
    /** The price this estimate uses — the villa's own, else Masters'. */
    price: number | null;
    /** qtyPerUnit × price; null when unpriced. */
    cost: number | null;
  }[];
  /** Labour + every material, per one unit. */
  rate: number | null;
};

export function rateBuildUp(
  recipe: WorkRecipe | undefined,
  mixesById: Map<string, MixDef>,
  materialsById: Map<string, MaterialDef>,
): RateBuildUp | null {
  if (!recipe || recipe.uom === null) return null;
  const materials = expandRecipe(recipe, mixesById).map((need) => {
    const price = materialsById.get(need.materialId)?.rate ?? null;
    return {
      materialId: need.materialId,
      qtyPerUnit: need.qtyPerWorkUnit,
      price,
      cost: price === null ? null : price * need.qtyPerWorkUnit,
    };
  });
  const known = recipe.labourRate !== null && materials.every((row) => row.cost !== null);
  return {
    labourRate: recipe.labourRate,
    materials,
    rate: known
      ? (recipe.labourRate as number) +
        materials.reduce((sum, row) => sum + (row.cost as number), 0)
      : null,
  };
}

/**
 * The same build-up read back from a submitted estimate's snapshot: the
 * frozen labour cost and takeoff rows of one work, divided back to one
 * unit (the arithmetic is linear, so that is exactly what it was).
 */
export function frozenRateBuildUp(line: FrozenLineRow, takeoff: FrozenTakeoffRow[]): RateBuildUp {
  const perUnit = (value: number) => (line.qty > 0 ? value / line.qty : 0);
  const materials = takeoff
    .filter((row) => row.workItemId === line.workItemId)
    .map((row) => {
      const qtyPerUnit = perUnit(row.quantity);
      return {
        materialId: row.materialId,
        qtyPerUnit,
        price: row.rate,
        cost: row.rate === null ? null : row.rate * qtyPerUnit,
      };
    });
  return {
    labourRate: line.labourCost === null ? null : perUnit(line.labourCost),
    materials,
    rate: line.totalCost === null ? null : perUnit(line.totalCost),
  };
}

/**
 * What one unit of a mix costs: every material at its price. Unknown —
 * never low — when anything in it is unpriced, and when it is empty: a
 * mix with nothing in it costing ₹0 is the lying zero of BUGCATCHER #13.
 */
export function mixUnitCost(
  components: { rate: number | null; qtyPerUnit: number }[],
): number | null {
  if (components.length === 0) return null;
  if (components.some((component) => component.rate === null)) return null;
  return components.reduce(
    (sum, component) => sum + (component.rate as number) * component.qtyPerUnit,
    0,
  );
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

export type WorkTakeoffRow = {
  workItemId: string;
  materialId: string;
  quantity: number;
};

/**
 * The takeoff kept per (work, material) — what the submit snapshot
 * stores (0077). computeTakeoff above answers "how much cement does the
 * villa need"; this answers "how much cement does the Foundation
 * excavation need", which is the granularity issued-vs-estimated
 * comparison happens at. Summing these rows per material must always
 * equal computeTakeoff's quantities — a test pins that.
 */
export function computeWorkTakeoff(
  lines: LineInput[],
  recipesByWork: Map<string, WorkRecipe>,
  mixesById: Map<string, MixDef>,
): WorkTakeoffRow[] {
  const quantities = new Map<
    string,
    { workItemId: string; materialId: string; quantity: number }
  >();

  for (const line of lines) {
    const recipe = recipesByWork.get(line.workItemId);
    if (!recipe || recipe.uom === null) continue;
    for (const need of expandRecipe(recipe, mixesById)) {
      const key = `${line.workItemId} ${need.materialId}`;
      const row = quantities.get(key) ?? {
        workItemId: line.workItemId,
        materialId: need.materialId,
        quantity: 0,
      };
      row.quantity += need.qtyPerWorkUnit * line.qty;
      quantities.set(key, row);
    }
  }

  return [...quantities.values()];
}

export type EstimateTotals = {
  /**
   * Sums of what IS known — a floor, not an answer, whenever
   * `isComplete` is false.
   *
   * `null` means nothing in that column is known at all. It is NOT the
   * same as 0, and the difference is the whole point: a screen that
   * printed `₹0` for "every material here is unpriced" would be saying
   * the materials are free. Zero is reserved for a column that really
   * does cost nothing, like a labour-only estimate's materials.
   */
  labour: number | null;
  material: number | null;
  grand: number | null;
  /** false = something is unpriced, so the totals above are a floor. */
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

  // A column with nothing known in it hands back null rather than 0 —
  // otherwise "every material is unpriced" and "the materials are free"
  // print identically. A line with no setup at all counts as unknown on
  // BOTH sides, which is why it can't be judged by the two missing-rate
  // counters alone (they only see lines that got as far as being set up).
  const nothingUnknown =
    missingLabourCount === 0 && missingMaterialRateCount === 0 && notSetUpCount === 0;
  const labourKnown = nothingUnknown || labour > 0;
  const materialKnown = nothingUnknown || material > 0;

  return {
    labour: labourKnown ? labour : null,
    material: materialKnown ? material : null,
    grand: labourKnown || materialKnown ? labour + material : null,
    isComplete: missingLabourCount === 0 && missingMaterialRateCount === 0 && notSetUpCount === 0,
    missingLabourCount,
    missingMaterialRateCount,
    notSetUpCount,
  };
}

// ---------------------------------------------------------------------
// The frozen side: a submitted estimate renders from its snapshot
// ---------------------------------------------------------------------

/** One estimator_estimate_line_costs row, as the queries hand it over. */
export type FrozenLineRow = {
  workItemId: string;
  qty: number;
  /** null = the work had no setup when the estimate was submitted. */
  uom: string | null;
  labourCost: number | null;
  materialCost: number | null;
  totalCost: number | null;
};

/** One estimator_estimate_takeoff row — per (work, material), frozen. */
export type FrozenTakeoffRow = {
  workItemId: string;
  /** The item id since 0086; a legacy estimator_materials id before. */
  materialId: string;
  /** Set when the row is item-keyed (0086) — its quantity is already in
   * the item's unit, so comparisons need no conversion. */
  itemId?: string | null;
  materialName: string;
  uom: string;
  quantity: number;
  /** null = the material was unpriced on the day of submit. */
  rate: number | null;
};

/**
 * Rebuild LineCost[] from the 0077 snapshot, so a submitted estimate
 * renders through the SAME groupLineCosts/computeEstimateTotals path as
 * a draft — never a second grouping. What the snapshot does not store
 * is derived: a work was set up iff its uom was frozen; it had a recipe
 * iff any takeoff row names it; its unpriced materials are its takeoff
 * rows with no rate.
 */
export function frozenLineCosts(lines: FrozenLineRow[], takeoff: FrozenTakeoffRow[]): LineCost[] {
  const takeoffByWork = new Map<string, FrozenTakeoffRow[]>();
  for (const row of takeoff) {
    const list = takeoffByWork.get(row.workItemId) ?? [];
    list.push(row);
    takeoffByWork.set(row.workItemId, list);
  }

  return lines.map((line) => {
    const rows = takeoffByWork.get(line.workItemId) ?? [];
    return {
      workItemId: line.workItemId,
      qty: line.qty,
      isSetUp: line.uom !== null,
      hasRecipe: rows.length > 0,
      labourCost: line.labourCost,
      materialCost: line.materialCost,
      totalCost: line.totalCost,
      missingRateMaterialIds: rows.filter((row) => row.rate === null).map((row) => row.materialId),
    };
  });
}

/**
 * The frozen takeoff card: per-work rows summed back to per material,
 * with the same null-not-zero cost rule as the live computeTakeoff.
 * Name and uom were copied into the snapshot at submit, so a renamed
 * material changes nothing here.
 */
export function aggregateFrozenTakeoff(takeoff: FrozenTakeoffRow[]): {
  materialId: string;
  name: string;
  uom: string;
  quantity: number;
  cost: number | null;
  missingRate: boolean;
}[] {
  const byMaterial = new Map<
    string,
    { materialId: string; name: string; uom: string; quantity: number; missingRate: boolean }
  >();
  for (const row of takeoff) {
    const entry = byMaterial.get(row.materialId) ?? {
      materialId: row.materialId,
      name: row.materialName,
      uom: row.uom,
      quantity: 0,
      missingRate: false,
    };
    entry.quantity += row.quantity;
    entry.missingRate = entry.missingRate || row.rate === null;
    byMaterial.set(row.materialId, entry);
  }

  const rateByMaterial = new Map<string, number | null>();
  for (const row of takeoff) rateByMaterial.set(row.materialId, row.rate);

  return [...byMaterial.values()].map((entry) => ({
    ...entry,
    cost: entry.missingRate ? null : (rateByMaterial.get(entry.materialId) ?? 0) * entry.quantity,
  }));
}

export type BoqCategory = {
  code: string;
  name: string;
  lineCosts: LineCost[];
  /** The category's own honest subtotal — same null rules as the estimate's. */
  totals: EstimateTotals;
};

/**
 * The BOQ shape: lines gathered under their work category, in the
 * category order the site team reads (ENC, SM, FD, …), each group with
 * its own computeEstimateTotals subtotal. The estimate screen renders
 * this, and a future PDF export renders THIS SAME STRUCTURE — that is
 * the point of it living here rather than in the page: the paper and
 * the screen can never group or add differently.
 */
export function groupLineCosts(
  lineCosts: LineCost[],
  categoryByWork: Map<string, { code: string; name: string }>,
  /** Category codes in display order, from the works vocabulary. */
  categoryOrder: string[],
): BoqCategory[] {
  const groups = new Map<string, { code: string; name: string; lineCosts: LineCost[] }>();
  for (const line of lineCosts) {
    const category = categoryByWork.get(line.workItemId) ?? { code: "", name: "Uncategorised" };
    const group = groups.get(category.code) ?? { ...category, lineCosts: [] };
    group.lineCosts.push(line);
    groups.set(category.code, group);
  }

  const order = new Map(categoryOrder.map((code, index) => [code, index]));
  return [...groups.values()]
    .sort(
      (a, b) =>
        (order.get(a.code) ?? Number.MAX_SAFE_INTEGER) -
          (order.get(b.code) ?? Number.MAX_SAFE_INTEGER) || a.code.localeCompare(b.code),
    )
    .map((group) => ({ ...group, totals: computeEstimateTotals(group.lineCosts) }));
}

// ---------------------------------------------------------------------
// The measurement sheet (0096) — the QS layer under a line
// ---------------------------------------------------------------------

/** One measurement row: a blank box is null and means "not used". */
export type MeasurementInput = {
  nos: number | null;
  length: number | null;
  breadth: number | null;
  depth: number | null;
};

/**
 * Nos × Length × Breadth × Depth, with every blank box skipped — the
 * founder's standard sheet (2026-09-25): "12 nos" is 12, "12 × 3.0" is
 * 36, "1 × 4 × 3 × 0.15" is 1.8. A row with nothing in it measures 0
 * (the database refuses such a row; this only keeps the maths total).
 * No unit conversion ever happens here — the boxes are in whatever the
 * work is measured in, and the screen says so.
 */
export function measurementQuantity(row: MeasurementInput): number {
  const boxes = [row.nos, row.length, row.breadth, row.depth].filter(
    (value): value is number => value !== null,
  );
  if (boxes.length === 0) return 0;
  return roundQuantity(boxes.reduce((product, value) => product * value, 1));
}

/**
 * The sheet's total — what the line's quantity becomes. Rounded to six
 * decimals so floating-point dust (4 × 3 × 0.15 = 1.7999999999999998)
 * never reaches the database or the screen; six is far past anything a
 * site measurement carries (formatQuantity shows three).
 */
export function sheetTotal(rows: MeasurementInput[]): number {
  return roundQuantity(rows.reduce((sum, row) => sum + measurementQuantity(row), 0));
}

function roundQuantity(value: number): number {
  return Math.round(value * 1e6) / 1e6;
}
