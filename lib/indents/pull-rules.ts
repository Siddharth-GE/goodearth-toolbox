// Pure rules, no database (imports nothing, so tests run directly).
// Only the CURRENT issued revision's budget is safe to request against: older approved budgets are how a line gets bought twice. Drift compares item_id too, so any change flags.

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

/** Pullable iff the selection is the unit's issued revision; an all-superseded unit gets one pending row with the issued R-number. */
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

/** Indent lines anchored to a superseded revision, keyed by line_key: "removed" or "changed" (item, quantity or space); absent keys are unchanged. */
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

export type EstimatePullCandidate = {
  quantity: number;
  material_uom: string;
  item_id: string | null;
  item_default_uom: string | null;
  /** One material_uom = factor × item_default_uom; null = none entered. */
  item_uom_factor: number | null;
};

export type EstimatePullState =
  { state: "unlinked" } | { state: "needs_qty" } | { state: "ready"; prefillQty: number };

// Since 0086 a takeoff row is in the item's unit and ready. Older rows: a person-entered factor converts; matching unit labels (each = nos) convert 1:1;
// anything else asks a person, because a guessed conversion is a wrong number.
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

export type EstimateFact = {
  work_item_id: string | null;
  material_name: string;
  uom: string;
  quantity: number;
  /** Always set since 0086; null only on an older estimate. */
  item_id: string | null;
  item_uom_factor: number | null;
};

export type EstimatePullGroup = {
  /** The item, or "unlinked:<name>" for an older row that names none. */
  key: string;
  item_id: string | null;
  estimate_name: string;
  /** In the estimate's own unit(s), e.g. "8 cft + 2 bag" when older works disagreed. */
  estimate_parts: { quantity: number; uom: string }[];
  work_count: number;
  verdict: EstimatePullState;
};

// Keyed on the ITEM (BUGCATCHER #16). Older rows convert fact by fact before summing; an item is ready only when every one converts.
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

/** Requested against ANY of the villa's estimates: counting only the current one reopens the double-buy. */
export function requestedByItem(
  lines: { item_id: string; quantity: number; indent_id: string; work_item_id?: string | null }[],
  indentId: string,
  /** With a work, only that work's indents count; `requested` stays villa-wide. */
  workItemId: string | null = null,
): { requested: Map<string, number>; forWork: Map<string, number>; onThisIndent: Set<string> } {
  const requested = new Map<string, number>();
  const forWork = new Map<string, number>();
  const onThisIndent = new Set<string>();
  for (const line of lines) {
    requested.set(line.item_id, (requested.get(line.item_id) ?? 0) + line.quantity);
    if (workItemId && line.work_item_id === workItemId) {
      forWork.set(line.item_id, (forWork.get(line.item_id) ?? 0) + line.quantity);
    }
    if (line.indent_id === indentId) onThisIndent.add(line.item_id);
  }
  return { requested, forWork, onThisIndent };
}

/** An indent for one work offers that work's materials only; no work, or "every work", offers all. */
export function factsForWork<T extends { work_item_id: string | null }>(
  facts: T[],
  workItemId: string | null,
): T[] {
  return workItemId ? facts.filter((fact) => fact.work_item_id === workItemId) : facts;
}

/** The date to warn with, or null. Equal is not "after": an estimate goes official in one transaction, one clock reading. */
export function workingChangedSince(
  submittedAt: string | null,
  workingUpdatedAt: string | null,
): string | null {
  if (!submittedAt || !workingUpdatedAt) return null;
  return Date.parse(workingUpdatedAt) > Date.parse(submittedAt) ? workingUpdatedAt : null;
}

/** Six places, the estimator's rounding — sums of decimals drift otherwise. */
function roundQty(value: number): number {
  return Math.round(value * 1e6) / 1e6;
}
