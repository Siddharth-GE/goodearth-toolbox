/** The Estimator's rate book: each work's unit, labour rate and materials, the mixes, and the estimator's answer on an indent line, through its own saves. */
import type { Field } from "../catalogue-fields";
import { defineEntries } from "./define";

// The Estimator's ways a SketchUp model measures a work, restated for Turing (which may not import them); its save refuses anything else.
export const MODEL_MEASURES = [
  "volume",
  "area",
  "base_and_sides",
  "length",
  "count",
  "manual",
] as const;

const WORKS = { file: "lib/estimator/works-actions.ts" };
const MIXES = { file: "lib/estimator/mixes-actions.ts" };

const work: Field = {
  key: "work_item_id",
  label: "Work",
  kind: "id",
  table: "work_items",
  record: true,
};
const mix: Field = {
  key: "mix_id",
  label: "Mix",
  kind: "id",
  table: "estimator_mixes",
  record: true,
};
const qty: Field = { key: "qty_per_unit", label: "Per unit", kind: "amount", fine: true };
const UNIT =
  "an active unit of measure from Masters (cum, sqm, kg, bag…), or the one it already has";

export const ESTIMATOR_RATES = defineEntries([
  {
    key: "est_work_setup",
    tool: "/estimator",
    title: "A work's unit and labour rate",
    description: `Sets up a work (work_items, active) in the rate book: what it is measured in (uom, ${UNIT}) and its labour rate in ₹ per unit (empty: not priced yet; 0 is a real rate). A work not set up yet needs its uom; a work on any estimate keeps its unit. Each left out stays as it is.`,
    form: { ...WORKS, reader: "saveWorkInfo" },
    fields: [
      work,
      { key: "uom", label: "Measured in", kind: "text", optional: true, keep: true, max: 20 },
      { key: "labour_rate", label: "Labour ₹ per unit", kind: "amount", optional: true },
    ],
    check: (values) =>
      "uom" in values || "labour_rate" in values ? undefined : "Say what changes on the work.",
  },
  {
    key: "est_work_model",
    tool: "/estimator",
    title: "How the SketchUp model measures a work",
    description:
      "Says how the SketchUp model measures a work already set up: volume, area, base_and_sides (a footing's shuttering), length, count, or manual (by hand, on the estimate); empty follows its unit. SketchUp learns it only when someone sends it the works list again from the rate book, which Turing does not do.",
    fields: [
      work,
      {
        key: "measure",
        label: "Measured as",
        kind: "choice",
        choices: MODEL_MEASURES,
        optional: true,
        blank: "follows its unit",
      },
    ],
    check: (values) =>
      "measure" in values ? undefined : "Give the measure, or empty to follow the unit.",
  },
  {
    key: "est_work_material",
    tool: "/estimator",
    title: "A material or mix in a work's recipe",
    description:
      "Adds to the recipe of a work already set up (it has a unit) how much of a material (item_id: items of kind material, active) or a mix (mix_id: estimator_mixes, active) one unit of the work uses, in the material's or mix's own unit — give one of the two. Its rate is Masters' price.",
    adds: true,
    fields: [
      work,
      { key: "item_id", label: "Material", kind: "id", table: "items", optional: true },
      { key: "mix_id", label: "Mix", kind: "id", table: "estimator_mixes", optional: true },
      qty,
    ],
    check: (values) =>
      Boolean(values.item_id) === Boolean(values.mix_id)
        ? "Give one: item_id for a material, or mix_id for a mix."
        : undefined,
  },
  {
    key: "est_work_material_change",
    tool: "/estimator",
    title: "A work's recipe line, changed",
    description:
      "Changes how much of a material or mix one unit of a work uses (estimator_work_components); above 0.",
    fields: [
      {
        key: "component_id",
        label: "Recipe line",
        kind: "id",
        table: "estimator_work_components",
        record: true,
      },
      qty,
    ],
  },
  {
    key: "est_work_material_remove",
    tool: "/estimator",
    title: "A work's recipe line, removed",
    description: "Takes a material or mix out of a work's recipe (estimator_work_components).",
    fields: [
      {
        key: "component_id",
        label: "Recipe line",
        kind: "id",
        table: "estimator_work_components",
        record: true,
      },
    ],
  },
  {
    key: "est_work_copy",
    tool: "/estimator",
    title: "A work's rate, copied to other works",
    description:
      "Copies a work's unit, labour rate and materials onto another active work (the same work on another floor, say), one row per work it goes to, each its own save. The target's materials are replaced, not merged; a target already on an estimate in another unit is refused.",
    fields: [
      { ...work, key: "from_work_item_id", label: "From" },
      { key: "to_work_item_id", label: "To", kind: "id", table: "work_items", record: true },
    ],
  },
  {
    key: "est_mix_new",
    tool: "/estimator",
    title: "A mix",
    description: `Adds a named, reusable mix (M20 concrete, 1:4 mortar): what one unit of it is (uom, ${UNIT}), its group on the Mixes list (Concrete, Mortar — reuse one already in use), a description, and whether it is in use (true if left out). Its materials follow with est_mix_material.`,
    adds: true,
    form: { ...MIXES, reader: "readMixFields" },
    fields: [
      { key: "name", label: "Name", kind: "text", max: 120 },
      { key: "uom", label: "One unit is", kind: "text", max: 20 },
      { key: "group_name", label: "Group", kind: "text", optional: true, max: 60 },
      { key: "description", label: "Description", kind: "text", optional: true },
      { key: "is_active", label: "In use", kind: "yesno", optional: true, start: true },
    ],
  },
  {
    key: "est_mix_change",
    tool: "/estimator",
    title: "A mix, changed",
    description: `Changes a mix's name, unit (${UNIT}), group, description or whether it is in use; every work using it follows. Each left out stays as it is.`,
    form: { ...MIXES, reader: "readMixFields" },
    fields: [
      mix,
      { key: "name", label: "Name", kind: "text", optional: true, keep: true, max: 120 },
      { key: "uom", label: "One unit is", kind: "text", optional: true, keep: true, max: 20 },
      { key: "group_name", label: "Group", kind: "text", optional: true, max: 60 },
      { key: "description", label: "Description", kind: "text", optional: true },
      { key: "is_active", label: "In use", kind: "yesno", optional: true },
    ],
  },
  {
    key: "est_mix_delete",
    tool: "/estimator",
    title: "A mix, deleted",
    description:
      "Deletes a mix nothing uses, with its materials; one a work's recipe or a villa's own version of a work uses is refused — switch it off instead (est_mix_change is_active false).",
    fields: [mix],
  },
  {
    key: "est_mix_material",
    tool: "/estimator",
    title: "A material in a mix",
    description:
      "Adds how much of a material (items of kind material, active) one unit of a mix uses, in the material's own unit.",
    adds: true,
    form: { ...MIXES, reader: "addMixComponent" },
    fields: [mix, { key: "item_id", label: "Material", kind: "id", table: "items" }, qty],
  },
  {
    key: "est_mix_material_change",
    tool: "/estimator",
    title: "A mix's material, changed",
    description:
      "Changes how much of a material one unit of a mix uses (estimator_mix_components); above 0.",
    fields: [
      {
        key: "component_id",
        label: "Mix line",
        kind: "id",
        table: "estimator_mix_components",
        record: true,
      },
      qty,
    ],
  },
  {
    key: "est_mix_material_remove",
    tool: "/estimator",
    title: "A mix's material, removed",
    description: "Takes a material out of a mix (estimator_mix_components).",
    fields: [
      {
        key: "component_id",
        label: "Mix line",
        kind: "id",
        table: "estimator_mix_components",
        record: true,
      },
    ],
  },
  {
    key: "est_indent_answer",
    tool: "/estimator",
    title: "The estimator's answer on an indent line",
    description:
      "Approves or refuses an indent line that no estimate or budget covers, on an indent waiting for approval (Site check's Indents waiting for you); a refusal needs the reason, which everyone who can see the indent reads, so it never names a rate, price or cost. The answer can change while the indent waits, to the other answer. Approving does not put the material on the estimate.",
    fields: [
      { key: "line_id", label: "Indent line", kind: "id", table: "indent_lines", record: true },
      { key: "decision", label: "Answer", kind: "choice", choices: ["approved", "refused"] },
      { key: "note", label: "Why", kind: "text", optional: true },
    ],
    check: (values) =>
      values.decision === "refused" && !values.note
        ? "Say why it is refused — the indent's approver reads this."
        : values.decision === "approved" && values.note
          ? "A note goes only with a refusal."
          : undefined,
  },
]);
