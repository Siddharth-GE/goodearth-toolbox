/**
 * What Turing may propose, kind by kind: each a tool's own save, its fields, and how a row is
 * checked before the admin sees it and again when they press Save. Pure: the runners that call
 * each tool's action live in catalogue.ts. A new kind is a new entry here and a runner there.
 */

export type FieldKind = "id" | "date" | "whole" | "text" | "choice" | "yesno";

export type Field = {
  key: string;
  label: string;
  kind: FieldKind;
  /** Empty is allowed, and means "clear it" or "leave it to the default", as the tool's own screen does. */
  optional?: true;
  choices?: readonly string[];
  /** Where an id comes from, for Claude. */
  from?: string;
};

export type Entry = {
  key: string;
  /** The tool whose save this is; its grant is checked by its own action. */
  tool: string;
  title: string;
  description: string;
  fields: Field[];
};

export type Value = string | boolean;
export type Row = { label: string; values: Record<string, Value> };

const plot: Field = {
  key: "plot_id",
  label: "Villa",
  kind: "id",
  from: "plots (the villa's plot)",
};
const stage: Field = {
  key: "group_id",
  label: "Stage",
  kind: "id",
  from: "work_groups (a stage of the site sequence)",
};

export const ENTRIES: Entry[] = [
  {
    key: "villa_start",
    tool: "/supervisors",
    title: "A villa's start date",
    description:
      "The day the villa's first stage starts; the schedule works out the rest. Empty clears it.",
    fields: [plot, { key: "start_on", label: "Starts", kind: "date", optional: true }],
  },
  {
    key: "villa_supervisor",
    tool: "/supervisors",
    title: "Who runs a villa",
    description: "The site supervisor who runs the villa. Empty takes them off.",
    fields: [
      plot,
      {
        key: "supervisor_id",
        label: "Supervisor",
        kind: "id",
        optional: true,
        from: "profiles (a person)",
      },
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
    description:
      "The contractor on a stage. Empty takes them off; only a vendor marked as a contractor is taken.",
    fields: [
      plot,
      stage,
      {
        key: "contractor_id",
        label: "Contractor",
        kind: "id",
        optional: true,
        from: "vendors (a contractor)",
      },
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
        from: "work_groups",
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
];

export const entryFor = (key: unknown): Entry | undefined =>
  ENTRIES.find((entry) => entry.key === key);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export type Checked<T> = { ok: true; value: T } | { ok: false; error: string };

function checkValue(field: Field, raw: unknown): Checked<Value> {
  if (field.kind === "yesno") {
    return typeof raw === "boolean"
      ? { ok: true, value: raw }
      : { ok: false, error: `${field.label} is yes or no.` };
  }
  const text = raw === undefined || raw === null ? "" : typeof raw === "number" ? String(raw) : raw;
  if (typeof text !== "string") return { ok: false, error: `${field.label} is not readable.` };
  const value = text.trim();
  if (!value)
    return field.optional
      ? { ok: true, value: "" }
      : { ok: false, error: `${field.label} is missing.` };
  switch (field.kind) {
    case "id":
      return UUID.test(value)
        ? { ok: true, value }
        : { ok: false, error: `${field.label} is not an id.` };
    case "date":
      return DATE.test(value) && !Number.isNaN(Date.parse(value))
        ? { ok: true, value }
        : { ok: false, error: `${field.label} is a date written 2026-10-24.` };
    case "whole":
      return /^\d{1,3}$/.test(value)
        ? { ok: true, value }
        : { ok: false, error: `${field.label} is a whole number of days.` };
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
    values[field.key] = value.value;
  }
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
 * The rows the admin saves: the ones they ticked, as they edited them. What a row is about — its
 * ids — cannot be edited on screen, so an edit that changes one is refused.
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
        field.kind === "id" &&
        !field.optional &&
        row.value.values[field.key] !== original[index].values[field.key],
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

/** The catalogue as Claude reads it, in the system prompt: stable text, so the cache holds. */
export function catalogueText(): string {
  return ENTRIES.map((entry) => {
    const fields = entry.fields
      .map((field) => {
        const kind =
          field.kind === "choice"
            ? `one of ${field.choices?.join(" | ")}`
            : field.kind === "id"
              ? `id from ${field.from}`
              : field.kind === "yesno"
                ? "true or false"
                : field.kind === "whole"
                  ? "whole number"
                  : field.kind;
        return `${field.key} (${kind}${field.optional ? ", may be empty" : ""})`;
      })
      .join(", ");
    return `- ${entry.key} — ${entry.title}, in ${entry.tool}. ${entry.description} Fields: ${fields}.`;
  }).join("\n");
}
