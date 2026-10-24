/**
 * What Turing may propose, kind by kind: each a tool's own save, its fields, and how a row is
 * checked before the admin sees it and again when they press Save. Pure: the runners that call
 * each tool's action live in catalogue.ts. A new kind is a new entry here and a runner there.
 */

export type FieldKind = "id" | "date" | "whole" | "amount" | "text" | "choice" | "yesno";

/** Where an id points; the server turns each into a name the admin can check. */
export type IdTable =
  "plots" | "work_groups" | "work_items" | "profiles" | "vendors" | "labour_logs";

const FROM: Record<IdTable, string> = {
  plots: "plots (the villa's plot)",
  work_groups: "work_groups (a stage of the site sequence)",
  work_items: "work_items (a work in the works list)",
  profiles: "profiles (a person)",
  vendors: "vendors (a contractor)",
  labour_logs: "labour_logs (a day's labour on a villa)",
};

export type Field = {
  key: string;
  label: string;
  kind: FieldKind;
  /**
   * May be left out or empty. Left out keeps what is there now; empty clears it (or goes back to
   * the default), as the tool's own screen does.
   */
  optional?: true;
  /** Optional, but only ever left out: the tool refuses it empty, so it is refused here first. */
  keep?: true;
  choices?: readonly string[];
  /** A choice as the admin reads it, where its stored word is not plain English. */
  labels?: Record<string, string>;
  /** What an empty choice means, where it is not "none". */
  blank?: string;
  table?: IdTable;
};

export type EntryKey =
  | "villa_start"
  | "villa_supervisor"
  | "first_plan"
  | "stage_plan"
  | "stage_dates"
  | "stage_status"
  | "stage_contractor"
  | "stage_needed"
  | "stage_follows"
  | "sequence_days"
  | "labour_log_new"
  | "labour_log_change"
  | "labour_log_delete";

export type Entry = {
  key: EntryKey;
  /** The tool whose save this is; its grant is checked by its own action. */
  tool: string;
  title: string;
  description: string;
  fields: Field[];
  /** Makes a new record, so a field left out is blank rather than kept. */
  adds?: true;
  /** A rule across a row's fields, beyond each field's own. */
  check?: (values: Record<string, Value>) => string | undefined;
};

export type Value = string | boolean;
/** A field missing from `values` was left out: keep what is there. */
export type Row = { label: string; values: Record<string, Value> };

const plot: Field = { key: "plot_id", label: "Villa", kind: "id", table: "plots" };
const stage: Field = { key: "group_id", label: "Stage", kind: "id", table: "work_groups" };
const log: Field = { key: "log_id", label: "Log", kind: "id", table: "labour_logs" };

/** The labour form's fields, by the names Supervisors' own form sends (pinned by a test). */
export const LABOUR_LOG_FORM = [
  "plot_id",
  "work_item_id",
  "contractor_id",
  "log_date",
  "kind",
  "work_class",
  "masons",
  "helpers",
  "others",
  "quantity",
  "description",
  "note",
] as const;

const has = (values: Record<string, Value>, key: string) =>
  key in values && values[key] !== "" && values[key] !== "0";

/**
 * What Supervisors' save would drop without a word: a value the way of paying does not use, or a
 * quantity kept from another work, whose unit may differ. `now` is the log being changed.
 */
export function labourConflict(
  values: Record<string, Value>,
  now?: { kind: string; work_item_id: string },
): string | undefined {
  const kind = String(values.kind ?? now?.kind ?? "");
  if (kind === "nmr") {
    if (has(values, "quantity"))
      return "Daily wages take masons, helpers or others, not a quantity.";
    if (has(values, "description"))
      return "Daily wages keep no description of the work; put it in the note.";
  } else if (["masons", "helpers", "others"].some((key) => has(values, key))) {
    return "Heads are for daily wages; piece-work takes a quantity or what was done.";
  }
  if (kind === "pw_lump" && has(values, "quantity"))
    return "A lump sum takes what was done, not a quantity.";
  if (
    now &&
    kind === "pw_qty" &&
    "work_item_id" in values &&
    values.work_item_id !== now.work_item_id &&
    !has(values, "quantity")
  )
    return "The work changed, so give the quantity again, in the new work's unit.";
  return undefined;
}

const labourDetails = (optional: boolean): Field[] => {
  const may = optional ? ({ optional: true, keep: true } as const) : {};
  return [
    { key: "work_item_id", label: "Work", kind: "id", table: "work_items", ...may },
    { key: "contractor_id", label: "Contractor", kind: "id", table: "vendors", ...may },
    { key: "log_date", label: "Date", kind: "date", ...may },
    {
      key: "kind",
      label: "Paid as",
      kind: "choice",
      choices: ["nmr", "pw_qty", "pw_lump"],
      labels: {
        nmr: "Daily wages",
        pw_qty: "Piece-work by quantity",
        pw_lump: "Piece-work, lump sum",
      },
      ...may,
    },
    {
      key: "work_class",
      label: "Work class",
      kind: "choice",
      optional: true,
      choices: ["standard", "additional", "rework"],
      labels: { standard: "Standard work", additional: "Additional work", rework: "Rework" },
      blank: "Standard work (the default)",
    },
    { key: "masons", label: "Masons", kind: "whole", optional: true },
    { key: "helpers", label: "Helpers", kind: "whole", optional: true },
    { key: "others", label: "Others", kind: "whole", optional: true },
    { key: "quantity", label: "Quantity", kind: "amount", optional: true },
    { key: "description", label: "What was done", kind: "text", optional: true },
    { key: "note", label: "Note", kind: "text", optional: true },
  ];
};

export const ENTRIES: Entry[] = [
  {
    key: "villa_start",
    tool: "/supervisors",
    title: "A villa's start date",
    description: "The day the villa's first stage starts; the schedule works out the rest.",
    fields: [plot, { key: "start_on", label: "Starts", kind: "date", optional: true }],
  },
  {
    key: "villa_supervisor",
    tool: "/supervisors",
    title: "Who runs a villa",
    description: "The site supervisor who runs the villa.",
    fields: [
      plot,
      { key: "supervisor_id", label: "Supervisor", kind: "id", optional: true, table: "profiles" },
    ],
  },
  {
    key: "first_plan",
    tool: "/supervisors",
    title: "A villa's first plan",
    description:
      "Copies today's forecast into the villa's first plan, which slip is measured against. Needs the start date and every stage's days first. Setting it again needs a note saying why.",
    fields: [plot, { key: "note", label: "Why again", kind: "text", optional: true }],
  },
  {
    key: "stage_plan",
    tool: "/supervisors",
    title: "A stage's days and start",
    description:
      "This villa's own days for a stage, and a start fixed by hand. Empty days go back to the learned or typical days; an empty start goes back to the chain. A start already passed on a stage not begun starts it that day.",
    fields: [
      plot,
      stage,
      { key: "days", label: "Days", kind: "whole", optional: true },
      { key: "pinned_start", label: "Fixed start", kind: "date", optional: true },
    ],
  },
  {
    key: "stage_dates",
    tool: "/supervisors",
    title: "A stage's real dates",
    description:
      "Corrects when a stage really started and finished. A not-started stage has none; a done one needs both.",
    fields: [
      plot,
      stage,
      { key: "started_on", label: "Started", kind: "date", optional: true },
      { key: "finished_on", label: "Finished", kind: "date", optional: true },
    ],
  },
  {
    key: "stage_status",
    tool: "/supervisors",
    title: "A stage's status",
    description:
      "Not started, working, waiting or done. Working keeps its start or starts today; done finishes today. Waiting says on what.",
    fields: [
      plot,
      stage,
      {
        key: "status",
        label: "Status",
        kind: "choice",
        choices: ["not_started", "working", "waiting", "done"],
      },
      {
        key: "waiting_on",
        label: "Waiting on",
        kind: "choice",
        optional: true,
        choices: ["material", "labour", "inspection", "client", "other"],
      },
      { key: "waiting_note", label: "Note", kind: "text", optional: true },
    ],
  },
  {
    key: "stage_contractor",
    tool: "/supervisors",
    title: "A stage's contractor",
    description: "The contractor on a stage; only a vendor marked as a contractor is taken.",
    fields: [
      plot,
      stage,
      { key: "contractor_id", label: "Contractor", kind: "id", optional: true, table: "vendors" },
    ],
  },
  {
    key: "stage_needed",
    tool: "/supervisors",
    title: "Whether a villa needs a stage",
    description:
      "Leaves a stage off this villa, or brings it back. Only a stage not begun can be left off.",
    fields: [plot, stage, { key: "needed", label: "Needed", kind: "yesno" }],
  },
  {
    key: "stage_follows",
    tool: "/supervisors",
    title: "What a stage follows on a villa",
    description:
      "On this villa only: the stage it follows, after it or alongside it. Empty goes back to the site sequence.",
    fields: [
      plot,
      stage,
      {
        key: "follows_group_id",
        label: "Follows",
        kind: "id",
        optional: true,
        table: "work_groups",
      },
      {
        key: "link",
        label: "How",
        kind: "choice",
        optional: true,
        choices: ["after", "alongside"],
      },
    ],
  },
  {
    key: "sequence_days",
    tool: "/supervisors",
    title: "The site sequence's days",
    description:
      "For every villa: a stage's typical days (for a villa of the typical size) or its wait days after the stage it follows.",
    fields: [
      stage,
      { key: "field", label: "Which", kind: "choice", choices: ["typical", "wait"] },
      { key: "value", label: "Days", kind: "whole", optional: true },
    ],
  },
  {
    key: "labour_log_new",
    tool: "/supervisors",
    title: "A day's labour",
    description:
      "Logs a day's labour on a villa: the work, the contractor (a vendor with is_contractor) and how it is paid — nmr is daily wages (masons, helpers, others; at least one), pw_qty is piece-work by quantity (in the work's unit from the rate book), pw_lump is a lump sum (what was done says what). Work class is standard unless it was additional work or rework. A second log for the same villa, work, contractor, day, payment and class is refused: change that one instead. Quantities and heads only, never wages.",
    adds: true,
    check: (values) => labourConflict(values),
    fields: [plot, ...labourDetails(false)],
  },
  {
    key: "labour_log_change",
    tool: "/supervisors",
    title: "A labour log, corrected",
    description:
      "Corrects a labour log (labour_logs.id); its villa stays. A log on a bill (bill_id set) cannot be changed.",
    fields: [log, ...labourDetails(true)],
  },
  {
    key: "labour_log_delete",
    tool: "/supervisors",
    title: "A labour log, deleted",
    description:
      "Deletes a labour log entered by mistake (labour_logs.id). A log on a bill (bill_id set) cannot be deleted.",
    fields: [log],
  },
];

export const entryFor = (key: unknown): Entry | undefined =>
  ENTRIES.find((entry) => entry.key === key);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** A real calendar day, written 2026-10-24: 2026-02-30 is refused, not rolled into March. */
const isDay = (value: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  !Number.isNaN(Date.parse(value)) &&
  new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;

export type Checked<T> = { ok: true; value: T } | { ok: false; error: string };

/** `undefined` back means the field was left out. */
function checkValue(field: Field, raw: unknown): Checked<Value | undefined> {
  if (raw === undefined) {
    return field.optional
      ? { ok: true, value: undefined }
      : { ok: false, error: `${field.label} is missing.` };
  }
  if (field.kind === "yesno") {
    return typeof raw === "boolean"
      ? { ok: true, value: raw }
      : { ok: false, error: `${field.label} is yes or no.` };
  }
  const text = raw === null ? "" : typeof raw === "number" ? String(raw) : raw;
  if (typeof text !== "string") return { ok: false, error: `${field.label} is not readable.` };
  const value = text.trim();
  if (!value) {
    if (field.keep)
      return { ok: false, error: `${field.label} can be left as it is, but not emptied.` };
    return field.optional
      ? { ok: true, value: "" }
      : { ok: false, error: `${field.label} is missing.` };
  }
  switch (field.kind) {
    case "id":
      return UUID.test(value)
        ? { ok: true, value }
        : { ok: false, error: `${field.label} is not an id.` };
    case "date":
      return isDay(value)
        ? { ok: true, value }
        : { ok: false, error: `${field.label} is a real date written 2026-10-24.` };
    case "whole":
      return /^\d{1,3}$/.test(value)
        ? { ok: true, value }
        : { ok: false, error: `${field.label} is a whole number up to 999.` };
    case "amount":
      return /^\d{1,9}(\.\d{1,3})?$/.test(value)
        ? { ok: true, value }
        : { ok: false, error: `${field.label} is a number, like 12.5.` };
    case "choice":
      return field.choices?.includes(value)
        ? { ok: true, value }
        : { ok: false, error: `${field.label} is one of: ${field.choices?.join(", ")}.` };
    case "text":
      return value.length <= 500
        ? { ok: true, value }
        : { ok: false, error: `${field.label} is too long.` };
  }
}

export function checkRow(entry: Entry, raw: unknown): Checked<Row> {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return { ok: false, error: "A row is an object." };
  }
  const given = raw as Record<string, unknown>;
  const source = (
    typeof given.values === "object" && given.values !== null ? given.values : given
  ) as Record<string, unknown>;
  const label = typeof given.label === "string" ? given.label.trim() : "";
  if (!label || label.length > 160)
    return { ok: false, error: "Each row needs a label saying what it changes." };
  const values: Record<string, Value> = {};
  for (const field of entry.fields) {
    const value = checkValue(field, source[field.key]);
    if (!value.ok) return value;
    if (value.value !== undefined) values[field.key] = value.value;
  }
  const problem = entry.check?.(values);
  if (problem) return { ok: false, error: problem };
  return { ok: true, value: { label, values } };
}

export type Proposal = { entry: Entry; title: string; rows: Row[] };

/** Claude's proposal, checked whole: every row must pass, or Claude is told which did not. */
export function checkProposal(input: unknown): Checked<Proposal> {
  const given = (typeof input === "object" && input !== null ? input : {}) as Record<
    string,
    unknown
  >;
  const entry = entryFor(given.action);
  if (!entry) return { ok: false, error: `There is no change called "${String(given.action)}".` };
  const title = typeof given.title === "string" ? given.title.trim() : "";
  if (!title || title.length > 120)
    return { ok: false, error: "A proposal needs a title of up to 120 characters." };
  if (!Array.isArray(given.rows) || given.rows.length === 0 || given.rows.length > 200) {
    return { ok: false, error: "A proposal has 1 to 200 rows." };
  }
  const rows: Row[] = [];
  const problems: string[] = [];
  given.rows.forEach((raw, index) => {
    const row = checkRow(entry, raw);
    if (row.ok) rows.push(row.value);
    else problems.push(`Row ${index + 1}: ${row.error}`);
  });
  if (problems.length > 0) return { ok: false, error: problems.slice(0, 20).join("\n") };
  return { ok: true, value: { entry, title, rows } };
}

/**
 * The rows the admin saves: the ones they ticked, as they edited them. What a row is about and
 * who or what it names — its ids — cannot be edited on screen, so an edit to one is refused.
 */
export function editedRows(
  entry: Entry,
  original: Row[],
  edits: unknown,
): Checked<{ index: number; row: Row }[]> {
  if (!Array.isArray(edits) || edits.length === 0)
    return { ok: false, error: "Tick at least one row." };
  const seen = new Set<number>();
  const rows: { index: number; row: Row }[] = [];
  for (const edit of edits) {
    const index = (edit as { row?: unknown })?.row;
    if (
      typeof index !== "number" ||
      !Number.isInteger(index) ||
      !original[index] ||
      seen.has(index)
    ) {
      return { ok: false, error: "The rows changed. Reload and try again." };
    }
    seen.add(index);
    const merged = {
      label: original[index].label,
      values: { ...original[index].values, ...((edit as { values?: object }).values ?? {}) },
    };
    const row = checkRow(entry, merged);
    if (!row.ok) return { ok: false, error: `${original[index].label}: ${row.error}` };
    const moved = entry.fields.find(
      (field) =>
        field.kind === "id" && row.value.values[field.key] !== original[index].values[field.key],
    );
    if (moved)
      return {
        ok: false,
        error: `${original[index].label}: its ${moved.label.toLowerCase()} cannot change.`,
      };
    rows.push({ index, row: row.value });
  }
  return { ok: true, value: rows.sort((a, b) => a.index - b.index) };
}

/** Every id the rows name, by the table it points into, for the server to turn into names. */
export function idsOf(entry: Entry, rows: Row[]): Map<IdTable, Set<string>> {
  const ids = new Map<IdTable, Set<string>>();
  for (const field of entry.fields) {
    if (field.kind !== "id" || !field.table) continue;
    for (const row of rows) {
      const value = row.values[field.key];
      if (typeof value !== "string" || !value) continue;
      if (!ids.has(field.table)) ids.set(field.table, new Set());
      ids.get(field.table)?.add(value);
    }
  }
  return ids;
}

/** The catalogue as Claude reads it, in the system prompt: stable text, so the cache holds. */
export function catalogueText(): string {
  const rows = ENTRIES.map((entry) => {
    const fields = entry.fields
      .map((field) => {
        const kind =
          field.kind === "choice"
            ? `one of ${field.choices?.join(" | ")}`
            : field.kind === "id"
              ? `id from ${field.table ? FROM[field.table] : "its table"}`
              : field.kind === "yesno"
                ? "true or false"
                : field.kind === "whole"
                  ? "whole number"
                  : field.kind === "amount"
                    ? "number"
                    : field.kind;
        const may = field.keep ? ", optional, never empty" : field.optional ? ", optional" : "";
        return `${field.key} (${kind}${may})`;
      })
      .join(", ");
    const adds = entry.adds ? " Adds a new record." : "";
    return `- ${entry.key} — ${entry.title}, in ${entry.tool}.${adds} ${entry.description} Fields: ${fields}.`;
  });
  return [
    "An optional field left out keeps what is there now; given as empty it clears it. On an entry that adds a new record, a field left out is blank. Give only what the admin asked to change. Every id is shown to the admin as a name, and an id that names nothing is refused.",
    ...rows,
  ].join("\n");
}
