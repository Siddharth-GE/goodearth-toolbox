/** Indents: a site's request for materials, with its lines, through Indents' own saves. Quantities only, never prices. */
import type { Field } from "../catalogue-fields";
import { defineEntries } from "./define";

const indent: Field = {
  key: "indent_id",
  label: "Indent",
  kind: "id",
  table: "indents",
  record: true,
};
const line: Field = {
  key: "line_id",
  label: "Line",
  kind: "id",
  table: "indent_lines",
  record: true,
};
const item: Field = { key: "item_id", label: "Item", kind: "id", table: "items" };
const quantity: Field = { key: "quantity", label: "Quantity", kind: "amount" };
const reason: Field = {
  key: "reason",
  label: "Why, if off the estimate",
  kind: "text",
  optional: true,
};

const LINES =
  "Each line is an item and a quantity in the item's own Masters unit. An item on the villa's official estimate is filed against it; any other is outside the estimate and needs a reason (why it is needed), which the estimator answers before the indent can be approved. The same item twice is one line, its quantities added.";

export const INDENTS = defineEntries([
  {
    key: "indent_new",
    tool: "/indents",
    title: "An indent, raised",
    description: `Raises an indent for a villa (plot_id), or a general one with none, in a project with a short code. ${LINES} submit true sends it for approval once made; otherwise it stays a draft to look over.`,
    adds: true,
    lines: { noun: "Indent" },
    fields: [
      { key: "project_id", label: "Project", kind: "id", table: "projects", header: true },
      { key: "plot_id", label: "Villa", kind: "id", table: "plots", optional: true, header: true },
      {
        key: "work_item_id",
        label: "For the work",
        kind: "id",
        table: "work_items",
        optional: true,
        header: true,
      },
      { key: "required_by", label: "Needed by", kind: "date", optional: true, header: true },
      {
        key: "is_urgent",
        label: "Urgent",
        kind: "yesno",
        optional: true,
        start: false,
        header: true,
      },
      { key: "note", label: "Note", kind: "text", optional: true, header: true },
      {
        key: "submit",
        label: "Send for approval",
        kind: "yesno",
        optional: true,
        start: false,
        header: true,
      },
      item,
      quantity,
      reason,
    ],
  },
  {
    key: "indent_lines_add",
    tool: "/indents",
    title: "Lines added to an indent",
    description: `Adds lines to a draft indent (indents.status draft, or rejected and being reworked). ${LINES}`,
    adds: true,
    lines: { noun: "Indent" },
    fields: [{ ...indent, header: true }, item, quantity, reason],
  },
  {
    key: "indent_change",
    tool: "/indents",
    title: "An indent, changed",
    description: "Changes a draft indent's work, needed-by date, note or urgent mark.",
    fields: [
      indent,
      {
        key: "work_item_id",
        label: "For the work",
        kind: "id",
        table: "work_items",
        optional: true,
      },
      { key: "required_by", label: "Needed by", kind: "date", optional: true },
      { key: "note", label: "Note", kind: "text", optional: true },
      { key: "is_urgent", label: "Urgent", kind: "yesno", optional: true },
    ],
  },
  {
    key: "indent_line_change",
    tool: "/indents",
    title: "An indent line, changed",
    description:
      "Changes a line on a draft indent (indent_lines.id): its quantity, note, or the reason a line outside the estimate is needed. A change clears the estimator's earlier answer.",
    fields: [
      line,
      { ...quantity, optional: true, keep: true },
      { key: "note", label: "Note", kind: "text", optional: true },
      reason,
    ],
  },
  {
    key: "indent_line_remove",
    tool: "/indents",
    title: "An indent line, removed",
    description: "Removes a line from a draft indent.",
    fields: [line],
  },
  {
    key: "indent_submit",
    tool: "/indents",
    title: "An indent, sent for approval",
    description:
      "Sends a draft indent for approval. Refused while it has no lines, or a line outside the estimate has no reason.",
    fields: [indent],
  },
  {
    key: "indent_delete",
    tool: "/indents",
    title: "A draft indent, deleted",
    description:
      "Deletes a draft indent; its number stays used. Anything past draft is cancelled instead.",
    fields: [indent],
  },
  {
    key: "indent_cancel",
    tool: "/indents",
    title: "An indent, cancelled",
    description:
      "Cancels a submitted or approved indent, with the reason why; final. Refused while a live PO orders from it.",
    fields: [indent, { key: "reason", label: "Why", kind: "text" }],
  },
  {
    key: "indent_approve",
    tool: "/indents",
    title: "An indent, approved",
    description:
      "Approves an indent waiting for approval (indents.status submitted), so it can be ordered; whoever raised it hears on their phone. Refused while a line outside the estimate waits for the estimator's answer or was refused by it — send that one back instead.",
    fields: [indent],
  },
  {
    key: "indent_send_back",
    tool: "/indents",
    title: "An indent, sent back",
    description:
      "Sends an indent waiting for approval back to draft, with a note saying what needs changing, which the site team sees at its top.",
    fields: [indent, { key: "note", label: "What needs changing", kind: "text" }],
  },
]);
