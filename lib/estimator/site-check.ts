/**
 * The Site check list — pure, import-free, tested.
 *
 * Every villa's official estimate has already been lined up against what
 * reached the villa (compare.ts). This turns those comparisons into the
 * one list the founder asked for — what needs a look, across every villa
 * — and into "where does all the cement go": each material, estimated
 * against reached, across the whole project.
 */

type ComparedRow = {
  workItemId: string;
  itemId: string | null;
  materialName: string;
  uom: string;
  estimated: number;
  issued: number | null;
  over: boolean;
};

type Official = {
  estimateId: string;
  unitId: string;
  comparison: {
    rows: ComparedRow[];
    unmatched: { workItemId: string | null; itemId: string; quantity: number }[];
  };
};

export type SiteCheckEntry = {
  estimateId: string;
  unitId: string;
  workItemId: string | null;
  itemId: string;
  /** Frozen on the estimate for an over-run; null for an outside entry
   * (the screen names it from the item). */
  materialName: string | null;
  uom: string | null;
  /** What the estimate allowed; null when it never planned it. */
  estimated: number | null;
  reached: number;
  kind: "over" | "outside";
};

/** Everything that needs a look: over-runs past the estimate, and
 * arrivals the estimate never planned. */
export function siteCheckEntries(officials: Official[]): SiteCheckEntry[] {
  const entries: SiteCheckEntry[] = [];
  for (const official of officials) {
    for (const row of official.comparison.rows) {
      if (!row.over || row.itemId === null || row.issued === null) continue;
      entries.push({
        estimateId: official.estimateId,
        unitId: official.unitId,
        workItemId: row.workItemId,
        itemId: row.itemId,
        materialName: row.materialName,
        uom: row.uom,
        estimated: row.estimated,
        reached: row.issued,
        kind: "over",
      });
    }
    for (const row of official.comparison.unmatched) {
      entries.push({
        estimateId: official.estimateId,
        unitId: official.unitId,
        workItemId: row.workItemId,
        itemId: row.itemId,
        materialName: null,
        uom: null,
        estimated: null,
        reached: row.quantity,
        kind: "outside",
      });
    }
  }
  return entries;
}

export type MaterialTotal = {
  itemId: string;
  /** From the estimates' frozen rows; null when only arrivals name it. */
  name: string | null;
  uom: string | null;
  estimated: number;
  /** Everything that reached the villas — planned or not. */
  reached: number;
  /** How many villas' official estimates plan it. */
  villas: number;
};

/**
 * "Where does all the cement go": per material, what the official
 * estimates allow in total and what has reached the villas in total —
 * planned arrivals and unplanned ones alike, because both are cement on
 * site. `unitId` narrows it to one villa's figures.
 */
export function materialTotals(officials: Official[], unitId?: string): MaterialTotal[] {
  const totals = new Map<string, MaterialTotal & { villaSet: Set<string> }>();
  const entry = (itemId: string) => {
    const existing = totals.get(itemId);
    if (existing) return existing;
    const created = {
      itemId,
      name: null,
      uom: null,
      estimated: 0,
      reached: 0,
      villas: 0,
      villaSet: new Set<string>(),
    };
    totals.set(itemId, created);
    return created;
  };

  for (const official of officials) {
    if (unitId && official.unitId !== unitId) continue;
    for (const row of official.comparison.rows) {
      if (row.itemId === null) continue;
      const total = entry(row.itemId);
      total.name ??= row.materialName;
      total.uom ??= row.uom;
      total.estimated += row.estimated;
      total.reached += row.issued ?? 0;
      total.villaSet.add(official.unitId);
    }
    for (const row of official.comparison.unmatched) {
      entry(row.itemId).reached += row.quantity;
    }
  }

  return [...totals.values()].map(({ villaSet, ...total }) => ({
    ...total,
    villas: villaSet.size,
  }));
}

/** Reached as a share of estimated; null when nothing was estimated. */
export function drawnPercent(estimated: number, reached: number): number | null {
  return estimated > 0 ? (reached / estimated) * 100 : null;
}
