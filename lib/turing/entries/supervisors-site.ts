/** The rest of Supervisors: material requests, checklists and their templates, the site sequence, and what reached site. */
import { WORK_CLASSES } from "@/lib/masters/work-classes";

import type { Field, Value } from "../catalogue-fields";
import { defineEntries } from "./define";

const FILE = "lib/supervisors/checklist-actions.ts";

const plot: Field = { key: "plot_id", label: "Villa", kind: "id", table: "plots" };
const stage: Field = { key: "group_id", label: "Stage", kind: "id", table: "work_groups" };
const checklist: Field = {
  key: "checklist_id",
  label: "Checklist",
  kind: "id",
  table: "site_checklists",
  record: true,
};
const template: Field = {
  key: "template_id",
  label: "Checklist",
  kind: "id",
  table: "checklist_templates",
};
const note: Field = { key: "note", label: "Note", kind: "text", optional: true };

const anyOf =
  (keys: string[], ask: string) =>
  (values: Record<string, Value>): string | undefined =>
    keys.some((key) => key in values) ? undefined : ask;

/** Supervisors' check answers, as `CHECK_STATUSES` in lib/supervisors/checklists.ts has them, and back to unanswered (a test holds the two together). */
export const CHECK_ANSWERS = ["pass", "fail", "na"] as const;

/** What arrived, line by line, as the site's dialog sends it: every line of the delivery, none twice. */
export function receivedFor(
  sent: { id: string; quantity: number }[],
  given: { lineId: string; received: number }[],
): { received: Record<string, number> } | { error: string } {
  const received: Record<string, number> = {};
  for (const line of given) {
    if (!sent.some((one) => one.id === line.lineId))
      return { error: "One of those lines is not on this delivery." };
    if (line.lineId in received) return { error: "A line is given twice." };
    received[line.lineId] = line.received;
  }
  const missing = sent.filter((one) => !(one.id in received)).length;
  if (missing > 0)
    return {
      error: `Give what arrived on every line — ${missing} of ${sent.length} ${missing === 1 ? "is" : "are"} missing (0 if none came).`,
    };
  return { received };
}

const confirmLines = (doc: Field, line: Field): Field[] => [
  { ...doc, header: true },
  { ...note, label: "Why short", header: true },
  line,
  { key: "received", label: "Arrived", kind: "amount" },
];

export const SUPERVISORS_SITE = defineEntries([
  {
    key: "sup_request_new",
    tool: "/supervisors",
    title: "Material asked of the store",
    description:
      "A supervisor's request to the store for material for a villa's work: the work (an active works-list work), the material (an active catalogue item) and the quantity in its unit, above zero. Work class is standard unless it is for additional work or rework. If the villa's official estimate lists other materials for that work, off_estimate_reason says why this one is needed.",
    adds: true,
    form: { file: "lib/supervisors/actions.ts", reader: "createIssueRequest" },
    fields: [
      plot,
      { key: "work_item_id", label: "Work", kind: "id", table: "work_items" },
      { key: "item_id", label: "Material", kind: "id", table: "items" },
      { key: "quantity", label: "Quantity", kind: "amount" },
      {
        key: "work_class",
        label: "Work class",
        kind: "choice",
        optional: true,
        choices: WORK_CLASSES,
        labels: { standard: "Standard work", additional: "Additional work", rework: "Rework" },
        start: "standard",
      },
      { ...note, label: "Note for the store" },
      { key: "off_estimate_reason", label: "Why it is needed", kind: "text", optional: true },
    ],
  },
  {
    key: "sup_request_withdraw",
    tool: "/supervisors",
    title: "A material request, withdrawn",
    description:
      "Withdraws a request the store has not answered yet (issue_requests, status requested).",
    fields: [
      { key: "request_id", label: "Request", kind: "id", table: "issue_requests", record: true },
    ],
  },
  {
    key: "sup_checklist_start",
    tool: "/supervisors",
    title: "A site checklist, started",
    description:
      "Starts a checklist on a villa from a switched-on checklist template with checks in it, every check unanswered. work_group_id is the stage it inspects, only for a template set to inspect that stage and only when no checklist of that stage is open on the villa; left out, it is the villa's own.",
    adds: true,
    form: { file: FILE, reader: "startChecklist" },
    fields: [
      plot,
      template,
      { ...stage, key: "work_group_id", optional: true },
      { key: "location", label: "Location or floor", kind: "text", optional: true },
      { key: "drawing_revision", label: "Drawing and revision", kind: "text", optional: true },
    ],
  },
  {
    key: "sup_checklist_details",
    tool: "/supervisors",
    title: "A checklist's details",
    description:
      "An open checklist's location, drawing and revision, the day the work finished and the day it was inspected, and a note. Empty clears one.",
    check: anyOf(
      ["location", "drawing_revision", "finished_on", "inspected_on", "note"],
      "Say what changes on the checklist.",
    ),
    fields: [
      checklist,
      { key: "location", label: "Location or floor", kind: "text", optional: true },
      { key: "drawing_revision", label: "Drawing and revision", kind: "text", optional: true },
      { key: "finished_on", label: "Work finished", kind: "date", optional: true },
      { key: "inspected_on", label: "Inspected", kind: "date", optional: true },
      { ...note, max: 2000 },
    ],
  },
  {
    key: "sup_checklist_answer",
    tool: "/supervisors",
    title: "A check, answered",
    description:
      "Answers one check of an open checklist (site_checklist_items): pass, fail or na, or not_checked to take the answer back, and remarks — a fail or N/A needs remarks before the checklist can be signed off.",
    check: anyOf(["status", "remarks"], "Give the answer or the remarks."),
    fields: [
      { key: "item_id", label: "Check", kind: "id", table: "site_checklist_items", record: true },
      {
        key: "status",
        label: "Answer",
        kind: "choice",
        optional: true,
        keep: true,
        choices: [...CHECK_ANSWERS, "not_checked"],
        labels: { pass: "Pass", fail: "Fail", na: "N/A", not_checked: "Not checked" },
      },
      { key: "remarks", label: "Remarks", kind: "text", optional: true, max: 2000 },
    ],
  },
  {
    key: "sup_checklist_sign_off",
    tool: "/supervisors",
    title: "A checklist, signed off",
    description:
      "Signs off an open checklist: every check answered, with remarks on each fail and N/A. Signed off, it never changes.",
    fields: [checklist],
  },
  {
    key: "sup_checklist_delete",
    tool: "/supervisors",
    title: "A checklist, deleted",
    description:
      "Deletes an open checklist started by mistake, with its answers. A signed-off checklist is a record and is never deleted.",
    fields: [checklist],
  },
  {
    key: "sup_template_new",
    tool: "/supervisors",
    title: "A checklist template, added",
    description:
      "Adds a checklist template, empty: put checks in it with sup_template_check_add and the stages it inspects with sup_template_stage. work_refs names the works it covers, as text.",
    adds: true,
    form: { file: FILE, reader: "createChecklistTemplate" },
    fields: [
      { key: "name", label: "Name", kind: "text", max: 120 },
      { key: "work_refs", label: "Works", kind: "text", optional: true },
      note,
    ],
  },
  {
    key: "sup_template_change",
    tool: "/supervisors",
    title: "A checklist template, changed",
    description: "Renames a checklist template, or changes the works it names or its note.",
    check: anyOf(["name", "work_refs", "note"], "Say what changes on the template."),
    form: { file: FILE, reader: "updateChecklistTemplate", ignored: ["id"] },
    fields: [
      { ...template, record: true },
      { key: "name", label: "Name", kind: "text", optional: true, keep: true, max: 120 },
      { key: "work_refs", label: "Works", kind: "text", optional: true },
      note,
    ],
  },
  {
    key: "sup_template_active",
    tool: "/supervisors",
    title: "A checklist template, switched on or off",
    description:
      "Switches a checklist template off (no new checklist starts from it; past ones keep it) or back on.",
    fields: [
      { ...template, record: true },
      { key: "active", label: "Switched on", kind: "yesno" },
    ],
  },
  {
    key: "sup_template_check_add",
    tool: "/supervisors",
    title: "A check, added to a template",
    description:
      "Adds a check at the end of a checklist template. A check is never reworded once in use: switch the old one off and add the new wording.",
    adds: true,
    fields: [
      { ...template, record: true },
      { key: "text", label: "Check", kind: "text" },
    ],
  },
  {
    key: "sup_template_check_active",
    tool: "/supervisors",
    title: "A template's check, switched on or off",
    description:
      "Switches one check of a template off (new checklists leave it out; past answers keep it) or back on.",
    fields: [
      {
        key: "check_id",
        label: "Check",
        kind: "id",
        table: "checklist_template_items",
        record: true,
      },
      { key: "active", label: "Switched on", kind: "yesno" },
    ],
  },
  {
    key: "sup_template_stage",
    tool: "/supervisors",
    title: "A stage a checklist inspects",
    description:
      "Sets whether a checklist template inspects a stage of the site sequence (an active work group): a working stage offers the checklist, and Done asks once if it is unsigned.",
    fields: [
      { ...template, record: true },
      stage,
      { key: "inspects", label: "Inspects", kind: "yesno" },
    ],
  },
  {
    key: "sup_sequence_follows",
    tool: "/supervisors",
    title: "What a stage follows in the site sequence",
    description:
      "For every villa: the stage of the site sequence a stage follows (empty: none, it is a villa's first) and how — after it, or alongside it.",
    check: anyOf(["follows_group_id", "link"], "Say what it follows, or how."),
    fields: [
      stage,
      {
        key: "follows_group_id",
        label: "Follows",
        kind: "id",
        table: "work_groups",
        optional: true,
      },
      {
        key: "link",
        label: "How",
        kind: "choice",
        optional: true,
        keep: true,
        choices: ["after", "alongside"],
      },
    ],
  },
  {
    key: "sup_sequence_move",
    tool: "/supervisors",
    title: "A stage, moved in the site sequence's list",
    description:
      "Swaps a stage with the one above (up) or below (down) in the site sequence's list; the dates come from what each follows, not the order.",
    fields: [stage, { key: "direction", label: "Move", kind: "choice", choices: ["up", "down"] }],
  },
  {
    key: "sup_sequence_add",
    tool: "/supervisors",
    title: "A stage, added to the site sequence",
    description:
      "Adds an active work group not yet in the site sequence at the end, following the last stage.",
    adds: true,
    fields: [stage],
  },
  {
    key: "sup_sequence_remove",
    tool: "/supervisors",
    title: "A stage, taken out of the site sequence",
    description:
      "Takes a stage out of the site sequence; the stages that followed it follow what it followed.",
    fields: [stage],
  },
  {
    key: "sup_typical_sqft",
    tool: "/supervisors",
    title: "The typical villa's size",
    description:
      "The villa size in sqft the sequence's typical days are for; empty takes the typical days as they are, unscaled.",
    check: (values) =>
      "sqft" in values ? undefined : "Give the size, or empty to use the days unscaled.",
    fields: [{ key: "sqft", label: "Size (sqft)", kind: "amount", optional: true }],
  },
  {
    key: "sup_issue_confirm",
    tool: "/supervisors",
    title: "What reached site, from the store",
    description:
      "The site's confirmation of an issue from a store to a villa (stock_issues with a villa): one row per line of the issue (stock_issue_lines of it), every line, with what arrived — at most what was sent, 0 if none came. Anything short needs why.",
    lines: { noun: "Confirmation" },
    fields: confirmLines(
      { key: "issue_id", label: "Issue", kind: "id", table: "stock_issues" },
      { key: "line_id", label: "Line", kind: "id", table: "stock_issue_lines" },
    ),
  },
  {
    key: "sup_receipt_confirm",
    tool: "/supervisors",
    title: "What reached site, from a vendor",
    description:
      "The site's confirmation of a vendor's delivery straight to a villa (goods_receipts to site): one row per line of the delivery (goods_receipt_lines of it), every line, with what arrived — at most what was sent, 0 if none came. Anything short needs why.",
    lines: { noun: "Confirmation" },
    fields: confirmLines(
      { key: "receipt_id", label: "Delivery", kind: "id", table: "goods_receipts" },
      { key: "line_id", label: "Line", kind: "id", table: "goods_receipt_lines" },
    ),
  },
]);
