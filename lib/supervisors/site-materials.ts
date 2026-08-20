/**
 * What each work has drawn against what the estimate allows — the pure
 * arithmetic, no database.
 *
 * The official estimate's frozen takeoff arrives through
 * estimate_takeoff_facts in the MATERIAL's unit, with the live
 * material→item link and factor riding along (0076: one material-uom =
 * factor × item-uom). Store issues and direct-to-site deliveries move
 * in the ITEM's unit. Lining them up follows the house conversion rule,
 * restated verbatim because pure modules import nothing (the same rule
 * as lib/estimator/link.ts, lib/estimator/compare.ts and
 * lib/indents/pull-rules.ts): divide by the factor when one is entered,
 * convert 1:1 when the unit labels match ('nos' and 'each' are one
 * unit), and otherwise report the raw figure rather than guess — a
 * wrong number is worse than a labelled one.
 *
 * The Estimator owns the sibling arithmetic (compare.ts) for its
 * comparison tab; this module exists because one tool never imports
 * another tool's code.
 */

export type SiteTakeoffRow = {
  workItemId: string;
  materialId: string;
  materialName: string;
  /** The material's own unit — what `quantity` is measured in. */
  uom: string;
  quantity: number;
  /** The catalogue item the material is bought as; null = unlinked. */
  itemId: string | null;
  /** One material-uom = factor × item-uom; null = none entered. */
  itemUomFactor: number | null;
};

export type SiteIssuedLine = {
  /** The work the movement was tagged with; null on pre-0080 history. */
  workItemId: string | null;
  itemId: string;
  /** In the item's unit — how stock moves. */
  quantity: number;
};

export type SiteMaterialRow = {
  workItemId: string;
  materialName: string;
  uom: string;
  estimated: number;
  /** In the material's unit; null when no conversion is known. */
  issued: number | null;
  /** The raw issued figure when it could not be converted. */
  issuedRaw: { quantity: number; uom: string } | null;
  /** The site has drawn more for this work than the estimate allows. */
  over: boolean;
};

export type SiteMaterials = {
  rows: SiteMaterialRow[];
  /** Arrived at the plot but not attributable to a takeoff
   * (work, material) pair: untagged history, another work, or an item
   * the estimate never named. Per (work, item) — nothing disappears. */
  unplanned: { workItemId: string | null; itemId: string; quantity: number }[];
};

const canon = (u: string) => {
  const t = u.trim().toLowerCase();
  return t === "nos" ? "each" : t;
};

export function groupSiteMaterials(
  takeoff: SiteTakeoffRow[],
  issued: SiteIssuedLine[],
  /** items.default_uom by item id — labels the raw figure. */
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
