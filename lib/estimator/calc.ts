/** Pure and import-free so it unit-tests without a database. A missing rate yields null, never 0: a confident ₹0 in a total is the failure BUGCATCHER keeps naming. */

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

/** A line of an estimate. qty null = listed but not yet measured (0097). */
export type LineInput = { workItemId: string; qty: number | null };

/** The estimate's recipe book: the standard with this villa's variations laid over it (0087, 0088). An override REPLACES, it is not a delta. Applied before any arithmetic. */
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
      // A villa rate of 0 is real (labour included in a contract), so do not fall back on falsy.
      labourRate: labourRate === undefined ? recipe.labourRate : labourRate,
    };
  });
}

/** This villa's prices (0088) over Masters': one price per material per estimate. */
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
    // A deleted or empty mix contributes nothing; the screens flag an empty mix.
    if (!mix) continue;
    for (const part of mix.components) {
      add(part.materialId, part.qtyPerUnit * component.qtyPerUnit);
    }
  }

  return [...totals].map(([materialId, qtyPerWorkUnit]) => ({ materialId, qtyPerWorkUnit }));
}

export type LineCost = {
  workItemId: string;
  qty: number | null;
  toMeasure: boolean;
  /** false = no estimator_work_info row: no unit, no labour rate, nothing. */
  isSetUp: boolean;
  /** false = set up, but nobody has said what it consumes. Labour only. */
  hasRecipe: boolean;
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
      toMeasure: line.qty === null,
      isSetUp: false,
      hasRecipe: false,
      labourCost: null,
      materialCost: null,
      totalCost: null,
      missingRateMaterialIds: [],
    };
  }

  const needs = expandRecipe(recipe, mixesById);
  // Not measured yet: nothing can be costed — unknown, never zero.
  if (line.qty === null) {
    return {
      workItemId: line.workItemId,
      qty: null,
      toMeasure: true,
      isSetUp: true,
      hasRecipe: needs.length > 0,
      labourCost: null,
      materialCost: null,
      totalCost: null,
      missingRateMaterialIds: [],
    };
  }
  const qty = line.qty;
  const labourCost = recipe.labourRate === null ? null : recipe.labourRate * qty;

  let materialCost: number | null = 0;
  const missingRateMaterialIds: string[] = [];
  for (const need of needs) {
    const material = materialsById.get(need.materialId);
    if (!material || material.rate === null) {
      // Keep going: the screen names every unpriced material.
      if (material) missingRateMaterialIds.push(material.id);
      materialCost = null;
      continue;
    }
    if (materialCost !== null) materialCost += material.rate * need.qtyPerWorkUnit * qty;
  }

  return {
    workItemId: line.workItemId,
    qty,
    toMeasure: false,
    isSetUp: true,
    hasRecipe: needs.length > 0,
    labourCost,
    materialCost,
    totalCost: labourCost === null || materialCost === null ? null : labourCost + materialCost,
    missingRateMaterialIds,
  };
}

/** How ONE unit of a work is priced: labour, then each material at its price. Unpriced parts make the rate
 * null; known parts still show. Null when the work has no setup. */
export type RateBuildUp = {
  labourRate: number | null;
  materials: {
    materialId: string;
    qtyPerUnit: number;
    /** The price this estimate uses — the villa's own, else Masters'. */
    price: number | null;
    cost: number | null;
  }[];
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

/** The same build-up from a submitted snapshot, divided back to one unit (the arithmetic is linear). */
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

/** Unit cost of a mix. Unknown when anything is unpriced or the mix is empty: an empty mix at ₹0 is BUGCATCHER #13. */
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

export function computeTakeoff(
  lines: LineInput[],
  recipesByWork: Map<string, WorkRecipe>,
  mixesById: Map<string, MixDef>,
  materialsById: Map<string, MaterialDef>,
): TakeoffRow[] {
  const quantities = new Map<string, number>();

  for (const line of lines) {
    const recipe = recipesByWork.get(line.workItemId);
    if (!recipe || recipe.uom === null || line.qty === null) continue;
    const qty = line.qty;
    for (const need of expandRecipe(recipe, mixesById)) {
      quantities.set(
        need.materialId,
        (quantities.get(need.materialId) ?? 0) + need.qtyPerWorkUnit * qty,
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

/** Takeoff per (work, material), as the submit snapshot stores it (0077).
 * Summing per material must equal computeTakeoff; a test pins that. */
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
    if (!recipe || recipe.uom === null || line.qty === null) continue;
    const qty = line.qty;
    for (const need of expandRecipe(recipe, mixesById)) {
      const key = `${line.workItemId} ${need.materialId}`;
      const row = quantities.get(key) ?? {
        workItemId: line.workItemId,
        materialId: need.materialId,
        quantity: 0,
      };
      row.quantity += need.qtyPerWorkUnit * qty;
      quantities.set(key, row);
    }
  }

  return [...quantities.values()];
}

export type EstimateTotals = {
  /** Sums of what IS known: a floor while isComplete is false. null means nothing in the column is known,
   * which is NOT 0 (zero would say the materials are free). */
  labour: number | null;
  material: number | null;
  grand: number | null;
  /** false = something is unpriced, so the totals above are a floor. */
  isComplete: boolean;
  missingLabourCount: number;
  missingMaterialRateCount: number;
  notSetUpCount: number;
  toMeasureCount: number;
};

export function computeEstimateTotals(lineCosts: LineCost[]): EstimateTotals {
  let labour = 0;
  let material = 0;
  let missingLabourCount = 0;
  let missingMaterialRateCount = 0;
  let notSetUpCount = 0;
  let toMeasureCount = 0;

  for (const line of lineCosts) {
    if (line.toMeasure) {
      toMeasureCount += 1;
      continue;
    }
    if (!line.isSetUp) {
      notSetUpCount += 1;
      continue;
    }
    if (line.labourCost === null) missingLabourCount += 1;
    else labour += line.labourCost;

    if (line.materialCost === null) missingMaterialRateCount += 1;
    else material += line.materialCost;
  }

  // A column with nothing known hands back null, not 0. A line with no setup counts as unknown on BOTH sides,
  // so the missing-rate counters alone cannot judge it.
  const nothingUnknown =
    missingLabourCount === 0 &&
    missingMaterialRateCount === 0 &&
    notSetUpCount === 0 &&
    toMeasureCount === 0;
  const labourKnown = nothingUnknown || labour > 0;
  const materialKnown = nothingUnknown || material > 0;

  return {
    labour: labourKnown ? labour : null,
    material: materialKnown ? material : null,
    grand: labourKnown || materialKnown ? labour + material : null,
    isComplete: nothingUnknown,
    missingLabourCount,
    missingMaterialRateCount,
    notSetUpCount,
    toMeasureCount,
  };
}

export type FrozenLineRow = {
  workItemId: string;
  qty: number;
  /** null = the work had no setup when the estimate was submitted. */
  uom: string | null;
  labourCost: number | null;
  materialCost: number | null;
  totalCost: number | null;
};

export type FrozenTakeoffRow = {
  workItemId: string;
  /** The item id since 0086; a legacy estimator_materials id before. */
  materialId: string;
  /** Set when item-keyed (0086): the quantity is already in the item's unit, so no conversion. */
  itemId?: string | null;
  materialName: string;
  uom: string;
  quantity: number;
  /** null = the material was unpriced on the day of submit. */
  rate: number | null;
};

/** Rebuild LineCost[] from the 0077 snapshot so a submitted estimate renders through the SAME grouping as a draft.
 * Unstored facts are derived: set up iff its uom was frozen; had a recipe iff a takeoff row names it. */
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
      toMeasure: false,
      isSetUp: line.uom !== null,
      hasRecipe: rows.length > 0,
      labourCost: line.labourCost,
      materialCost: line.materialCost,
      totalCost: line.totalCost,
      missingRateMaterialIds: rows.filter((row) => row.rate === null).map((row) => row.materialId),
    };
  });
}

/** Frozen takeoff per material, with the live null-not-zero cost rule.
 * Name and uom were copied at submit, so a renamed material changes nothing. */
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
  totals: EstimateTotals;
};

/** BOQ shape: lines under their work category in the order the site team reads, each with its own subtotal.
 * Lives here so screen and any PDF group and add identically. */
export function groupLineCosts(
  lineCosts: LineCost[],
  categoryByWork: Map<string, { code: string; name: string }>,
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

/** One measurement row: a blank box is null and means "not used". */
export type MeasurementInput = {
  nos: number | null;
  length: number | null;
  breadth: number | null;
  depth: number | null;
};

/** Nos × Length × Breadth × Depth, blank boxes skipped ("12 × 3.0" is 36). A row with nothing measures 0;
 * the database refuses such a row. No unit conversion here. */
export function measurementQuantity(row: MeasurementInput): number {
  const boxes = [row.nos, row.length, row.breadth, row.depth].filter(
    (value): value is number => value !== null,
  );
  if (boxes.length === 0) return 0;
  return roundQuantity(boxes.reduce((product, value) => product * value, 1));
}

/** The sheet's total, rounded to six decimals so float dust (4 × 3 × 0.15 = 1.7999999999999998) never reaches the database. */
export function sheetTotal(rows: MeasurementInput[]): number {
  return roundQuantity(rows.reduce((sum, row) => sum + measurementQuantity(row), 0));
}

function roundQuantity(value: number): number {
  return Math.round(value * 1e6) / 1e6;
}
