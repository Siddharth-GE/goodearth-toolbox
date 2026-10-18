/**
 * Has this work drawn past its estimate? Flag, never refuse. Takeoff is in the material's unit, movements
 * in the item's: divide by the factor if entered, 1:1 if unit labels match, else never flag.
 */

export type WorkTakeoffRow = {
  materialName: string;
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
  drawn: number;
};

const canon = (u: string) => {
  const t = u.trim().toLowerCase();
  return t === "nos" ? "each" : t;
};

// drawnByItem: cumulative per item in the item's unit, this issue included.
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
