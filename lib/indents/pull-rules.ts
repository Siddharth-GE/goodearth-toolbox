/**
 * Which budgets may be pulled from, and which pulled lines have drifted
 * from the design — the pure decisions, no database.
 *
 * A unit's selection is revised over time and every issued revision gets
 * its own budget; an approved budget stays approved forever as the
 * historical record. Only the budget of the CURRENT (issued) revision is
 * safe to request material against — offering older ones is how the same
 * line gets bought twice. This module exists apart from queries.ts so
 * the rules can be tested directly — it may import nothing.
 *
 * Drift comparison deliberately includes item_id (diffLines in
 * Selections does not need to — an item swap there is remove + add): an
 * indent line anchored to a superseded revision must flag "the design no
 * longer says this" whatever form the change took.
 */

export type BudgetCandidate = {
  budget_id: string;
  unit_id: string;
  selection_id: string;
  version: number;
  approved_at: string | null;
};

export type IssuedRevision = {
  selection_id: string;
  revision_no: number;
};

export type ChooserRow =
  | { kind: "pullable"; budget: BudgetCandidate; revision_no: number }
  | { kind: "pending"; unit_id: string; revision_no: number };

/**
 * Sort approved budgets into "pull from this" and "this unit is paused
 * while its new revision's budget gets approved".
 *
 * A candidate is pullable iff its selection IS the unit's issued
 * revision. A unit whose candidates are all superseded gets exactly one
 * pending row carrying the issued revision's number — the screen's
 * "R2 issued — budget pending approval". A unit with no issued revision
 * at all contributes nothing (a budget implies an issued selection, so
 * this only covers bad data).
 */
export function classifyBudgetChooser(
  candidates: BudgetCandidate[],
  issuedByUnit: Map<string, IssuedRevision>,
): ChooserRow[] {
  const rows: ChooserRow[] = [];
  const pendingUnits = new Set<string>();

  for (const candidate of candidates) {
    const issued = issuedByUnit.get(candidate.unit_id);
    if (!issued) continue;
    if (candidate.selection_id === issued.selection_id) {
      rows.push({ kind: "pullable", budget: candidate, revision_no: issued.revision_no });
    } else {
      pendingUnits.add(candidate.unit_id);
    }
  }

  const pullableUnits = new Set(
    rows.filter((row) => row.kind === "pullable").map((row) => row.budget.unit_id),
  );
  for (const unitId of pendingUnits) {
    if (pullableUnits.has(unitId)) continue;
    const issued = issuedByUnit.get(unitId);
    if (!issued) continue;
    rows.push({ kind: "pending", unit_id: unitId, revision_no: issued.revision_no });
  }

  return rows;
}

export type DriftLine = {
  line_key: string;
  item_id: string;
  quantity: number;
  unit_space_id: string;
};

export type DriftStatus = "changed" | "removed";

/**
 * For indent lines anchored to a superseded revision: which of them does
 * the latest issued revision no longer agree with?
 *
 * Returns a map keyed by line_key; keys absent from the map are
 * unchanged. "removed" — the line is gone from the latest revision;
 * "changed" — its item, quantity or space differs.
 */
export function classifyDesignDrift(
  anchoredKeys: string[],
  anchoredLines: DriftLine[],
  latestLines: DriftLine[],
): Map<string, DriftStatus> {
  const anchoredByKey = new Map(anchoredLines.map((line) => [line.line_key, line]));
  const latestByKey = new Map(latestLines.map((line) => [line.line_key, line]));

  const drift = new Map<string, DriftStatus>();
  for (const key of anchoredKeys) {
    const latest = latestByKey.get(key);
    if (!latest) {
      drift.set(key, "removed");
      continue;
    }
    const anchored = anchoredByKey.get(key);
    if (!anchored) continue;
    if (
      anchored.item_id !== latest.item_id ||
      anchored.quantity !== latest.quantity ||
      anchored.unit_space_id !== latest.unit_space_id
    ) {
      drift.set(key, "changed");
    }
  }
  return drift;
}

// ---------------------------------------------------------------------
// Pull path 3 — the villa's official estimate (0078)
// ---------------------------------------------------------------------

export type EstimatePullCandidate = {
  /** The estimate's quantity for this material, in the MATERIAL's uom. */
  quantity: number;
  material_uom: string;
  /** The catalogue item the material is bought as; null = not linked. */
  item_id: string | null;
  item_default_uom: string | null;
  /** One material_uom = factor × item_default_uom; null = none entered. */
  item_uom_factor: number | null;
};

export type EstimatePullState =
  { state: "unlinked" } | { state: "needs_qty" } | { state: "ready"; prefillQty: number };

/**
 * What the pull screen may do with one material of the takeoff.
 *
 * The conversion rule is lib/estimator/link.ts's, restated here because
 * pure modules import nothing (the todayInIndia() arrangement): a
 * person-entered factor converts; matching unit labels (case-insensitive,
 * with procurement's 'each' and the estimator's 'nos' being one unit)
 * convert 1:1; anything else asks a person for the quantity rather than
 * guessing — a guessed conversion is a wrong number on an indent.
 */
export function classifyEstimatePull(row: EstimatePullCandidate): EstimatePullState {
  if (!row.item_id || !row.item_default_uom) return { state: "unlinked" };
  if (row.item_uom_factor !== null && row.item_uom_factor > 0) {
    return { state: "ready", prefillQty: row.quantity * row.item_uom_factor };
  }
  const canon = (u: string) => {
    const t = u.trim().toLowerCase();
    return t === "nos" ? "each" : t;
  };
  if (canon(row.material_uom) === canon(row.item_default_uom)) {
    return { state: "ready", prefillQty: row.quantity };
  }
  return { state: "needs_qty" };
}
