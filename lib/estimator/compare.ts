/**
 * Issued-vs-estimated — the pure arithmetic, no database.
 *
 * The official estimate froze what each WORK needs of each MATERIAL
 * (0077, per (work, material)); store issues carry the work they served
 * (0080) and lines in the ITEM's unit. This module lines the two up:
 * item quantities come back into the material's unit through the 0076
 * factor (one material-uom = factor × item-uom), matching unit labels
 * convert 1:1 ('nos' and 'each' are one unit), and with neither the
 * issued figure is reported raw rather than guessed — the same
 * no-silent-conversion rule as lib/estimator/link.ts and
 * lib/indents/pull-rules.ts, restated because pure modules import
 * nothing.
 *
 * Phase 2's over-issue warning is THIS arithmetic — the flag rows are
 * already here.
 */

export type CompareTakeoffRow = {
  workItemId: string;
  materialId: string;
  materialName: string;
  /** The material's own unit — what `estimated` is measured in. */
  uom: string;
  quantity: number;
};

export type MaterialLink = {
  materialId: string;
  itemId: string;
  itemUom: string;
  /** One material-uom = factor × item-uom; null = none entered. */
  factor: number | null;
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
  materialId: string;
  materialName: string;
  uom: string;
  estimated: number;
  /** In the material's unit; null when no conversion is known. */
  issued: number | null;
  /** The raw issued figure when it could not be converted. */
  issuedRaw: { quantity: number; uom: string } | null;
  /** More has been issued for this work than the estimate allows. */
  over: boolean;
};

export type Comparison = {
  rows: ComparisonRow[];
  /** Issued to the plot but not attributable to a takeoff (work, material)
   * pair: untagged history, retired works, or items the estimate never
   * named. Reported per (work, item) — the work is kept because each of
   * these is a reconciliation entry the estimator must approve (0083),
   * and "cement outside the plan for PSC slab" is a different entry
   * from the same cement untagged. Nothing disappears. */
  unmatched: { workItemId: string | null; itemId: string; quantity: number }[];
};

const canon = (u: string) => {
  const t = u.trim().toLowerCase();
  return t === "nos" ? "each" : t;
};

export function compareIssuesToEstimate(
  takeoff: CompareTakeoffRow[],
  links: MaterialLink[],
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
    const link = links.find((l) => l.materialId === need.materialId);
    const key = link ? `${need.workItemId} ${link.itemId}` : null;
    const rawQty = key ? (issuedByWorkItem.get(key) ?? 0) : 0;
    if (key && issuedByWorkItem.has(key)) matchedKeys.add(key);

    let issuedQty: number | null = null;
    if (rawQty === 0) issuedQty = 0;
    else if (link) {
      if (link.factor !== null && link.factor > 0) issuedQty = rawQty / link.factor;
      else if (canon(need.uom) === canon(link.itemUom)) issuedQty = rawQty;
    }

    return {
      workItemId: need.workItemId,
      materialId: need.materialId,
      materialName: need.materialName,
      uom: need.uom,
      estimated: need.quantity,
      issued: issuedQty,
      issuedRaw: issuedQty === null && link ? { quantity: rawQty, uom: link.itemUom } : null,
      // The raw figure can also prove an overrun when the units match up;
      // an unconvertible figure never flags — a guess is worse than a gap.
      over: issuedQty !== null && issuedQty > need.quantity,
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
