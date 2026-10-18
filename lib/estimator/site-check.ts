/** The Site check list: pure, import-free, tested. Turns the compare.ts comparisons into what needs a look, per villa and per material. */

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
  /** Frozen on the estimate for an over-run; null for an outside entry (the screen names it from the item). */
  materialName: string | null;
  uom: string | null;
  estimated: number | null;
  reached: number;
  kind: "over" | "outside";
};

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
  name: string | null;
  uom: string | null;
  estimated: number;
  reached: number;
  villas: number;
};

/** Per material: what the official estimates allow vs what reached the villas, planned and unplanned alike. `unitId` narrows to one villa. */
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

export type VillaSummary = {
  estimateId: string;
  unitId: string;
  over: number;
  waiting: number;
  /** Arrived outside the estimate and approved — flagged forever (0083). */
  approved: number;
};

/** The front list: one row per official estimate. Villas waiting for an approval first, then those past their estimate, then the rest, each by villa name. */
export function villaSummaries(
  officials: Official[],
  entries: SiteCheckEntry[],
  isApproved: (entry: SiteCheckEntry) => boolean,
  nameOf: (unitId: string) => string,
): VillaSummary[] {
  const summaries = officials.map((official) => {
    const own = entries.filter((entry) => entry.estimateId === official.estimateId);
    const outside = own.filter((entry) => entry.kind === "outside");
    const approved = outside.filter(isApproved).length;
    return {
      estimateId: official.estimateId,
      unitId: official.unitId,
      over: own.length - outside.length,
      waiting: outside.length - approved,
      approved,
    };
  });
  const rank = (summary: VillaSummary) => (summary.waiting > 0 ? 0 : summary.over > 0 ? 1 : 2);
  return summaries.sort(
    (a, b) =>
      rank(a) - rank(b) ||
      nameOf(a.unitId).localeCompare(nameOf(b.unitId), undefined, { numeric: true }),
  );
}

export function drawnPercent(estimated: number, reached: number): number | null {
  return estimated > 0 ? (reached / estimated) * 100 : null;
}
