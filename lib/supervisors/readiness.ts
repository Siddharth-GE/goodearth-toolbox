import type { EstimateQuickPick, VillaDetail } from "./queries";

// Pure. Whether a stage's material is ready: what the official estimate needs for its works, what has been drawn, what the
// stores hold, and what is left to ask for — on the villa page's Next up and on the look ahead.

export type Readiness = {
  key: string;
  materialName: string;
  uom: string;
  estimated: number;
  drawn: number | null;
  pick: EstimateQuickPick | null;
  held: number | null;
  left: number | null;
};

export function stageReadiness(
  workIds: string[],
  villa: Pick<VillaDetail, "workGroups" | "quickPicks">,
  stock: Map<string, number>,
): Readiness[] {
  const works = new Set(workIds);
  return villa.workGroups
    .filter((group) => works.has(group.workItemId))
    .flatMap((group) =>
      group.rows.map((row) => {
        const pick =
          villa.quickPicks.find(
            (entry) =>
              entry.workItemId === row.workItemId && entry.materialName === row.materialName,
          ) ?? null;
        const sameUnit =
          pick !== null && pick.itemUom.trim().toLowerCase() === row.uom.trim().toLowerCase();
        // Rounded so a request never pre-fills 7.099999999999999.
        const left =
          Math.round(
            (row.issued !== null ? Math.max(row.estimated - row.issued, 0) : row.estimated) * 1000,
          ) / 1000;
        return {
          key: `${row.workItemId}-${row.materialName}`,
          materialName: row.materialName,
          uom: row.uom,
          estimated: row.estimated,
          drawn: row.issued,
          pick,
          held: pick ? (stock.get(pick.itemId) ?? 0) : null,
          left: sameUnit ? left : null,
        };
      }),
    );
}

/** "3 of 5 drawn · 2 to request": a stage's readiness in a line. */
export function readinessSummary(rows: Readiness[]): string {
  if (rows.length === 0) return "No material on the estimate";
  const drawn = rows.filter((row) => row.left === 0).length;
  const toRequest = rows.filter((row) => row.pick && row.left !== 0).length;
  return `${drawn} of ${rows.length} drawn${toRequest ? ` · ${toRequest} to request` : ""}`;
}
