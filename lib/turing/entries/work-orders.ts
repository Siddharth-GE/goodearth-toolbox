/** Work orders: a contractor's works and terms, in Bills, through Bills' own saves. */
import type { Field, Value } from "../catalogue-fields";
import { defineEntries } from "./define";

type Values = Record<string, Value>;

/** A work as the work order editor sends it (Bills' own shape, which Turing may not import). */
export type WorkOrderLineInput = {
  workItemId: string | null;
  description: string;
  isLumpSum: boolean;
  quantity: number | null;
  uom: string | null;
  rate: number | null;
};

const order: Field = {
  key: "work_order_id",
  label: "Work order",
  kind: "id",
  table: "labour_contracts",
  record: true,
};
const orderLine: Field = {
  key: "line_id",
  label: "Work",
  kind: "id",
  table: "labour_contract_lines",
  record: true,
};
const work: Field = {
  key: "work_item_id",
  label: "Work",
  kind: "id",
  table: "work_items",
  optional: true,
};
const lineDescription: Field = {
  key: "line_description",
  label: "Description",
  kind: "text",
  optional: true,
};
const lumpSum: Field = { key: "lump_sum", label: "Lump sum", kind: "yesno", optional: true };
const quantity: Field = { key: "quantity", label: "Quantity", kind: "amount", optional: true };
const uom: Field = { key: "uom", label: "Unit", kind: "text", optional: true, max: 40 };
const rate: Field = { key: "rate", label: "Rate", kind: "amount", optional: true };
const terms: Field = { key: "terms", label: "Terms", kind: "text", optional: true, max: 8000 };

const WORKS =
  "One row per work: a work from the works list (work_item_id), or a description alone. A work brings its name, and its unit and labour rate from the rate book, unless given. A lump sum (lump_sum true) has a rate that is its whole amount and no quantity or unit; any other work needs a quantity above 0, a unit (a uoms name) and a rate.";

/** A rate book work's name, unit and labour rate, as the editor fills a line from them. */
export type BookWork = { name: string; uom: string | null; labour_rate: number | null };

const textOf = (values: Values, key: string) =>
  typeof values[key] === "string" ? String(values[key]).trim() : "";
const numberOf = (values: Values, key: string) => {
  const value = textOf(values, key);
  return value === "" ? null : Number(value);
};

/**
 * A row as the editor's line: what is given, else what is there (`now`, for a change), else what
 * picking the work fills in — its name, and for a work that isn't a lump sum its unit and rate.
 */
export function workLineOf(
  values: Values,
  book: BookWork | undefined,
  now?: WorkOrderLineInput,
): WorkOrderLineInput {
  const isLumpSum = "lump_sum" in values ? values.lump_sum === true : (now?.isLumpSum ?? false);
  const pick = <T>(key: string, read: () => T, fallback: T): T =>
    key in values && textOf(values, key) !== "" ? read() : fallback;
  const description = pick(
    "line_description",
    () => textOf(values, "line_description"),
    now?.description ?? book?.name ?? "",
  );
  if (isLumpSum) {
    return {
      workItemId: now?.workItemId ?? (textOf(values, "work_item_id") || null),
      description,
      isLumpSum,
      quantity: null,
      uom: null,
      rate: pick("rate", () => numberOf(values, "rate"), now?.isLumpSum ? now.rate : null),
    };
  }
  return {
    workItemId: now?.workItemId ?? (textOf(values, "work_item_id") || null),
    description,
    isLumpSum,
    quantity: pick("quantity", () => numberOf(values, "quantity"), now?.quantity ?? null),
    uom: pick("uom", () => textOf(values, "uom"), now?.uom ?? book?.uom ?? null),
    rate: pick(
      "rate",
      () => numberOf(values, "rate"),
      now && !now.isLumpSum ? now.rate : (book?.labour_rate ?? null),
    ),
  };
}

/** The editor hides a lump sum's quantity and unit, so one given would be dropped unsaid. */
function lumpSumCheck(values: Values): string | undefined {
  return values.lump_sum === true && (textOf(values, "quantity") || textOf(values, "uom"))
    ? "A lump sum has no quantity or unit: its rate is the whole amount."
    : undefined;
}

export const WORK_ORDERS = defineEntries([
  {
    key: "work_order_new",
    tool: "/bills",
    title: "A work order",
    description: `A contractor's work order (a vendor marked as a contractor) for a project, or one villa of it, saying what it covers, with its works and terms. Terms left out are the default work-order terms from Masters → Terms; given empty, none. It waits for a bill approver. ${WORKS}`,
    adds: true,
    lines: { noun: "Work order" },
    check: lumpSumCheck,
    fields: [
      { key: "vendor_id", label: "Contractor", kind: "id", table: "vendors", header: true },
      { key: "project_id", label: "Project", kind: "id", table: "projects", header: true },
      { key: "plot_id", label: "Villa", kind: "id", table: "plots", optional: true, header: true },
      { key: "description", label: "Covers", kind: "text", header: true },
      { ...terms, header: true },
      work,
      lineDescription,
      { ...lumpSum, start: false },
      quantity,
      uom,
      rate,
    ],
  },
  {
    key: "work_order_works_add",
    tool: "/bills",
    title: "Works, added to a work order",
    description: `Adds works to a work order waiting for approval. ${WORKS}`,
    adds: true,
    lines: { noun: "Work order" },
    check: lumpSumCheck,
    fields: [
      { ...order, header: true },
      work,
      lineDescription,
      { ...lumpSum, start: false },
      quantity,
      uom,
      rate,
    ],
  },
  {
    key: "work_order_change",
    tool: "/bills",
    title: "A work order, changed",
    description:
      "Changes a work order waiting for approval: its contractor, villa (empty for the whole project), what it covers, or its terms. Its project and number never change; its works stay as they are.",
    fields: [
      order,
      {
        key: "vendor_id",
        label: "Contractor",
        kind: "id",
        table: "vendors",
        optional: true,
        keep: true,
      },
      { key: "plot_id", label: "Villa", kind: "id", table: "plots", optional: true },
      { key: "description", label: "Covers", kind: "text", optional: true, keep: true },
      terms,
    ],
  },
  {
    key: "work_order_works_change",
    tool: "/bills",
    title: "Works on a work order, changed or removed",
    description:
      "Changes or removes works on a work order waiting for approval: one row per work (labour_contract_lines.id of that order), all of one order's rows saved together. remove true takes the work off (an order keeps at least one). Otherwise give what changes: another work from the list (it brings its name, unit and labour rate unless given, as picking it on screen does), the description, whether it is a lump sum, quantity, unit or rate; each left out stays as it is. Ids of an order's works change with every save, so read them afresh before proposing again.",
    lines: { noun: "Work order" },
    check: (values) =>
      values.remove === true &&
      ["work_item_id", "line_description", "lump_sum", "quantity", "uom", "rate"].some(
        (key) => key in values,
      )
        ? "A work being removed takes no changes."
        : lumpSumCheck(values),
    fields: [
      { ...order, header: true },
      orderLine,
      { key: "remove", label: "Remove", kind: "yesno", optional: true },
      work,
      { ...lineDescription, keep: true },
      lumpSum,
      { ...quantity, keep: true },
      { ...uom, keep: true },
      { ...rate, keep: true },
    ],
  },
  {
    key: "work_order_delete",
    tool: "/bills",
    title: "A work order, deleted",
    description:
      "Deletes a work order still waiting for approval, with its works; its number stays used. An approved one is cancelled (work_order_cancel) instead.",
    fields: [order],
  },
  {
    key: "work_order_cancel",
    tool: "/bills",
    title: "A work order, cancelled",
    description:
      "Cancels an approved work order, with the reason, while no bill, advance or cash request names it; final. Only a bill approver or an admin.",
    fields: [order, { key: "reason", label: "Why", kind: "text" }],
  },
  {
    key: "work_order_approve",
    tool: "/bills",
    title: "A work order, approved",
    description:
      "Approves a work order waiting for approval (labour_contracts.status pending_approval); its works, value and terms are permanent after, and while switched on it can be billed and advanced against.",
    fields: [order],
  },
  {
    key: "work_order_active",
    tool: "/bills",
    title: "A work order, switched off or on",
    description:
      "Switches a work order off (it takes no new bills; its bills stay) or back on. Not for a cancelled one.",
    fields: [order, { key: "is_active", label: "On", kind: "yesno" }],
  },
  {
    key: "work_order_template_new",
    tool: "/bills",
    title: "A work order, saved as a template",
    description:
      "Keeps a work order's works and terms, without quantities or rates, as a named template for new orders.",
    fields: [order, { key: "name", label: "Template name", kind: "text", max: 200 }],
  },
  {
    key: "work_order_template_active",
    tool: "/bills",
    title: "A work order template, switched off or on",
    description:
      "Switches a template off (no longer offered) or back on; templates are never deleted.",
    fields: [
      {
        key: "template_id",
        label: "Template",
        kind: "id",
        table: "work_order_templates",
        record: true,
      },
      { key: "is_active", label: "On", kind: "yesno" },
    ],
  },
]);
