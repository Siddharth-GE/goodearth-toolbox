/**
 * What the estimate page shows, worked out in one pure place: costs, the
 * materials take-off, each line's rate build-up and what is still missing.
 * A working estimate computes live from today's rates (0098); an official one
 * renders its frozen snapshot through the same grouping. This villa's
 * variations (0087, 0088) are laid over the rate book before any arithmetic.
 */
import {
  aggregateFrozenTakeoff,
  applyRateOverrides,
  computeEstimateTotals,
  computeLine,
  computeTakeoff,
  frozenLineCosts,
  groupLineCosts,
  lineRecipes,
  rateBuildUp,
  type LineCost,
  type MaterialDef,
  type MixDef,
  type WorkRecipe,
} from "./calc";
import { joinInWords } from "../format";
import type {
  EstimateDetail,
  EstimateVariations,
  OtherCostRow,
  RecipeBook,
} from "./estimate-queries";
import type { MixRow } from "./mixes-queries";
import type { MaterialItemRow } from "./shared";
import type { WorkStatusRow } from "./works-queries";

/** One row of what a unit of the work uses, as written (mixes not expanded). `ref` is "mix:<id>" or "material:<id>". */
export type RateComponentView = {
  ref: string;
  kind: "material" | "mix";
  name: string;
  uom: string;
  qtyPerUnit: number;
};

export type LineRateView = {
  lineId: string;
  workItemId: string;
  workName: string;
  workUom: string | null;
  own: boolean;
  /** Made of what the SketchUp model measured (0174), in place of the rate book's list. */
  fromModel: boolean;
  labour: { villa: number | null; rateBook: number | null; inUse: number | null };
  components: RateComponentView[];
  prices: RatePriceView[];
  rate: number | null;
};

/** One material the rate is built from, mixes expanded. */
export type RatePriceView = {
  itemId: string;
  name: string;
  uom: string;
  qtyPerUnit: number;
  mastersPrice: number | null;
  villaPrice: number | null;
  cost: number | null;
};

export type RateOptions = {
  materials: { id: string; name: string; uom: string; rate: number | null }[];
  mixes: { id: string; name: string; uom: string }[];
};

export type TakeoffRow = {
  materialId: string;
  name: string;
  uom: string;
  quantity: number;
  cost: number | null;
  missingRate: boolean;
};

type Totals = ReturnType<typeof computeEstimateTotals>;

/** One other cost's amount: unknown, never zero, while its quantity or rate is blank. */
export function otherCostAmount(row: Pick<OtherCostRow, "qty" | "rate">): number | null {
  return row.qty === null || row.rate === null ? null : row.qty * row.rate;
}

/** The other costs added up (0174): what is priced, and how many are not. Nothing listed is 0; nothing priced is null. */
export function otherCostsTotal(rows: Pick<OtherCostRow, "qty" | "rate">[]): {
  amount: number | null;
  priced: number;
  unpriced: number;
} {
  const amounts = rows.map(otherCostAmount);
  const priced = amounts.filter((amount): amount is number => amount !== null);
  return {
    amount: rows.length > 0 && priced.length === 0 ? null : priced.reduce((sum, a) => sum + a, 0),
    priced: priced.length,
    unpriced: amounts.length - priced.length,
  };
}

/** Labour, materials and other costs together: a floor while anything is unpriced. */
export function grandTotal(
  totals: Totals,
  other: ReturnType<typeof otherCostsTotal>,
): { amount: number | null; isComplete: boolean } {
  return {
    // Nothing priced anywhere is unknown, never ₹0 — an estimate with no other costs included.
    amount:
      totals.grand === null && other.priced === 0
        ? null
        : (totals.grand ?? 0) + (other.amount ?? 0),
    isComplete: totals.isComplete && other.unpriced === 0,
  };
}

/** The warning under the total, or none when everything is priced. */
export function missingParts(totals: Totals, unpricedOther = 0): string[] {
  const parts = [
    totals.toMeasureCount > 0 &&
      `${totals.toMeasureCount} ${totals.toMeasureCount === 1 ? "work is" : "works are"} still to measure`,
    totals.notSetUpCount > 0 &&
      `${totals.notSetUpCount} ${totals.notSetUpCount === 1 ? "work has" : "works have"} no setup`,
    totals.missingLabourCount > 0 &&
      `${totals.missingLabourCount} ${totals.missingLabourCount === 1 ? "work has" : "works have"} no labour rate`,
    totals.missingMaterialRateCount > 0 &&
      `${totals.missingMaterialRateCount} ${totals.missingMaterialRateCount === 1 ? "work uses a material" : "works use materials"} with no rate`,
    unpricedOther > 0 &&
      `${unpricedOther} other ${unpricedOther === 1 ? "cost has" : "costs have"} no quantity or rate`,
  ];
  return parts.filter((part): part is string => Boolean(part));
}

export function buildEstimateView(input: {
  estimate: EstimateDetail;
  book: RecipeBook;
  works: WorkStatusRow[];
  variations: EstimateVariations;
  materialItems: MaterialItemRow[];
  mixRows: MixRow[];
}) {
  const { estimate, book, works, variations, materialItems, mixRows } = input;
  const isDraft = estimate.status === "draft";

  const materialsById = new Map<string, MaterialDef>(
    applyRateOverrides(
      [...book.materials, ...variations.extraMaterials],
      variations.rateByMaterialId,
    ).map((m) => [m.id, m]),
  );
  const mixesById = new Map<string, MixDef>(book.mixes.map((m) => [m.id, m]));
  // Keyed by row: a work may sit on the estimate more than once, each row with its own list and labour (0157).
  const recipesByLine: Map<string, WorkRecipe> = lineRecipes(
    book.recipes,
    estimate.lines.map((line) => ({ id: line.id, workItemId: line.workItemId })),
    variations.componentsByLine,
    variations.labourRateByLine,
    variations.addsByLine,
  );

  const lineInputs = estimate.lines.map((line) => ({
    workItemId: line.workItemId,
    qty: line.qty,
    key: line.id,
  }));

  let lineCosts: LineCost[];
  let takeoffRows: TakeoffRow[];
  const uomByWork = new Map<string, string | null>();
  const unitRateByLine = new Map<string, number | null>();

  if (isDraft || !estimate.frozen) {
    lineCosts = lineInputs.map((line) => ({
      ...computeLine(line, recipesByLine.get(line.key), mixesById, materialsById),
      lineId: line.key,
    }));
    takeoffRows = computeTakeoff(lineInputs, recipesByLine, mixesById, materialsById).map((row) => {
      const material = materialsById.get(row.materialId);
      return {
        materialId: row.materialId,
        name: material?.name ?? "Unknown material",
        uom: material?.uom ?? "",
        quantity: row.quantity,
        cost: row.cost,
        missingRate: row.missingRate,
      };
    });
    for (const work of works) uomByWork.set(work.workItemId, work.uom);
    for (const line of estimate.lines) {
      unitRateByLine.set(
        line.id,
        rateBuildUp(recipesByLine.get(line.id), mixesById, materialsById)?.rate ?? null,
      );
    }
  } else {
    lineCosts = frozenLineCosts(estimate.frozen.lineCosts, estimate.frozen.takeoff);
    takeoffRows = aggregateFrozenTakeoff(estimate.frozen.takeoff);
    for (const row of estimate.frozen.lineCosts) {
      uomByWork.set(row.workItemId, row.uom);
      // The arithmetic is linear, so total ÷ quantity is exactly the frozen per-unit rate.
      if (row.lineId) {
        unitRateByLine.set(
          row.lineId,
          row.totalCost === null || row.qty === 0 ? null : row.totalCost / row.qty,
        );
      }
    }
  }
  takeoffRows.sort((a, b) => a.name.localeCompare(b.name));

  const totals = computeEstimateTotals(lineCosts);
  const other = otherCostsTotal(estimate.otherCosts);
  const categoryByWork = new Map(
    works.map((work) => [work.workItemId, { code: work.categoryCode, name: work.categoryName }]),
  );
  const categoryOrder = [...new Set(works.map((work) => work.categoryCode))];

  // What Masters says before this villa's overrides: the placeholder in each price box.
  const standardRateById = new Map(
    [...book.materials, ...variations.extraMaterials].map((m) => [m.id, m.rate]),
  );

  const componentView = (component: {
    materialId: string | null;
    mixId: string | null;
    qtyPerUnit: number;
  }): RateComponentView => {
    if (component.mixId) {
      const mix = mixesById.get(component.mixId);
      return {
        ref: `mix:${component.mixId}`,
        kind: "mix",
        name: mix?.name ?? "Unknown mix",
        uom: mix?.uom ?? "",
        qtyPerUnit: component.qtyPerUnit,
      };
    }
    const def = component.materialId ? materialsById.get(component.materialId) : undefined;
    return {
      ref: `material:${component.materialId ?? ""}`,
      kind: "material",
      name: def?.name ?? "Unknown material",
      uom: def?.uom ?? "",
      qtyPerUnit: component.qtyPerUnit,
    };
  };

  const rateViewFor = (line: EstimateDetail["lines"][number], uom: string | null): LineRateView => {
    const standard = book.recipes.find((recipe) => recipe.workItemId === line.workItemId);
    const own = variations.byLine.get(line.id);
    // Not the villa's own: the list in use, the model's folded in by getEstimateVariations.
    const fromModel =
      !own && (variations.componentsByLine.has(line.id) || variations.addsByLine.has(line.id));
    const inUse = recipesByLine.get(line.id)?.components;
    const buildUp = rateBuildUp(recipesByLine.get(line.id), mixesById, materialsById);
    return {
      lineId: line.id,
      workItemId: line.workItemId,
      workName: line.label ? `${line.name} — ${line.label}` : line.name,
      workUom: uom,
      own: own !== undefined,
      fromModel,
      labour: {
        villa: line.labourRate,
        rateBook: standard?.labourRate ?? null,
        inUse: buildUp?.labourRate ?? null,
      },
      components: own
        ? own.map((row) =>
            componentView({ materialId: row.itemId, mixId: row.mixId, qtyPerUnit: row.qtyPerUnit }),
          )
        : ((fromModel ? inUse : undefined) ?? standard?.components ?? []).map(componentView),
      prices: (buildUp?.materials ?? []).map((row) => {
        const def = materialsById.get(row.materialId);
        return {
          itemId: row.materialId,
          name: def?.name ?? "Unknown material",
          uom: def?.uom ?? "",
          qtyPerUnit: row.qtyPerUnit,
          mastersPrice: standardRateById.get(row.materialId) ?? null,
          villaPrice: variations.rateByMaterialId.get(row.materialId) ?? null,
          cost: row.cost,
        };
      }),
      rate: buildUp?.rate ?? null,
    };
  };

  return {
    isDraft,
    villaName: estimate.unitName ?? "this villa",
    olderDraft: isDraft && !estimate.isWorking,
    totals,
    other,
    grand: grandTotal(totals, other),
    missing: missingParts(totals, other.unpriced),
    boq: groupLineCosts(lineCosts, categoryByWork, categoryOrder),
    lineById: new Map(estimate.lines.map((line) => [line.id, line])),
    /** How many rows each work has: a frozen work with several keeps its materials per work, not per row. */
    rowsByWork: estimate.lines.reduce(
      (counts, line) => counts.set(line.workItemId, (counts.get(line.workItemId) ?? 0) + 1),
      new Map<string, number>(),
    ),
    takeoffRows,
    uomByWork,
    unitRateByLine,
    standardRateById,
    rateOptions: {
      materials: materialItems
        .filter((material) => material.isActive)
        .map(({ id, name, uom, rate }) => ({ id, name, uom, rate })),
      mixes: mixRows.filter((mix) => mix.isActive).map(({ id, name, uom }) => ({ id, name, uom })),
    },
    rateViewFor,
    frozenLineById: new Map(
      (estimate.frozen?.lineCosts ?? []).flatMap((row) => (row.lineId ? [[row.lineId, row]] : [])),
    ),
    frozenNameById: new Map(
      (estimate.frozen?.takeoff ?? []).map((row) => [
        row.materialId,
        { name: row.materialName, uom: row.uom },
      ]),
    ),
    pickableWorks: works
      .filter((work) => work.isActive)
      .map((work) => ({
        workItemId: work.workItemId,
        code: work.code,
        name: work.name,
        groupName: work.groupName,
        categoryCode: work.categoryCode,
        categoryName: work.categoryName,
        uom: work.uom,
      })),
  };
}

export type EstimateView = ReturnType<typeof buildEstimateView>;

/** Only an official estimate is withdrawn (0144), and only once no live indent draws on it. */
export function officialRemoval(
  status: EstimateDetail["status"],
  drawingIndentRefs: readonly string[],
): { kind: "cancel" } | { kind: "blocked"; why: string } | null {
  if (status !== "submitted") return null;
  if (drawingIndentRefs.length === 0) return { kind: "cancel" };
  const one = drawingIndentRefs.length === 1;
  return {
    kind: "blocked",
    why: `${joinInWords(drawingIndentRefs)} ${one ? "draws" : "draw"} on it — cancel ${one ? "that indent" : "those indents"} first.`,
  };
}
