/** The Estimator's villa estimates: the working estimate, its works, measurement sheets and this villa's own rates, made official or withdrawn, through its own saves. */
import type { Field } from "../catalogue-fields";
import { defineEntries } from "./define";

const estimate: Field = {
  key: "estimate_id",
  label: "Estimate",
  kind: "id",
  table: "estimator_estimates",
  record: true,
};
const line: Field = {
  key: "line_id",
  label: "Work on the estimate",
  kind: "id",
  table: "estimator_estimate_lines",
  record: true,
};
const row: Field = {
  key: "row_id",
  label: "Measurement row",
  kind: "id",
  table: "estimator_estimate_line_measurements",
  record: true,
};
const box = (key: string, label: string): Field => ({
  key,
  label,
  kind: "amount",
  optional: true,
  fine: true,
});
const BOXES = [
  { key: "description", label: "Description", kind: "text", optional: true, max: 2000 },
  box("nos", "Nos"),
  box("length", "Length"),
  box("breadth", "Breadth"),
  box("depth", "Depth"),
  { key: "deduct", label: "Deduct", kind: "yesno", optional: true },
] satisfies Field[];
const target: Field[] = [
  { key: "item_id", label: "Material", kind: "id", table: "items", optional: true },
  { key: "mix_id", label: "Mix", kind: "id", table: "estimator_mixes", optional: true },
];
const oneTarget = (values: Record<string, unknown>) =>
  Boolean(values.item_id) === Boolean(values.mix_id)
    ? "Give one: item_id for a material, or mix_id for a mix."
    : undefined;
const DRAFT =
  "Only a draft changes: the villa's working estimate (estimator_estimates.is_working) or an older draft; an official one is frozen.";
const SET_UP =
  "Only for a work set up in the rate book (it has a unit); one not set up is set up first (est_work_setup).";

/** A box given is above zero, as the Estimator's sheet takes it; a blank box is simply not used. */
const boxesRefused = (values: Record<string, unknown>) =>
  ["nos", "length", "breadth", "depth"].some(
    (key) => values[key] !== undefined && values[key] !== "" && !(Number(values[key]) > 0),
  )
    ? "A box is more than zero, or left blank."
    : undefined;

export type SheetRow = {
  nos: number | null;
  length: number | null;
  breadth: number | null;
  depth: number | null;
  deduct: boolean;
};

/**
 * The Estimator's sheet total, restated (Turing may not import its arithmetic): each row the product
 * of its boxes given, a deduction taken off, rounded to six decimals.
 */
export function sheetTotal(rows: readonly SheetRow[]): number {
  const round = (value: number) => Math.round(value * 1e6) / 1e6;
  return round(
    rows.reduce((sum, row) => {
      const boxes = [row.nos, row.length, row.breadth, row.depth].filter(
        (value): value is number => value !== null,
      );
      const measured = boxes.length === 0 ? 0 : round(boxes.reduce((a, b) => a * b, 1));
      return sum + (row.deduct ? -measured : measured);
    }, 0),
  );
}

export const ESTIMATOR_ESTIMATES = defineEntries([
  {
    key: "est_estimate_start",
    tool: "/estimator",
    title: "A villa's working estimate",
    description:
      "Starts the working estimate of a villa (units.id) that has none: blank, or from another estimate (source_estimate_id: this villa's official one, or another villa's working or official one). From another villa it brings the works to measure; everything true also brings the quantities, measurement sheets and that estimate's own rates and materials — true if left out when starting from this villa's own official. A name is optional (the villa's, if left out).",
    adds: true,
    form: { file: "lib/estimator/estimate-actions.ts", reader: "startVillaEstimate", ticked: "on" },
    fields: [
      { key: "unit_id", label: "Villa", kind: "id", table: "units" },
      {
        key: "source_estimate_id",
        label: "Start from",
        kind: "id",
        table: "estimator_estimates",
        optional: true,
      },
      { key: "everything", label: "Copy everything", kind: "yesno", optional: true },
      { key: "name", label: "Name", kind: "text", optional: true, max: 120 },
    ],
  },
  {
    key: "est_estimate_change",
    tool: "/estimator",
    title: "An estimate's name or note",
    description: `Changes an estimate's name or note. ${DRAFT} Each left out stays as it is.`,
    form: { file: "lib/estimator/estimate-actions.ts", reader: "updateEstimate" },
    fields: [
      estimate,
      { key: "name", label: "Name", kind: "text", optional: true, keep: true, max: 120 },
      { key: "note", label: "Note", kind: "text", optional: true, max: 2000 },
    ],
    check: (values) =>
      "name" in values || "note" in values ? undefined : "Say what changes on the estimate.",
  },
  {
    key: "est_estimate_delete",
    tool: "/estimator",
    title: "A draft estimate, discarded",
    description:
      "Deletes a draft estimate with its works, measurement sheets and rates: the villa's working estimate (Discard) or an older draft. An official one is withdrawn instead.",
    fields: [estimate],
  },
  {
    key: "est_estimate_withdraw",
    tool: "/estimator",
    title: "An official estimate, withdrawn",
    description:
      "Withdraws a villa's official estimate for good, with the reason, while no indent that isn't cancelled draws on it; the villa then has no official estimate until its working one is made official again.",
    fields: [estimate, { key: "reason", label: "Why", kind: "text", max: 2000 }],
  },
  {
    key: "est_estimate_official",
    tool: "/estimator",
    title: "A working estimate, made official",
    description:
      "Makes a villa's working estimate official: a numbered, frozen copy (EST/…) the stores and site check against, replacing the villa's earlier official one; the working estimate stays open. Refused while any work is still to measure, or the estimate has no works.",
    fields: [estimate],
  },
  {
    key: "est_works_add",
    tool: "/estimator",
    title: "Works put on an estimate",
    description: `Puts works (work_items, active; set up in the rate book or not) on a draft estimate, one row per work; the rows of one estimate are one save. They arrive to measure. ${DRAFT}`,
    lines: { noun: "Estimate" },
    fields: [
      { ...estimate, header: true },
      { key: "work_item_id", label: "Work", kind: "id", table: "work_items" },
    ],
  },
  {
    key: "est_line_qty",
    tool: "/estimator",
    title: "A work's quantity on an estimate",
    description: `Types a work's quantity on a draft estimate, in the work's unit; empty puts it back to measure. A work with a measurement sheet takes its quantity from the sheet's rows instead. ${DRAFT}`,
    fields: [line, box("qty", "Quantity")],
    check: (values) =>
      "qty" in values ? undefined : "Give the quantity, or empty to measure it later.",
  },
  {
    key: "est_line_remove",
    tool: "/estimator",
    title: "A work taken off an estimate",
    description: `Takes a work off a draft estimate, with its measurement sheet and this villa's own materials for it. ${DRAFT}`,
    fields: [line],
  },
  {
    key: "est_line_labour",
    tool: "/estimator",
    title: "This villa's labour rate for a work",
    description: `Sets this villa's own labour rate in ₹ per unit for a work on a draft estimate (0 is a real rate); empty follows the rate book. ${SET_UP} ${DRAFT}`,
    fields: [
      line,
      { key: "labour_rate", label: "Labour ₹ per unit", kind: "amount", optional: true },
    ],
    check: (values) =>
      "labour_rate" in values ? undefined : "Give the rate, or empty to follow the rate book.",
  },
  {
    key: "est_line_material",
    tool: "/estimator",
    title: "This villa's materials for a work: how much",
    description: `Sets how much of a material (item_id, items of kind material, active) or a mix (mix_id, active) one unit of a work on a draft estimate uses for this villa — added if the work's list doesn't have it, changed if it does. The first change copies the rate book's list onto the work for this villa; it follows the rate book until then. ${SET_UP} ${DRAFT}`,
    fields: [
      line,
      ...target,
      { key: "qty_per_unit", label: "Per unit", kind: "amount", fine: true },
    ],
    check: oneTarget,
  },
  {
    key: "est_line_material_swap",
    tool: "/estimator",
    title: "This villa's materials for a work: one swapped",
    description: `Swaps a material or mix in a work's list for this villa (item_id or mix_id) for another (to_item_id or to_mix_id), keeping its quantity — a finish chosen for this villa. ${SET_UP} ${DRAFT}`,
    fields: [
      line,
      ...target,
      { key: "to_item_id", label: "Instead, material", kind: "id", table: "items", optional: true },
      {
        key: "to_mix_id",
        label: "Instead, mix",
        kind: "id",
        table: "estimator_mixes",
        optional: true,
      },
    ],
    check: (values) =>
      oneTarget(values) ??
      (Boolean(values.to_item_id) === Boolean(values.to_mix_id)
        ? "Give one to swap in: to_item_id or to_mix_id."
        : undefined),
  },
  {
    key: "est_line_material_remove",
    tool: "/estimator",
    title: "This villa's materials for a work: one taken out",
    description: `Takes a material or mix out of a work's list for this villa; taking out the last one puts the work back on the rate book's list, so a work cannot be made labour-only this way. ${SET_UP} ${DRAFT}`,
    fields: [line, ...target],
    check: oneTarget,
  },
  {
    key: "est_line_reset",
    tool: "/estimator",
    title: "A work back on the rate book's materials",
    description: `Drops this villa's own list of materials for a work, so it follows the rate book again. ${SET_UP} ${DRAFT}`,
    fields: [line],
  },
  {
    key: "est_item_price",
    tool: "/estimator",
    title: "This villa's price for a material",
    description: `Sets this villa's own price in ₹ per unit for a material its estimate uses (one price per estimate, so every work agrees); empty goes back to the Masters price. Only for materials of works set up in the rate book. ${DRAFT}`,
    fields: [
      estimate,
      { key: "item_id", label: "Material", kind: "id", table: "items", record: true },
      { key: "rate", label: "₹ per unit", kind: "amount", optional: true },
    ],
    check: (values) =>
      "rate" in values ? undefined : "Give the price, or empty for the Masters price.",
  },
  {
    key: "est_measure_add",
    tool: "/estimator",
    title: "A measurement row",
    description: `Adds a row to a work's measurement sheet on a draft estimate: a description and Nos × Length × Breadth × Depth (each box given is above zero; a blank box is not used); deduct true takes it off the total (a door or window in a wall), and a sheet never totals zero or less, so give the measured rows before their deductions. The work's quantity becomes the sheet's total, in the work's unit — nothing converts, so measure in that unit. ${DRAFT}`,
    adds: true,
    fields: [line, ...BOXES],
    check: boxesRefused,
  },
  {
    key: "est_measure_change",
    tool: "/estimator",
    title: "A measurement row, changed",
    description: `Changes a typed row of a measurement sheet (a row from the SketchUp model changes in the model); each left out stays as it is, a box given empty is not used. ${DRAFT}`,
    fields: [row, ...BOXES],
    check: boxesRefused,
  },
  {
    key: "est_measure_remove",
    tool: "/estimator",
    title: "A measurement row, removed",
    description: `Removes a typed row from a measurement sheet. ${DRAFT}`,
    fields: [row],
  },
  {
    key: "est_measure_duplicate",
    tool: "/estimator",
    title: "A measurement row, duplicated",
    description: `Copies a typed row onto the end of its own sheet. ${DRAFT}`,
    fields: [row],
  },
  {
    key: "est_measure_copy",
    tool: "/estimator",
    title: "A work's measurement rows, copied to another work",
    description: `Copies every row of one work's sheet onto another work of the same draft estimate (a wall's rows feed masonry, plaster and paint), as typed rows; nothing converts, so only between works measured alike. ${DRAFT}`,
    fields: [
      { ...line, key: "from_line_id", label: "From" },
      { ...line, key: "to_line_id", label: "To" },
    ],
  },
]);
