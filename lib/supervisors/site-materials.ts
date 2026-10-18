/** What each work has drawn against the estimate, pure. The frozen takeoff is in the MATERIAL's unit, movements in the ITEM's.
 * House conversion rule (restated because pure modules import nothing): divide by the factor when entered, 1:1 when unit labels match,
 * otherwise report the raw figure, since a wrong number is worse than a labelled one. Mirrors the Estimator's compare.ts; tools never import each other. */

export type SiteTakeoffRow = {
  workItemId: string;
  materialId: string | null;
  materialName: string;
  uom: string;
  quantity: number;
  itemId: string | null;
  /** One material-uom = factor × item-uom; null = none entered (0076). */
  itemUomFactor: number | null;
};

export type SiteIssuedLine = {
  workItemId: string | null;
  itemId: string;
  quantity: number;
};

export type SiteMaterialRow = {
  workItemId: string;
  materialName: string;
  uom: string;
  estimated: number;
  issued: number | null;
  issuedRaw: { quantity: number; uom: string } | null;
  over: boolean;
};

export type SiteMaterials = {
  rows: SiteMaterialRow[];
  /** Arrived at the plot but not attributable to a takeoff (work, material) pair. Per (work, item); nothing disappears. */
  unplanned: { workItemId: string | null; itemId: string; quantity: number }[];
};

const canon = (u: string) => {
  const t = u.trim().toLowerCase();
  return t === "nos" ? "each" : t;
};

export function groupSiteMaterials(
  takeoff: SiteTakeoffRow[],
  issued: SiteIssuedLine[],
  itemUomById: Map<string, string>,
): SiteMaterials {
  const issuedByWorkItem = new Map<string, number>();
  for (const line of issued) {
    const key = `${line.workItemId ?? ""} ${line.itemId}`;
    issuedByWorkItem.set(key, (issuedByWorkItem.get(key) ?? 0) + line.quantity);
  }

  const matchedKeys = new Set<string>();
  const rows: SiteMaterialRow[] = takeoff.map((need) => {
    const key = need.itemId ? `${need.workItemId} ${need.itemId}` : null;
    const rawQty = key ? (issuedByWorkItem.get(key) ?? 0) : 0;
    if (key && issuedByWorkItem.has(key)) matchedKeys.add(key);

    const itemUom = need.itemId ? (itemUomById.get(need.itemId) ?? "") : "";
    let issuedQty: number | null = null;
    if (rawQty === 0) issuedQty = 0;
    else if (need.itemUomFactor !== null && need.itemUomFactor > 0) {
      issuedQty = rawQty / need.itemUomFactor;
    } else if (itemUom && canon(need.uom) === canon(itemUom)) {
      issuedQty = rawQty;
    }

    return {
      workItemId: need.workItemId,
      materialName: need.materialName,
      uom: need.uom,
      estimated: need.quantity,
      issued: issuedQty,
      issuedRaw:
        issuedQty === null && need.itemId ? { quantity: rawQty, uom: itemUom || "?" } : null,
      over: issuedQty !== null && issuedQty > need.quantity,
    };
  });

  const unplanned = [...issuedByWorkItem]
    .filter(([key]) => !matchedKeys.has(key))
    .map(([key, quantity]) => {
      const split = key.indexOf(" ");
      return {
        workItemId: split === 0 ? null : key.slice(0, split),
        itemId: key.slice(split + 1),
        quantity,
      };
    });

  return { rows, unplanned };
}
