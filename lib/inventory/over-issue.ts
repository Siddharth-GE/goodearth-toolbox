/**
 * Has this work drawn past its official estimate? The pure arithmetic,
 * no database — Phase 2 Step I: flag, never refuse. The write always
 * completes; this only decides what the amber banner on the issue note
 * says.
 *
 * The estimate's frozen figures arrive in the MATERIAL's unit with the
 * live material→item link and factor (estimate_takeoff_facts, which
 * admits /inventory since 0078); movements are in the ITEM's unit. The
 * house conversion rule, restated verbatim because pure modules import
 * nothing (the same rule as lib/estimator/compare.ts and
 * lib/supervisors/site-materials.ts): divide by the factor when one is
 * entered, convert 1:1 when the unit labels match ('nos' and 'each'
 * are one unit), and otherwise never flag — a guess is worse than a
 * gap.
 */

export type WorkTakeoffRow = {
  materialName: string;
  /** The material's own unit — what `quantity` is measured in. */
  uom: string;
  quantity: number;
  itemId: string | null;
  /** One material-uom = factor × item-uom; null = none entered. */
  itemUomFactor: number | null;
};

export type OverIssueRow = {
  materialName: string;
  uom: string;
  estimated: number;
  /** Cumulative drawn for this work, in the material's unit. */
  drawn: number;
};

const canon = (u: string) => {
  const t = u.trim().toLowerCase();
  return t === "nos" ? "each" : t;
};

/**
 * @param takeoff  the estimate's rows for ONE work
 * @param drawnByItem  cumulative quantity drawn for that work per item
 *                     id, in the item's unit — this issue included
 * @param itemUomById  items.default_uom by item id
 */
export function findOverIssues(
  takeoff: WorkTakeoffRow[],
  drawnByItem: Map<string, number>,
  itemUomById: Map<string, string>,
): OverIssueRow[] {
  const over: OverIssueRow[] = [];
  for (const need of takeoff) {
    if (!need.itemId) continue;
    const raw = drawnByItem.get(need.itemId) ?? 0;
    if (raw === 0) continue;

    let drawn: number | null = null;
    if (need.itemUomFactor !== null && need.itemUomFactor > 0) drawn = raw / need.itemUomFactor;
    else {
      const itemUom = itemUomById.get(need.itemId);
      if (itemUom && canon(need.uom) === canon(itemUom)) drawn = raw;
    }

    if (drawn !== null && drawn > need.quantity) {
      over.push({
        materialName: need.materialName,
        uom: need.uom,
        estimated: need.quantity,
        drawn,
      });
    }
  }
  return over;
}
