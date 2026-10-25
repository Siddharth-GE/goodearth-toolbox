/** Design Management: each villa's design stages, the team's actions, the stage list and transmittals, through its own saves. */
import type { Field } from "../catalogue-fields";
import { defineEntries } from "./define";

const villa: Field = { key: "unit_id", label: "Villa", kind: "id", table: "units" };
const stage: Field = {
  key: "stage_id",
  label: "Stage",
  kind: "id",
  table: "design_stages",
};
const person: Field = { key: "person_id", label: "Person", kind: "id", table: "profiles" };
const action: Field = {
  key: "action_id",
  label: "Action",
  kind: "id",
  table: "design_actions",
  record: true,
};
const transmittal: Field = {
  key: "transmittal_id",
  label: "Transmittal",
  kind: "id",
  table: "transmittals",
  record: true,
};
const placed: Field[] = [
  {
    key: "after_stage_id",
    label: "After",
    kind: "id",
    table: "design_stages",
    optional: true,
  },
  { key: "at_start", label: "At the start", kind: "yesno", optional: true },
];

const PEOPLE =
  "One row per person on it (person_id, someone holding Design Management); the rows of one villa and stage are one save.";
const STATUS_LABELS = {
  working: "Working",
  with_client: "With the client",
  waiting: "Waiting on others",
  done: "Done",
  revising: "Revising",
  not_started: "Not started",
};

/** The stage list with one stage moved to the start, or after another; any other stage stays in its order. */
export function movedStage(ids: readonly string[], id: string, after: string | null): string[] {
  const rest = ids.filter((other) => other !== id);
  if (after === null) return [id, ...rest];
  const at = rest.indexOf(after);
  return [...rest.slice(0, at + 1), id, ...rest.slice(at + 1)];
}

/**
 * Design Management's pass rule, restated (Turing may not import it): a villa sits at the furthest
 * board stage that has started, and only that stage passes on, to any board stage after it.
 */
export function passTargetIds(
  boardIds: readonly string[],
  started: ReadonlySet<string>,
  fromId: string,
): string[] {
  const from = boardIds.indexOf(fromId);
  let sits = -1;
  boardIds.forEach((id, at) => {
    if (started.has(id)) sits = at;
  });
  return from === -1 || from !== sits ? [] : boardIds.slice(from + 1);
}

const onePlace = (values: Record<string, unknown>) =>
  values.at_start === true && values.after_stage_id
    ? "Give at_start or after_stage_id, not both."
    : undefined;

export const DESIGN_MANAGEMENT = defineEntries([
  {
    key: "design_stage_start",
    tool: "/design-management",
    title: "A villa's design stage, started",
    description: `Starts a board stage (design_stages on_board) that has not started on a villa (units.id), with the people who take it; stages run side by side, so the others stay as they are. ${PEOPLE}`,
    lines: { noun: "Stage" },
    fields: [{ ...villa, header: true }, { ...stage, header: true }, person],
  },
  {
    key: "design_pass",
    tool: "/design-management",
    title: "A villa, passed on to a later stage",
    description: `Marks the stage a villa sits at (the furthest board stage started) Done and starts a later board stage with the people picked, with a note for them; only the stage it sits at passes on. ${PEOPLE}`,
    lines: { noun: "Pass" },
    fields: [
      { ...villa, header: true },
      { ...stage, key: "from_stage_id", label: "From", header: true },
      { ...stage, key: "to_stage_id", label: "To", header: true },
      { key: "note", label: "Note for them", kind: "text", optional: true, header: true },
      person,
    ],
  },
  {
    key: "design_set_where",
    tool: "/design-management",
    title: "A villa already under way, set where it is",
    description: `Brings in a villa with no design stage started: the board stage it has reached starts with these people, and every board stage before it is marked Done. ${PEOPLE}`,
    lines: { noun: "Villa" },
    fields: [{ ...villa, header: true }, { ...stage, header: true }, person],
  },
  {
    key: "design_step_status",
    tool: "/design-management",
    title: "A villa's design stage, its status",
    description:
      "Sets a started stage's status on a villa: working, with_client, waiting (on others), done, revising (sent back for revision, with the reason; the villa stays where it sits) or not_started (the start taken back, for one started by mistake). A stage not started yet is started with design_stage_start.",
    fields: [
      villa,
      stage,
      {
        key: "status",
        label: "Status",
        kind: "choice",
        choices: Object.keys(STATUS_LABELS),
        labels: STATUS_LABELS,
      },
      { key: "reason", label: "Why it goes back", kind: "text", optional: true },
    ],
    check: (values) =>
      values.status === "revising" && !values.reason
        ? "Say why it is going back for revision."
        : values.status !== "revising" && values.reason
          ? "A reason goes only with sending a stage back for revision."
          : undefined,
  },
  {
    key: "design_step_note",
    tool: "/design-management",
    title: "A villa's design stage, its note",
    description:
      "Replaces the one-line note on a started stage of a villa (what it is waiting for, what was agreed); given empty, it clears it.",
    fields: [villa, stage, { key: "note", label: "Note", kind: "text", optional: true }],
    check: (values) => ("note" in values ? undefined : "Give the note, or empty to clear it."),
  },
  {
    key: "design_person_on",
    tool: "/design-management",
    title: "Someone put on a villa's design stage",
    description:
      "Puts a person holding Design Management on a started stage of a villa; one row per person.",
    fields: [villa, stage, person],
  },
  {
    key: "design_person_off",
    tool: "/design-management",
    title: "Someone taken off a villa's design stage",
    description: "Takes a person off a started stage of a villa; one row per person.",
    fields: [villa, stage, person],
  },
  {
    key: "design_action_new",
    tool: "/design-management",
    title: "A design action",
    description:
      "Adds an action for the design team: what needs to happen, its owner (owner_id, someone holding Design Management), and optionally a villa (left out, general), a board stage and a date.",
    adds: true,
    fields: [
      { ...villa, optional: true },
      { ...stage, optional: true },
      { key: "action", label: "What", kind: "text" },
      { key: "owner_id", label: "Owner", kind: "id", table: "profiles" },
      { key: "due_on", label: "By", kind: "date", optional: true },
    ],
  },
  {
    key: "design_action_change",
    tool: "/design-management",
    title: "A design action, changed",
    description:
      "Changes a design action: its words, owner (someone holding Design Management), date, notes, villa (empty makes it general), board stage (empty clears it) or status — open, waiting_client, waiting_management or done (an admin closes it directly, or opens it again). Each left out stays as it is.",
    fields: [
      action,
      { key: "action", label: "What", kind: "text", optional: true, keep: true },
      {
        key: "owner_id",
        label: "Owner",
        kind: "id",
        table: "profiles",
        optional: true,
        keep: true,
      },
      { key: "due_on", label: "By", kind: "date", optional: true },
      { key: "notes", label: "Notes", kind: "text", optional: true, max: 4000 },
      { ...villa, optional: true },
      { ...stage, optional: true },
      {
        key: "status",
        label: "Status",
        kind: "choice",
        choices: ["open", "waiting_client", "waiting_management", "done"],
        optional: true,
        keep: true,
      },
    ],
  },
  {
    key: "design_action_delete",
    tool: "/design-management",
    title: "A design action, deleted",
    description:
      "Deletes a design action added by mistake, only while nobody has changed it since it was added; otherwise it is cancelled (design_action_cancel).",
    fields: [action],
  },
  {
    key: "design_action_cancel",
    tool: "/design-management",
    title: "A design action, cancelled",
    description:
      "Cancels a design action for good, with the reason; it is closed as done and stays among the done, struck through.",
    fields: [action, { key: "reason", label: "Why", kind: "text" }],
  },
  {
    key: "design_stage_new",
    tool: "/design-management",
    title: "A design stage",
    description:
      "Adds a stage to Design Management's stage list, placed at the end unless at_start or after_stage_id says otherwise. It starts on the board and in use; design_stage_change gives it a short code.",
    adds: true,
    fields: [{ key: "name", label: "Name", kind: "text", max: 120 }, ...placed],
    check: onePlace,
  },
  {
    key: "design_stage_change",
    tool: "/design-management",
    title: "A design stage, changed",
    description:
      "Renames a design stage (every transmittal carrying it follows), gives its short code (letters or digits, up to six, as in sheet names: WD), puts it in or out of use, or on or off the board (off hides its column and keeps every step). Each left out stays as it is.",
    fields: [
      { ...stage, record: true },
      { key: "name", label: "Name", kind: "text", optional: true, keep: true, max: 120 },
      { key: "code", label: "Code", kind: "text", optional: true, keep: true, max: 6 },
      { key: "is_active", label: "In use", kind: "yesno", optional: true },
      { key: "on_board", label: "On the board", kind: "yesno", optional: true },
    ],
    check: (values) =>
      ["name", "code", "is_active", "on_board"].some((key) => key in values)
        ? undefined
        : "Say what changes on the stage.",
  },
  {
    key: "design_stage_move",
    tool: "/design-management",
    title: "A design stage, moved in the list",
    description:
      "Moves a stage to the start of the list (at_start true) or after another stage (after_stage_id); the board's columns run in this order.",
    fields: [{ ...stage, record: true }, ...placed],
    check: (values) =>
      onePlace(values) ??
      (values.at_start === true || values.after_stage_id
        ? undefined
        : "Say where it goes: at_start, or after_stage_id."),
  },
  {
    key: "design_transmittal_new",
    tool: "/design-management",
    title: "A transmittal, started",
    description:
      "Starts a draft transmittal for a villa: one stage in use and one drawing set of that stage — one of this villa's sets (set_id: its next revision, or the draft no transmittal carries) or a new one by name (set_name). The number is given when it is issued. Its note, revision, what changed and WorkDrive link follow with design_transmittal_change.",
    adds: true,
    fields: [
      villa,
      stage,
      { key: "set_id", label: "Drawing set", kind: "id", table: "drawing_sets", optional: true },
      { key: "set_name", label: "New set", kind: "text", optional: true, max: 120 },
    ],
    check: (values) =>
      Boolean(values.set_id) === Boolean(values.set_name)
        ? "Give one: set_id for one of the villa's sets, or set_name for a new one."
        : undefined,
  },
  {
    key: "design_transmittal_change",
    tool: "/design-management",
    title: "A draft transmittal, changed",
    description:
      "Changes a draft transmittal: the note for site, its revision number (only up, above every revision the set already has on this villa, up to 99), what changed (needed from R1 to issue), and the drawings — a WorkDrive share link (https://workdrive.zohoexternal.com/external/…), whose folder is read for its sheets; empty takes it off. Each left out stays as it is. An issued transmittal never changes.",
    fields: [
      transmittal,
      { key: "note", label: "Note for site", kind: "text", optional: true, max: 1000 },
      { key: "revision_no", label: "Revision", kind: "whole", optional: true, keep: true },
      { key: "what_changed", label: "What changed", kind: "text", optional: true, max: 4000 },
      { key: "drawings_url", label: "WorkDrive link", kind: "text", optional: true },
    ],
    check: (values) =>
      ["note", "revision_no", "what_changed", "drawings_url"].some((key) => key in values)
        ? undefined
        : "Say what changes on the transmittal.",
  },
  {
    key: "design_transmittal_works",
    tool: "/design-management",
    title: "A draft transmittal's works",
    description:
      "Sets which works (work_items) a draft transmittal's drawings cover: one row per work, and the rows are the complete new list, replacing the ticks.",
    lines: { noun: "Transmittal" },
    fields: [
      { ...transmittal, header: true },
      { key: "work_item_id", label: "Work", kind: "id", table: "work_items" },
    ],
  },
  {
    key: "design_transmittal_issue",
    tool: "/design-management",
    title: "A transmittal, issued to site",
    description:
      "Issues a draft transmittal: its drawings are released to site, the set's earlier release is superseded, and it takes its TB number. It needs a WorkDrive link (or uploaded sheets), and from R1 what changed. Once issued it never changes and cannot be deleted.",
    fields: [transmittal],
  },
  {
    key: "design_transmittal_delete",
    tool: "/design-management",
    title: "A draft transmittal, deleted",
    description:
      "Deletes a draft transmittal raised by mistake, with its draft drawing revision; the WorkDrive folder is never touched. An issued one cannot be deleted.",
    fields: [transmittal],
  },
]);
