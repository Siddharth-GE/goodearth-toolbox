/**
 * Issued-vs-estimated — the pure arithmetic, no database.
 *
 * The official estimate froze what each WORK needs of each ITEM (0077,
 * item-keyed since 0086) in the item's own unit; store issues and
 * direct-to-site deliveries carry the work they served (0080/0081) and
 * move in that same unit. So the two line up on (work, item) with nothing
 * to convert — one unit language is the point of materials being items.
 *
 * A row frozen before 0086 names a retired material and no item. It is
 * shown with its estimated figure but never compared: there is nothing to
 * match it to without the retired list, and a guessed match is worse than
 * an honest gap.
 */

export type CompareTakeoffRow = {
  workItemId: string;
  /** The item the frozen row names; null on a row frozen before 0086. */
  itemId: string | null;
  materialName: string;
  /** The item's unit on the day of submit — what `estimated` is in. */
  uom: string;
  quantity: number;
};

export type IssuedLine = {
  /** The work the issue was tagged with; null on pre-0080 issues. */
  workItemId: string | null;
  itemId: string;
  /** In the item's unit — how stock moves. */
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
  /** More has reached the villa for this work than the estimate allows. */
  over: boolean;
};

export type Comparison = {
  rows: ComparisonRow[];
  /** Arrived at the plot but not attributable to a takeoff (work, item)
   * pair: untagged history, retired works, or items the estimate never
   * named. Reported per (work, item) — the work is kept because each of
   * these is a reconciliation entry the estimator must approve (0083),
   * and "cement outside the plan for PSC slab" is a different entry from
   * the same cement untagged. Nothing disappears. */
  unmatched: { workItemId: string | null; itemId: string; quantity: number }[];
};

export function compareIssuesToEstimate(
  takeoff: CompareTakeoffRow[],
  issued: IssuedLine[],
): Comparison {
  // Sum issued per (work, item); the null-work bucket keys as "".
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

  // An item the estimate names under SOME work still lands here when
  // issued untagged or for another work — the quantity must show
  // somewhere, or the comparison quietly under-reports. The map is
  // already summed per (work, item), so unmatched keys pass through.
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
