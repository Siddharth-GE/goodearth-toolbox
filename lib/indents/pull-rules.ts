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
 * Since 0086 a takeoff row is already in the item's own unit, so it is
 * ready as it stands. The rest serves estimates submitted before that: a
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

/** One row of estimate_takeoff_facts — one (work, material) of the official estimate. */
export type EstimateFact = {
  work_item_id: string | null;
  /** The frozen name and unit the estimate was submitted with. */
  material_name: string;
  uom: string;
  quantity: number;
  /** The catalogue item. Always set since 0086; null only on an older
   * estimate whose material was never linked to one. */
  item_id: string | null;
  item_uom_factor: number | null;
};

export type EstimatePullGroup = {
  /** The item, or "unlinked:<name>" for an older row that names none. */
  key: string;
  item_id: string | null;
  /** The frozen estimate name(s), for when the item has been renamed since. */
  estimate_name: string;
  /** What the estimate says, in its own unit(s) — one part per unit, so
   * "8 cft + 2 bag" when two older works disagreed. */
  estimate_parts: { quantity: number; uom: string }[];
  work_count: number;
  verdict: EstimatePullState;
};

/**
 * The official estimate, one row per catalogue item — what a person
 * requests, whatever work it was estimated under.
 *
 * Keyed on the ITEM (BUGCATCHER #16): since 0086 every takeoff row names
 * its item and has no material id, so a pull keyed on the material saw
 * nothing. An older row still converts through its own factor, fact by
 * fact, before anything is added up — two works that estimated the same
 * item in different units are only ready when every one of them converts.
 * `itemUom` is the item's unit today, read from the catalogue.
 */
export function groupEstimatePull(
  facts: EstimateFact[],
  itemUom: Map<string, string>,
): EstimatePullGroup[] {
  type Acc = {
    item_id: string | null;
    names: Set<string>;
    byUom: Map<string, number>;
    works: Set<string>;
    prefill: number;
    state: EstimatePullState["state"];
  };
  const groups = new Map<string, Acc>();

  for (const fact of facts) {
    const key = fact.item_id ?? `unlinked:${fact.material_name}`;
    const acc = groups.get(key) ?? {
      item_id: fact.item_id,
      names: new Set<string>(),
      byUom: new Map<string, number>(),
      works: new Set<string>(),
      prefill: 0,
      state: "ready",
    };
    acc.names.add(fact.material_name);
    acc.byUom.set(fact.uom, (acc.byUom.get(fact.uom) ?? 0) + fact.quantity);
    if (fact.work_item_id) acc.works.add(fact.work_item_id);

    const verdict = classifyEstimatePull({
      quantity: fact.quantity,
      material_uom: fact.uom,
      item_id: fact.item_id,
      item_default_uom: fact.item_id ? (itemUom.get(fact.item_id) ?? null) : null,
      item_uom_factor: fact.item_uom_factor,
    });
    if (verdict.state === "unlinked") acc.state = "unlinked";
    else if (verdict.state === "needs_qty" && acc.state === "ready") acc.state = "needs_qty";
    else if (verdict.state === "ready") acc.prefill += verdict.prefillQty;
    groups.set(key, acc);
  }

  return [...groups.entries()].map(([key, acc]) => ({
    key,
    item_id: acc.item_id,
    estimate_name: [...acc.names].join(" / "),
    estimate_parts: [...acc.byUom.entries()].map(([uom, quantity]) => ({
      quantity: roundQty(quantity),
      uom,
    })),
    work_count: acc.works.size,
    verdict:
      acc.state === "ready"
        ? { state: "ready", prefillQty: roundQty(acc.prefill) }
        : { state: acc.state },
  }));
}

/**
 * Everything already requested against ANY of the villa's estimates, per
 * item. Counting only the current official estimate reopened the
 * double-buy every time the villa was re-estimated: lines pulled against
 * EST/…/001 counted for nothing once EST/…/002 superseded it.
 */
export function requestedByItem(
  lines: { item_id: string; quantity: number; indent_id: string }[],
  indentId: string,
): { requested: Map<string, number>; onThisIndent: Set<string> } {
  const requested = new Map<string, number>();
  const onThisIndent = new Set<string>();
  for (const line of lines) {
    requested.set(line.item_id, (requested.get(line.item_id) ?? 0) + line.quantity);
    if (line.indent_id === indentId) onThisIndent.add(line.item_id);
  }
  return { requested, onThisIndent };
}

/** Six places, the estimator's rounding — sums of decimals drift otherwise. */
function roundQty(value: number): number {
  return Math.round(value * 1e6) / 1e6;
}
