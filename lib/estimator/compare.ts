/** Issued-vs-estimated, pure. Frozen takeoffs (0077) and issues (0080/0081) are both in the item's own unit, so they line up on (work, item) with no conversion.
 * A row frozen before 0086 names no item: shown with its estimate but never compared, since a guessed match is worse than a gap. */

export type CompareTakeoffRow = {
  workItemId: string;
  itemId: string | null;
  materialName: string;
  uom: string;
  quantity: number;
};

export type IssuedLine = {
  workItemId: string | null;
  itemId: string;
  quantity: number;
};

export type ComparisonRow = {
  workItemId: string;
  itemId: string | null;
  materialName: string;
  uom: string;
  estimated: number;
  /** Null on an older row, which is not compared. */
  issued: number | null;
  over: boolean;
};

export type Comparison = {
  rows: ComparisonRow[];
  /** Arrived at the plot but not attributable to a takeoff (work, item) pair. Kept per work because each is a reconciliation entry the estimator approves (0083). */
  unmatched: { workItemId: string | null; itemId: string; quantity: number }[];
};

export function compareIssuesToEstimate(
  takeoff: CompareTakeoffRow[],
  issued: IssuedLine[],
): Comparison {
  // The null-work bucket keys as "".
  const issuedByWorkItem = new Map<string, number>();
  for (const line of issued) {
    const key = `${line.workItemId ?? ""} ${line.itemId}`;
    issuedByWorkItem.set(key, (issuedByWorkItem.get(key) ?? 0) + line.quantity);
  }

  const matchedKeys = new Set<string>();
  const rows: ComparisonRow[] = takeoff.map((need) => {
    if (need.itemId === null) {
      return {
        workItemId: need.workItemId,
        itemId: null,
        materialName: need.materialName,
        uom: need.uom,
        estimated: need.quantity,
        issued: null,
        over: false,
      };
    }
    const key = `${need.workItemId} ${need.itemId}`;
    if (issuedByWorkItem.has(key)) matchedKeys.add(key);
    const issuedQty = issuedByWorkItem.get(key) ?? 0;
    return {
      workItemId: need.workItemId,
      itemId: need.itemId,
      materialName: need.materialName,
      uom: need.uom,
      estimated: need.quantity,
      issued: issuedQty,
      over: issuedQty > need.quantity,
    };
  });

  // An item the estimate names under SOME work still lands here when issued untagged or for another work, so the quantity always shows.
  const unmatched = [...issuedByWorkItem]
    .filter(([key]) => !matchedKeys.has(key))
    .map(([key, quantity]) => {
      const split = key.indexOf(" ");
      return {
        workItemId: split === 0 ? null : key.slice(0, split),
        itemId: key.slice(split + 1),
        quantity,
      };
    });

  return { rows, unmatched };
}
