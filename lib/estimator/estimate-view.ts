/**
 * What the estimate page shows, worked out in one pure place: costs, the
 * materials take-off, each line's rate build-up and what is still missing.
 * A working estimate computes live from today's rates (0098); an official one
 * renders its frozen snapshot through the same grouping. This villa's
 * variations (0087, 0088) are laid over the rate book before any arithmetic.
 */
import {
  aggregateFrozenTakeoff,
  applyEstimateOverrides,
  applyRateOverrides,
  computeEstimateTotals,
  computeLine,
  computeTakeoff,
  frozenLineCosts,
  groupLineCosts,
  rateBuildUp,
  type LineCost,
  type MaterialDef,
  type MixDef,
  type WorkRecipe,
} from "./calc";
import type { EstimateDetail, EstimateVariations, RecipeBook } from "./estimate-queries";
import type { MixRow } from "./mixes-queries";
import type { MaterialItemRow } from "./shared";
import type { WorkStatusRow } from "./works-queries";

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
  labour: { villa: number | null; rateBook: number | null; inUse: number | null };
  components: RateComponentView[];
  prices: {
    itemId: string;
    name: string;
    uom: string;
    qtyPerUnit: number;
    mastersPrice: number | null;
    villaPrice: number | null;
    cost: number | null;
  }[];
  rate: number | null;
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

/** The warning under the total, or none when everything is priced. */
export function missingParts(totals: Totals): string[] {
  const parts = [
    totals.toMeasureCount > 0 &&
      `${totals.toMeasureCount} ${totals.toMeasureCount === 1 ? "work is" : "works are"} still to measure`,
    totals.notSetUpCount > 0 &&
      `${totals.notSetUpCount} ${totals.notSetUpCount === 1 ? "work has" : "works have"} no setup`,
    totals.missingLabourCount > 0 &&
      `${totals.missingLabourCount} ${totals.missingLabourCount === 1 ? "work has" : "works have"} no labour rate`,
    totals.missingMaterialRateCount > 0 &&
      `${totals.missingMaterialRateCount} ${totals.missingMaterialRateCount === 1 ? "work uses a material" : "works use materials"} with no rate`,
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
  const recipesByWork = new Map<string, WorkRecipe>(
    applyEstimateOverrides(book.recipes, variations.byWork, variations.labourRateByWork).map(
      (recipe) => [recipe.workItemId, recipe],
    ),
  );

  const lineInputs = estimate.lines.map((line) => ({ workItemId: line.workItemId, qty: line.qty }));

  let lineCosts: LineCost[];
  let takeoffRows: TakeoffRow[];
  const uomByWork = new Map<string, string | null>();
  const unitRateByWork = new Map<string, number | null>();

  if (isDraft || !estimate.frozen) {
    lineCosts = lineInputs.map((line) =>
      computeLine(line, recipesByWork.get(line.workItemId), mixesById, materialsById),
    );
    takeoffRows = computeTakeoff(lineInputs, recipesByWork, mixesById, materialsById).map((row) => {
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
      unitRateByWork.set(
        line.workItemId,
        rateBuildUp(recipesByWork.get(line.workItemId), mixesById, materialsById)?.rate ?? null,
      );
    }
  } else {
    lineCosts = frozenLineCosts(estimate.frozen.lineCosts, estimate.frozen.takeoff);
    takeoffRows = aggregateFrozenTakeoff(estimate.frozen.takeoff);
    for (const row of estimate.frozen.lineCosts) {
      uomByWork.set(row.workItemId, row.uom);
      // The arithmetic is linear, so total ÷ quantity is exactly the frozen per-unit rate.
      unitRateByWork.set(
        row.workItemId,
        row.totalCost === null || row.qty === 0 ? null : row.totalCost / row.qty,
      );
    }
  }
  takeoffRows.sort((a, b) => a.name.localeCompare(b.name));

  const totals = computeEstimateTotals(lineCosts);
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
    const buildUp = rateBuildUp(recipesByWork.get(line.workItemId), mixesById, materialsById);
    return {
      lineId: line.id,
      workItemId: line.workItemId,
      workName: line.name,
      workUom: uom,
      own: own !== undefined,
      labour: {
        villa: line.labourRate,
        rateBook: standard?.labourRate ?? null,
        inUse: buildUp?.labourRate ?? null,
      },
      components: own
        ? own.map((row) =>
            componentView({ materialId: row.itemId, mixId: row.mixId, qtyPerUnit: row.qtyPerUnit }),
          )
        : (standard?.components ?? []).map(componentView),
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
    missing: missingParts(totals),
    boq: groupLineCosts(lineCosts, categoryByWork, categoryOrder),
    lineByWork: new Map(estimate.lines.map((line) => [line.workItemId, line])),
    takeoffRows,
    uomByWork,
    unitRateByWork,
    standardRateById,
    rateOptions: {
      materials: materialItems
        .filter((material) => material.isActive)
        .map(({ id, name, uom, rate }) => ({ id, name, uom, rate })),
      mixes: mixRows.filter((mix) => mix.isActive).map(({ id, name, uom }) => ({ id, name, uom })),
    },
    rateViewFor,
    frozenLineByWork: new Map(
      (estimate.frozen?.lineCosts ?? []).map((row) => [row.workItemId, row]),
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
