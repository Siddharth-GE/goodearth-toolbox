import { sheetTotal } from "./calc";
import { checkMeasurement } from "./measurement-rules";

/**
 * The contract with Goodearth QS for SketchUp (0118). Pure, so the server
 * re-reads a file the browser already read. The file is untrusted: the
 * villa and access never come from it, and every row passes
 * measurement-rules.ts. A measurement box is a number above zero, or null
 * for "not used"; the file's own `qty` totals are ignored, because the
 * toolbox sums the rows itself (calc.ts).
 */

export const TAKEOFF_FORMAT = "goodearth-qs-takeoff";
export const TAKEOFF_VERSION = 1;
/** Well inside the 4 MB server-action body (next.config.ts). */
export const TAKEOFF_MAX_CHARS = 3_000_000;
const MAX_LINES = 2_000;
const MAX_ROWS = 50_000;
const MAX_REF = 200;
const MAX_ISSUES = 500;
const MAX_MATERIALS = 2_000;
const MAX_WORKED_OUT = 500;
const MAX_OTHER_COSTS = 100;
const MAX_SETTINGS = 100;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const MODEL_MEASURES = [
  "volume",
  "area",
  "base_and_sides",
  "sides",
  "bua",
  "length",
  "count",
  "manual",
] as const;
export type ModelMeasure = (typeof MODEL_MEASURES)[number];

export const MODEL_MEASURE_LABELS: Record<ModelMeasure, string> = {
  volume: "Volume of the solid",
  area: "Area — a wall's face, a slab's plan, painted faces",
  base_and_sides: "Base and sides — a footing's shuttering",
  sides: "Sides — every face but top and bottom: a beam's or column's shuttering",
  bua: "Built-up area — the sheet painted over each floor (package works)",
  length: "Length — the longest side",
  count: "Count — one per tagged object",
  manual: "By hand, on the estimate",
};

export const MODEL_MEASURE_SHORT: Record<ModelMeasure, string> = {
  volume: "volume",
  area: "area",
  base_and_sides: "base and sides",
  sides: "sides",
  bua: "built-up area",
  length: "length",
  count: "count",
  manual: "hand",
};

export function isModelMeasure(value: unknown): value is ModelMeasure {
  return typeof value === "string" && (MODEL_MEASURES as readonly string[]).includes(value);
}

/** What the model measures when the rate book says nothing: the extension's own default (works.rb). */
export function measureFromUnit(uom: string | null): ModelMeasure {
  switch ((uom ?? "").trim().toLowerCase()) {
    case "cum":
    case "cft":
      return "volume";
    case "sqm":
    case "sqft":
      return "area";
    case "rmt":
    case "mtr":
    case "rft":
      return "length";
    case "nos":
    case "each":
    case "set":
      return "count";
    default:
      return "manual";
  }
}

export type TakeoffRow = {
  description: string | null;
  nos: number | null;
  length: number | null;
  breadth: number | null;
  depth: number | null;
  modelRefs: string[];
};

export type TakeoffLine = {
  position: number;
  workCode: string;
  workName: string;
  uom: string;
  measuredAs: string;
  modelQty: number | null;
  rows: TakeoffRow[];
  /** Why this work cannot be taken as it is; null when every row is fine. */
  problem: string | null;
};

export type TakeoffNotMeasured = {
  workCode: string;
  workName: string;
  /** "manual" = the rate book says measure by hand; anything else is a problem in the model. */
  reason: string;
  elements: number;
};

export type TakeoffIssue = { level: string; title: string; detail: string };

/** What a work is made of as the model measured it, in the mix's own unit. uom null: the model didn't say (the
 * settings' materials), so the toolbox's mix decides. */
export type TakeoffMaterial = {
  workCode: string;
  mix: string;
  uom: string | null;
  qty: number;
  from: "model" | "steel" | "settings" | "extra";
};

/** An allowance the rate book has no work for, at the plugin's rate (the founder, 2026-10-29). */
export type TakeoffOtherCost = {
  code: string | null;
  name: string;
  unit: string | null;
  qty: number | null;
  rate: number | null;
  note: string | null;
};

export type ModelSettings = Record<string, string | number | boolean | null>;

export type Takeoff = {
  model: {
    file: string | null;
    title: string | null;
    guid: string | null;
    /** The villa this model was last imported into: a suggestion only. */
    villa: { unitId: string; name: string } | null;
  };
  generator: string | null;
  lines: TakeoffLine[];
  notMeasured: TakeoffNotMeasured[];
  issues: TakeoffIssue[];
  materials: TakeoffMaterial[];
  otherCosts: TakeoffOtherCost[];
  settings: ModelSettings | null;
  buaSqft: number | null;
  rowCount: number;
  errorCount: number;
  warningCount: number;
};

export type ParsedTakeoff = { takeoff: Takeoff; problem?: undefined } | { problem: string };

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const text = (value: unknown, limit = 500): string =>
  typeof value === "string" ? value.trim().slice(0, limit) : "";
const textOrNull = (value: unknown, limit: number): string | null => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed && trimmed.length <= limit ? trimmed : null;
};
const numberOrNull = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;
/** A box: absent or null is "not used"; anything else non-numeric is NaN, which checkMeasurement refuses. */
const box = (value: unknown): number | null =>
  value === null || value === undefined ? null : typeof value === "number" ? value : Number.NaN;
const lowerFirst = (message: string) => message.charAt(0).toLowerCase() + message.slice(1);
const positive = (value: unknown): number | null => {
  const number = numberOrNull(value);
  return number !== null && number > 0 ? number : null;
};
const notNegative = (value: unknown): number | null => {
  const number = numberOrNull(value);
  return number !== null && number >= 0 ? number : null;
};
const DIAMETER = /^\d{1,2}$/;

/** Steel arrives as mixes (the founder, 2026-10-29): bar diameter d is `Steel d mm`; 0 is kg per cum, not split. */
export function steelMixName(diameter: string): string {
  return diameter === "0" ? "Steel (kg per cum)" : `Steel ${diameter} mm`;
}

/** Worked-out lines (derived.lines): one row each, merged into the drawn line of the same code. */
function addWorkedOut(lines: TakeoffLine[], raw: unknown[]): void {
  const byCode = new Map(lines.map((line) => [line.workCode, line]));
  for (const entry of raw.filter(isObject)) {
    const workCode = text(entry.code, 40);
    const qty = positive(entry.qty);
    if (!workCode || qty === null) continue;
    const basis = text(entry.basis, 1_900);
    const row: TakeoffRow = {
      description: `${entry.from === "settings" ? "From the settings" : "Worked out"}${basis ? `: ${basis}` : ""}`,
      nos: 1,
      length: qty,
      breadth: null,
      depth: null,
      modelRefs: [],
    };
    const line = byCode.get(workCode);
    if (line) {
      line.rows.push(row);
      line.modelQty = line.modelQty === null ? null : line.modelQty + qty;
      continue;
    }
    const added: TakeoffLine = {
      position: lines.length + 1,
      workCode,
      workName: "",
      uom: text(entry.uom, 40).toLowerCase(),
      measuredAs: "",
      modelQty: qty,
      rows: [row],
      problem: null,
    };
    lines.push(added);
    byCode.set(workCode, added);
  }
}

function readMaterials(
  doc: Record<string, unknown>,
  derived: Record<string, unknown>,
): TakeoffMaterial[] {
  const list = (value: unknown) => (Array.isArray(value) ? value.filter(isObject) : []);
  const materials: TakeoffMaterial[] = [];
  const push = (
    workCode: unknown,
    mix: unknown,
    uom: unknown,
    qty: unknown,
    from: TakeoffMaterial["from"],
  ) => {
    const code = text(workCode, 40);
    const name = text(mix, 120);
    const amount = positive(qty);
    if (code && name && amount !== null) {
      materials.push({ workCode: code, mix: name, uom: text(uom, 40) || null, qty: amount, from });
    }
  };
  for (const entry of list(doc.mixes))
    push(entry.work_code, entry.mix, entry.uom, entry.qty, "model");
  for (const entry of list(doc.steel)) {
    const byDia = isObject(entry.by_dia) ? entry.by_dia : {};
    for (const [diameter, kg] of Object.entries(byDia)) {
      if (DIAMETER.test(diameter)) push(entry.work_code, steelMixName(diameter), "kg", kg, "steel");
    }
  }
  for (const entry of list(derived.mixes))
    push(entry.work_code, entry.name, entry.uom, entry.qty, "settings");
  for (const entry of list(derived.steel)) {
    const diameter = String(entry.dia ?? "");
    if (DIAMETER.test(diameter))
      push(entry.work_code, steelMixName(diameter), "kg", entry.kg, "settings");
  }
  for (const entry of list(derived.extras))
    push(entry.work_code, entry.name, entry.uom, entry.qty, "extra");
  return materials;
}

function readOtherCosts(raw: unknown[]): TakeoffOtherCost[] {
  return raw
    .filter(isObject)
    .map((entry) => ({
      code: textOrNull(entry.code, 40),
      name: text(entry.name, 200),
      unit: textOrNull(entry.unit, 40),
      qty: notNegative(entry.qty),
      rate: notNegative(entry.rate),
      note: textOrNull(entry.note, 500),
    }))
    .filter((cost) => cost.name);
}

function readSettings(raw: unknown): ModelSettings | null {
  if (!isObject(raw)) return null;
  const settings: ModelSettings = {};
  for (const [key, value] of Object.entries(raw).slice(0, MAX_SETTINGS)) {
    if (!key || key.length > 60) continue;
    if (
      value === null ||
      typeof value === "boolean" ||
      (typeof value === "number" && Number.isFinite(value))
    ) {
      settings[key] = value;
    } else if (typeof value === "string") {
      settings[key] = value.slice(0, 200);
    }
  }
  return Object.keys(settings).length > 0 ? settings : null;
}

function readRow(raw: unknown, number: number): { row?: TakeoffRow; problem?: string } {
  if (!isObject(raw)) return { problem: `row ${number} can't be read.` };
  const description =
    raw.description === null || raw.description === undefined
      ? null
      : typeof raw.description === "string"
        ? raw.description.trim() || null
        : undefined;
  if (description === undefined) return { problem: `row ${number}'s description isn't text.` };

  const refs = raw.model_refs ?? [];
  if (
    !Array.isArray(refs) ||
    !refs.every((ref) => typeof ref === "string" && ref.length > 0 && ref.length <= MAX_REF)
  ) {
    return { problem: `row ${number}'s model references can't be read.` };
  }

  const row: TakeoffRow = {
    description,
    nos: box(raw.nos),
    length: box(raw.length),
    breadth: box(raw.breadth),
    depth: box(raw.depth),
    modelRefs: refs as string[],
  };
  const problem = checkMeasurement(row);
  return problem ? { problem: `row ${number} — ${lowerFirst(problem)}` } : { row };
}

/** The takeoff, or the one reason it cannot be read. A bad row refuses only its own work; the rest imports. */
export function parseTakeoff(input: unknown): ParsedTakeoff {
  if (typeof input !== "string" || !input.trim()) {
    return { problem: "Nothing was received — send the takeoff again, or choose its file." };
  }
  if (input.length > TAKEOFF_MAX_CHARS) {
    return { problem: "That file is far larger than any takeoff — is it the right one?" };
  }
  let doc: unknown;
  try {
    doc = JSON.parse(input);
  } catch {
    return { problem: "That file isn't a takeoff — it can't be read as one." };
  }
  if (!isObject(doc) || doc.format !== TAKEOFF_FORMAT) {
    return { problem: "That file isn't a Goodearth QS takeoff." };
  }
  if (doc.version !== TAKEOFF_VERSION) {
    return {
      problem: `This takeoff is version ${String(doc.version)}; the toolbox reads version ${TAKEOFF_VERSION}. Update Goodearth QS so the two match.`,
    };
  }
  const rawLines = doc.lines ?? [];
  if (!Array.isArray(rawLines)) return { problem: "The takeoff's list of works can't be read." };
  if (rawLines.length > MAX_LINES) {
    return { problem: `The takeoff lists ${rawLines.length} works — more than any villa has.` };
  }
  const rowTotal = rawLines.reduce(
    (sum: number, line: unknown) =>
      sum + (isObject(line) && Array.isArray(line.rows) ? line.rows.length : 0),
    0,
  );
  if (rowTotal > MAX_ROWS) {
    return { problem: `The takeoff holds ${rowTotal} rows — more than any villa has.` };
  }

  const lines: TakeoffLine[] = rawLines.map((raw: unknown, index: number) => {
    const line = isObject(raw) ? raw : {};
    const workCode = text(line.work_code, 40);
    const rows: TakeoffRow[] = [];
    let problem: string | null = workCode ? null : "no work code.";
    const rawRows = line.rows;
    if (!problem && (!Array.isArray(rawRows) || rawRows.length === 0)) {
      problem = "the model sent no rows.";
    }
    if (!problem && Array.isArray(rawRows)) {
      rawRows.forEach((rawRow, rowIndex) => {
        if (problem) return;
        const read = readRow(rawRow, rowIndex + 1);
        if (read.problem) problem = read.problem;
        else if (read.row) rows.push(read.row);
      });
    }
    return {
      position: index + 1,
      workCode,
      workName: text(line.work_name),
      uom: text(line.uom, 40).toLowerCase(),
      measuredAs: text(line.measured_as, 40),
      modelQty: numberOrNull(line.qty),
      rows: problem ? [] : rows,
      problem,
    };
  });

  const derived = isObject(doc.derived) ? doc.derived : {};
  const workedOut = Array.isArray(derived.lines) ? derived.lines : [];
  const allowances = Array.isArray(derived.allowances) ? derived.allowances : [];
  const counted = [doc.mixes, doc.steel, derived.mixes, derived.steel, derived.extras].map(
    (value) => (Array.isArray(value) ? value.length : 0),
  );
  if (counted.some((count) => count > MAX_MATERIALS)) {
    return { problem: "The takeoff lists more materials than any villa has." };
  }
  if (workedOut.length > MAX_WORKED_OUT || allowances.length > MAX_OTHER_COSTS) {
    return { problem: "The takeoff lists more worked-out items than any villa has." };
  }
  addWorkedOut(lines, workedOut);

  const notMeasured: TakeoffNotMeasured[] = (
    Array.isArray(doc.not_measured) ? doc.not_measured : []
  )
    .filter(isObject)
    .map((entry) => ({
      workCode: text(entry.work_code, 40),
      workName: text(entry.work_name),
      reason: text(entry.reason, 60) || "manual",
      elements: numberOrNull(entry.elements) ?? 0,
    }))
    .filter((entry) => entry.workCode);

  const issues: TakeoffIssue[] = (Array.isArray(doc.issues) ? doc.issues : [])
    .filter(isObject)
    .slice(0, MAX_ISSUES)
    .map((issue) => ({
      level: text(issue.level, 20) || "warning",
      title: text(issue.title),
      detail: text(issue.detail, 2_000),
    }));

  const model = isObject(doc.model) ? doc.model : {};
  const villa = isObject(model.villa) ? model.villa : null;
  const summary = isObject(doc.summary) ? doc.summary : {};

  return {
    takeoff: {
      model: {
        file: textOrNull(model.file, 255),
        title: textOrNull(model.title, 255),
        guid: textOrNull(model.guid, 100),
        villa:
          villa && typeof villa.unit_id === "string" && UUID.test(villa.unit_id)
            ? { unitId: villa.unit_id, name: text(villa.name, 120) }
            : null,
      },
      generator: textOrNull(doc.generator, 120),
      lines,
      notMeasured,
      issues,
      materials: readMaterials(doc, derived),
      otherCosts: readOtherCosts(allowances),
      settings: readSettings(derived.settings),
      buaSqft: positive(derived.bua_sqft),
      rowCount: lines.reduce((sum, line) => sum + line.rows.length, 0),
      errorCount:
        numberOrNull(summary.errors) ?? issues.filter((issue) => issue.level === "error").length,
      warningCount:
        numberOrNull(summary.warnings) ??
        issues.filter((issue) => issue.level === "warning").length,
    },
  };
}

export type WorkForModel = {
  workItemId: string;
  code: string;
  name: string;
  isActive: boolean;
  uom: string | null;
  modelMeasure: ModelMeasure | null;
};

export type MixForModel = { name: string; uom: string };

export type EstimateForModel = {
  estimateId: string;
  modelFile: string | null;
  modelGuid: string | null;
  lines: {
    lineId: string;
    workItemId: string;
    qty: number | null;
    handRows: number;
    modelRows: number;
  }[];
};

export type PlanKind = "add" | "replace" | "refused" | "to_measure" | "already_on";

export type PlanEntry = {
  key: string;
  code: string;
  name: string;
  uom: string | null;
  kind: PlanKind;
  rows: number;
  qty: number | null;
  modelQtyDiffers: number | null;
  replacesRows: number;
  handRows: number;
  typedQty: number | null;
  /** The model measured it one way, the rate book another: send the works list to SketchUp. Imported anyway. */
  measuredDifferently: { model: string; rateBook: ModelMeasure } | null;
  why: string | null;
};

export type PlanRemoval = {
  code: string;
  name: string;
  uom: string | null;
  modelRows: number;
  handRows: number;
  backToMeasure: boolean;
};

export type ImportRowPayload = {
  description: string | null;
  nos: number | null;
  length: number | null;
  breadth: number | null;
  depth: number | null;
  model_refs: string[];
};

/** import_model_rows()'s p_lines. */
export type ImportLinePayload = { work_item_id: string; rows: ImportRowPayload[] };

/** import_model_takeoff()'s p_materials and p_other_costs (0174). */
export type ImportMaterialPayload = {
  work_item_id: string;
  mix_name: string;
  mix_uom: string;
  qty: number;
  /** An extra (ridge tiles, grills, stair teak) adds to the work's recipe; a mix or steel replaces it (0175). */
  adds_to_recipe: boolean;
};
export type ImportOtherCostPayload = {
  code: string | null;
  name: string;
  unit: string | null;
  qty: number | null;
  rate: number | null;
  note: string | null;
};

/** One work's material as the import will take it: a toolbox mix, a new one made under From SketchUp, or refused. */
export type PlanMaterial = {
  key: string;
  code: string;
  mix: string;
  uom: string | null;
  qty: number;
  from: TakeoffMaterial["from"];
  kind: "ok" | "new_mix" | "refused";
  why: string | null;
};

export const MODEL_MIX_GROUP = "From SketchUp";

export type ImportPlan = {
  entries: PlanEntry[];
  removals: PlanRemoval[];
  materials: PlanMaterial[];
  /** The mixes the import will make, empty, under From SketchUp. */
  newMixes: { name: string; uom: string }[];
  otherCosts: TakeoffOtherCost[];
  differentModel: { file: string | null } | null;
  counts: {
    add: number;
    replace: number;
    refused: number;
    toMeasure: number;
    removed: number;
    materials: number;
    refusedMaterials: number;
    otherCosts: number;
  };
  payload: ImportLinePayload[];
  materialsPayload: ImportMaterialPayload[];
  otherCostsPayload: ImportOtherCostPayload[];
  canImport: boolean;
};

/** The model's materials, work by work: matched to the Mixes tab by name (any case), the unit equal. A name the
 * toolbox lacks becomes a new mix (the founder, 2026-10-29); a work not on the estimate after the import is refused. */
export function planMaterials(
  materials: TakeoffMaterial[],
  works: WorkForModel[],
  mixes: MixForModel[],
  onEstimateAfter: Set<string>,
  units: string[],
): {
  plan: PlanMaterial[];
  payload: ImportMaterialPayload[];
  newMixes: { name: string; uom: string }[];
} {
  const byCode = new Map(works.map((work) => [work.code, work]));
  const mixByName = new Map(mixes.map((mix) => [mix.name.trim().toLowerCase(), mix]));
  const unitByLower = new Map(units.map((unit) => [unit.trim().toLowerCase(), unit]));
  const merged = new Map<string, PlanMaterial & { workItemId: string | null }>();
  const newMixes = new Map<string, { name: string; uom: string }>();

  for (const material of materials) {
    const work = byCode.get(material.workCode);
    const nameKey = material.mix.toLowerCase();
    const known = mixByName.get(nameKey);
    const planned = newMixes.get(nameKey);
    // A new mix takes the toolbox's own spelling of its unit (uoms), as 0174 does.
    const uom =
      known?.uom ??
      planned?.uom ??
      (material.uom ? (unitByLower.get(material.uom.toLowerCase()) ?? null) : null);
    let why: string | null = null;
    if (!work) {
      why = `${material.workCode} is not in the toolbox's works.`;
    } else if (!onEstimateAfter.has(work.workItemId)) {
      why = `${material.workCode} is not on the estimate — the model didn't measure it, or it was refused.`;
    } else if (!uom && material.uom) {
      why = `${material.mix} is in "${material.uom}", a unit the toolbox doesn't have — add it in Masters, or fix the unit in SketchUp.`;
    } else if (!uom) {
      why = `${material.mix} is not in the toolbox's mixes, and the model didn't say its unit — add it on the Mixes tab.`;
    } else if (material.uom && material.uom.toLowerCase() !== uom.trim().toLowerCase()) {
      why = `The toolbox's ${known?.name ?? material.mix} is in ${uom}; the model sent ${material.uom}. Nothing converts.`;
    }
    if (!why && !known && !planned && uom) newMixes.set(nameKey, { name: material.mix, uom });

    const key = `${material.workCode}|${nameKey}|${material.from === "extra"}|${why ? "refused" : "ok"}`;
    const entry = merged.get(key) ?? {
      key,
      code: material.workCode,
      mix: known?.name ?? planned?.name ?? material.mix,
      uom,
      qty: 0,
      from: material.from,
      kind: why ? "refused" : known ? "ok" : "new_mix",
      why,
      workItemId: work?.workItemId ?? null,
    };
    entry.qty += material.qty;
    merged.set(key, entry);
  }

  const plan = [...merged.values()].sort(
    (a, b) =>
      a.code.localeCompare(b.code, undefined, { numeric: true }) || a.mix.localeCompare(b.mix),
  );
  return {
    plan: plan.map(({ workItemId: _workItemId, ...entry }) => entry),
    payload: plan
      .filter((entry) => entry.kind !== "refused" && entry.workItemId && entry.uom)
      .map((entry) => ({
        work_item_id: entry.workItemId as string,
        mix_name: entry.mix,
        mix_uom: entry.uom as string,
        qty: entry.qty,
        adds_to_recipe: entry.from === "extra",
      })),
    newMixes: [...newMixes.values()],
  };
}

/** What importing would do, work by work: the preview the person reads, and exactly what the import writes. */
export function planImport(
  takeoff: Takeoff,
  works: WorkForModel[],
  estimate: EstimateForModel | null,
  mixes: MixForModel[],
  units: string[],
): ImportPlan {
  const byCode = new Map(works.map((work) => [work.code, work]));
  const byId = new Map(works.map((work) => [work.workItemId, work]));
  // A work may have several rows (0157); the model measures the first one listed for it.
  const onEstimate = new Map<string, NonNullable<typeof estimate>["lines"][number]>();
  for (const line of estimate?.lines ?? []) {
    if (!onEstimate.has(line.workItemId)) onEstimate.set(line.workItemId, line);
  }
  const codeCounts = new Map<string, number>();
  for (const line of takeoff.lines) {
    if (line.workCode) codeCounts.set(line.workCode, (codeCounts.get(line.workCode) ?? 0) + 1);
  }

  const entries: PlanEntry[] = [];
  const payload: ImportLinePayload[] = [];
  const measured = new Set<string>();

  const base = (code: string, name: string, uom: string | null, key: string): PlanEntry => ({
    key,
    code,
    name,
    uom,
    kind: "refused",
    rows: 0,
    qty: null,
    modelQtyDiffers: null,
    replacesRows: 0,
    handRows: 0,
    typedQty: null,
    measuredDifferently: null,
    why: null,
  });

  for (const line of takeoff.lines) {
    const code = line.workCode || `Line ${line.position}`;
    const work = line.workCode ? byCode.get(line.workCode) : undefined;
    const entry = base(
      code,
      work?.name ?? (line.workName || "A work the model named"),
      work?.uom ?? (line.uom || null),
      `line-${line.position}`,
    );
    entries.push(entry);

    if (!line.workCode) {
      entry.why = "The model sent a work with no code — check its tag in SketchUp.";
      continue;
    }
    if ((codeCounts.get(line.workCode) ?? 0) > 1) {
      entry.why = `The takeoff lists ${code} more than once — send it again from SketchUp.`;
      continue;
    }
    if (!work) {
      entry.why = `${code} is not in the toolbox's works — check the tag in SketchUp, or send it the works list.`;
      continue;
    }
    if (!work.isActive) {
      entry.why = `${code} is switched off in Masters.`;
      continue;
    }
    if (!work.uom) {
      entry.why = `${code} has no unit in the rate book — set its unit in the rate book first.`;
      continue;
    }
    if (work.uom.trim().toLowerCase() !== line.uom) {
      entry.why = `The rate book measures ${code} in ${work.uom}; the model sent ${line.uom || "no unit"}. Nothing converts — send the works list to SketchUp and measure again.`;
      continue;
    }
    if (line.problem) {
      entry.why = `${code}: ${line.problem}`;
      continue;
    }

    const there = onEstimate.get(work.workItemId);
    const qty = sheetTotal(line.rows);
    const effective = work.modelMeasure ?? measureFromUnit(work.uom);
    entry.kind = there && there.modelRows > 0 ? "replace" : "add";
    entry.rows = line.rows.length;
    entry.qty = qty;
    entry.modelQtyDiffers =
      line.modelQty !== null && Math.abs(line.modelQty - qty) > 1e-6 ? line.modelQty : null;
    entry.replacesRows = there?.modelRows ?? 0;
    entry.handRows = there?.handRows ?? 0;
    entry.typedQty =
      there && there.modelRows === 0 && there.handRows === 0 && there.qty !== null
        ? there.qty
        : null;
    // Goodearth QS 0.7–0.9 sends a built-up-area work as an area.
    const sameMeasure =
      line.measuredAs === effective || (effective === "bua" && line.measuredAs === "area");
    entry.measuredDifferently =
      line.measuredAs && !sameMeasure ? { model: line.measuredAs, rateBook: effective } : null;

    measured.add(work.workItemId);
    payload.push({
      work_item_id: work.workItemId,
      rows: line.rows.map((row) => ({
        description: row.description,
        nos: row.nos,
        length: row.length,
        breadth: row.breadth,
        depth: row.depth,
        model_refs: row.modelRefs,
      })),
    });
  }

  // Works the rate book says to measure by hand go on as "to measure" if absent, so nothing is forgotten.
  const handCodes = new Set<string>();
  for (const item of takeoff.notMeasured) {
    if (item.reason !== "manual" || codeCounts.has(item.workCode) || handCodes.has(item.workCode)) {
      continue;
    }
    handCodes.add(item.workCode);
    const work = byCode.get(item.workCode);
    const entry = base(
      item.workCode,
      work?.name ?? (item.workName || "A work the model named"),
      work?.uom ?? null,
      `hand-${item.workCode}`,
    );
    entries.push(entry);
    if (!work) {
      entry.why = `${item.workCode} is not in the toolbox's works — check the tag in SketchUp, or send it the works list.`;
      continue;
    }
    if (!work.isActive) {
      entry.why = `${item.workCode} is switched off in Masters.`;
      continue;
    }
    const there = onEstimate.get(work.workItemId);
    // Already on: left as it is.
    entry.kind = there ? "already_on" : "to_measure";
    entry.handRows = there?.handRows ?? 0;
    payload.push({ work_item_id: work.workItemId, rows: [] });
  }

  // The import replaces the model's rows whole, so a work the model stopped measuring must not keep a stale figure.
  const removals: PlanRemoval[] = (estimate?.lines ?? [])
    .filter((line) => line.modelRows > 0 && !measured.has(line.workItemId))
    .map((line) => {
      const work = byId.get(line.workItemId);
      return {
        code: work?.code ?? "?",
        name: work?.name ?? "A work",
        uom: work?.uom ?? null,
        modelRows: line.modelRows,
        handRows: line.handRows,
        backToMeasure: line.handRows === 0,
      };
    })
    .sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }));

  const onEstimateAfter = new Set([
    ...payload.map((line) => line.work_item_id),
    ...(estimate?.lines ?? []).map((line) => line.workItemId),
  ]);
  const materials = planMaterials(takeoff.materials, works, mixes, onEstimateAfter, units);

  const count = (kind: PlanKind) => entries.filter((entry) => entry.kind === kind).length;
  const counts = {
    add: count("add"),
    replace: count("replace"),
    refused: count("refused"),
    toMeasure: count("to_measure"),
    removed: removals.length,
    materials: materials.payload.length,
    refusedMaterials: materials.plan.filter((entry) => entry.kind === "refused").length,
    otherCosts: takeoff.otherCosts.length,
  };

  return {
    entries,
    removals,
    materials: materials.plan,
    newMixes: materials.newMixes,
    otherCosts: takeoff.otherCosts,
    differentModel:
      estimate?.modelGuid && takeoff.model.guid && estimate.modelGuid !== takeoff.model.guid
        ? { file: estimate.modelFile }
        : null,
    counts,
    payload,
    materialsPayload: materials.payload,
    otherCostsPayload: takeoff.otherCosts.map((cost) => ({ ...cost })),
    canImport:
      counts.add + counts.replace + counts.toMeasure + counts.removed + counts.otherCosts > 0,
  };
}
