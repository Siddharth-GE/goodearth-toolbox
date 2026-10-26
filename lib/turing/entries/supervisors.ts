/** Supervisors' schedule and labour logs. */
import type { Field, Value } from "../catalogue-fields";
import { defineEntries } from "./define";

const plot: Field = { key: "plot_id", label: "Villa", kind: "id", table: "plots" };
const stage: Field = { key: "group_id", label: "Stage", kind: "id", table: "work_groups" };
const log: Field = {
  key: "log_id",
  label: "Log",
  kind: "id",
  table: "labour_logs",
  record: true,
};

/** The labour form's fields, by the names Supervisors' own form sends (pinned by a test). */
export const LABOUR_LOG_FORM = [
  "plot_id",
  "work_item_id",
  "custom_name",
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
  key in values && values[key] !== "" && Number(values[key]) !== 0;

/**
 * What Supervisors' save would drop without a word: a value the way of paying does not use, or a
 * quantity kept from another work, whose unit may differ. `now` is the log being changed.
 */
export function labourConflict(
  values: Record<string, Value>,
  now?: { kind: string; work_item_id: string | null },
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
    // A work, or for Additional work or Rework a typed name instead (Supervisors refuses neither or a quantity on a name).
    { key: "work_item_id", label: "Work", kind: "id", table: "work_items", optional: true },
    { key: "custom_name", label: "Named work (Additional or Rework)", kind: "text", optional: true, max: 120 },
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
    { key: "masons", label: "Masons", kind: "amount", heads: true, optional: true },
    { key: "helpers", label: "Helpers", kind: "amount", heads: true, optional: true },
    { key: "others", label: "Others", kind: "amount", heads: true, optional: true },
    { key: "quantity", label: "Quantity", kind: "amount", optional: true },
    { key: "description", label: "What was done", kind: "text", optional: true },
    { key: "note", label: "Note", kind: "text", optional: true },
  ];
};

export const SUPERVISORS = defineEntries([
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
      "Logs a day's labour on a villa: the work, the contractor (a vendor with is_contractor) and how it is paid — nmr is daily wages (masons, helpers, others; at least one), pw_qty is piece-work by quantity (in the work's unit from the rate book), pw_lump is a lump sum (what was done says what). Work class is standard unless it was additional work or rework. Additional work or rework that is not on the works list takes a named work instead of a work, paid as nmr or pw_lump only. A second log for the same villa, work, contractor, day, payment and class is refused: change that one instead. Quantities and heads only, never wages.",
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
]);
