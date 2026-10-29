/** The setup Goodearth QS for SketchUp loads (estimator/PLAN.md decision 12): the works it tags by, the mixes it paints, and the rates and
 * make-ups its Estimate button prices with, so the plugin follows the rate book. It carries money, so only /estimator downloads it.
 * Standard rates only: a villa's own labour rates and materials stay in the toolbox. This file is the contract; the plugin reads it as is. */

export const SETUP_FORMAT = "goodearth-qs-setup";
export const SETUP_VERSION = 1;

/** A material in a make-up: an item by its Masters code (its name when it has none), or a mix by name. Qty is per one unit of the parent. */
export type SetupMaterial = { item: string; qty: number } | { mix: string; qty: number };

export type SetupWork = {
  code: string;
  name: string;
  /** Null: the rate book has not set the work up, so the model lists it to measure by hand. */
  uom: string | null;
  /** Null: from the unit. */
  measure: string | null;
  category: string;
  category_name: string;
  group: string | null;
  group_name: string | null;
  /** Rupees per unit; null is unpriced, never zero. */
  labour_rate: number | null;
  materials: SetupMaterial[];
};

export type SetupMix = {
  name: string;
  uom: string;
  group: string | null;
  /** False only for a switched-off mix a work's recipe still names. */
  active: boolean;
  materials: SetupMaterial[];
};

export type SetupItem = { code: string | null; name: string; uom: string; price: number | null };

export type SketchupSetup = {
  format: typeof SETUP_FORMAT;
  version: typeof SETUP_VERSION;
  exported_at: string;
  /** The toolbox it came from, for SketchUp's Toolbox address. */
  toolbox: string;
  summary: { works: number; mixes: number; items: number; priced_works: number };
  works: SetupWork[];
  mixes: SetupMix[];
  items: SetupItem[];
};

export type SetupSource = {
  works: {
    workItemId: string;
    code: string;
    name: string;
    isActive: boolean;
    uom: string | null;
    modelMeasure: string | null;
    categoryCode: string;
    categoryName: string;
    groupCode: string | null;
    groupName: string | null;
  }[];
  labourRates: Map<string, number | null>;
  workComponents: Map<
    string,
    { itemId: string | null; mixId: string | null; qtyPerUnit: number }[]
  >;
  mixes: { id: string; name: string; uom: string; groupName: string | null; isActive: boolean }[];
  mixComponents: Map<string, { itemId: string; qtyPerUnit: number }[]>;
  items: Map<string, { code: string | null; name: string; uom: string; price: number | null }>;
};

/** Numbers from PostgREST's numeric arrive as strings; a blank or unreadable one is unpriced. */
const num = (value: unknown): number | null => {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

export function buildSetup(
  source: SetupSource,
  exportedAt: string,
  toolbox: string,
): SketchupSetup {
  const mixById = new Map(source.mixes.map((mix) => [mix.id, mix]));
  const usedItems = new Set<string>();
  const usedMixes = new Set<string>();

  const itemRef = (itemId: string, qty: number): SetupMaterial | null => {
    const item = source.items.get(itemId);
    if (!item) return null;
    usedItems.add(itemId);
    return { item: item.code ?? item.name, qty };
  };

  const works: SetupWork[] = source.works
    .filter((work) => work.isActive)
    .map((work) => ({
      code: work.code,
      name: work.name,
      uom: work.uom,
      measure: work.modelMeasure,
      category: work.categoryCode,
      category_name: work.categoryName,
      group: work.groupCode,
      group_name: work.groupName,
      labour_rate: num(source.labourRates.get(work.workItemId)),
      materials: (source.workComponents.get(work.workItemId) ?? []).flatMap((part) => {
        const qty = num(part.qtyPerUnit);
        if (qty === null) return [];
        if (part.mixId) {
          const mix = mixById.get(part.mixId);
          if (!mix) return [];
          usedMixes.add(mix.id);
          return [{ mix: mix.name, qty }];
        }
        const ref = part.itemId ? itemRef(part.itemId, qty) : null;
        return ref ? [ref] : [];
      }),
    }));

  const mixes: SetupMix[] = source.mixes
    .filter((mix) => mix.isActive || usedMixes.has(mix.id))
    .map((mix) => ({
      name: mix.name,
      uom: mix.uom,
      group: mix.groupName,
      active: mix.isActive,
      materials: (source.mixComponents.get(mix.id) ?? []).flatMap((part) => {
        const qty = num(part.qtyPerUnit);
        const ref = qty === null ? null : itemRef(part.itemId, qty);
        return ref ? [ref] : [];
      }),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const items: SetupItem[] = [...usedItems]
    .map((id) => source.items.get(id)!)
    .map((item) => ({ code: item.code, name: item.name, uom: item.uom, price: num(item.price) }))
    .sort((a, b) => (a.code ?? a.name).localeCompare(b.code ?? b.name));

  return {
    format: SETUP_FORMAT,
    version: SETUP_VERSION,
    exported_at: exportedAt,
    toolbox,
    summary: {
      works: works.length,
      mixes: mixes.length,
      items: items.length,
      priced_works: works.filter((work) => work.uom && work.labour_rate !== null).length,
    },
    works,
    mixes,
    items,
  };
}
