/** Selections and Budgets: each unit's design revisions, spaces, items and photos, and the pricing of an issued revision, through their own saves. */
import type { Field } from "../catalogue-fields";
import { defineEntries } from "./define";

const selection: Field = {
  key: "selection_id",
  label: "Revision",
  kind: "id",
  table: "selections",
  record: true,
};
const line: Field = {
  key: "line_id",
  label: "Item line",
  kind: "id",
  table: "selection_lines",
  record: true,
};
const view: Field = {
  key: "view_id",
  label: "Photo",
  kind: "id",
  table: "space_views",
  record: true,
};
const budget: Field = {
  key: "budget_id",
  label: "Budget",
  kind: "id",
  table: "budgets",
  record: true,
};
const uom: Field = { key: "uom", label: "Unit", kind: "text", max: 40 };

const DRAFT =
  "selection_id is the unit's draft revision (selections.status draft); an issued one never changes.";

export const SELECTIONS_BUDGETS = defineEntries([
  {
    key: "sel_start",
    tool: "/selections",
    title: "A unit's first design revision",
    description:
      "Starts R0, the first draft revision of a unit (units.id) that has no revision yet; a unit with one moves on with sel_next.",
    adds: true,
    fields: [{ key: "unit_id", label: "Unit", kind: "id", table: "units" }],
  },
  {
    key: "sel_next",
    tool: "/selections",
    title: "The next design revision",
    description:
      "Starts the next draft revision (R+1) from a unit's issued revision, copying every line forward so Budgets keeps the pricing of lines that don't change.",
    fields: [selection],
  },
  {
    key: "sel_spaces",
    tool: "/selections",
    title: "Spaces in a unit",
    description: `Adds spaces (real rooms: Living, Bedroom 2, Bath 1) to the unit of a draft revision, one row per space: its type (space_types, active) and its name, unique in the unit. Spaces belong to the unit and carry into every revision. ${DRAFT}`,
    lines: { noun: "Revision" },
    fields: [
      { ...selection, header: true },
      { key: "space_type_id", label: "Type", kind: "id", table: "space_types" },
      { key: "label", label: "Name", kind: "text", max: 120 },
    ],
  },
  {
    key: "sel_lines",
    tool: "/selections",
    title: "Items specified into spaces",
    description: `Specifies catalogue items (items, active; a provisional one too) into spaces of a draft revision's unit, one row per item in a space, with its quantity; an item already in that space has its quantity raised by this much. The unit and rate come from the item. ${DRAFT}`,
    lines: { noun: "Revision" },
    fields: [
      { ...selection, header: true },
      { key: "space_id", label: "Space", kind: "id", table: "spaces" },
      { key: "item_id", label: "Item", kind: "id", table: "items" },
      { key: "quantity", label: "Quantity", kind: "amount" },
    ],
  },
  {
    key: "sel_line_change",
    tool: "/selections",
    title: "An item line, changed",
    description:
      "Changes an item line on a draft revision: its quantity (above 0) or the designer's note (empty clears it); its unit is the item's. Each left out stays as it is.",
    fields: [
      line,
      { key: "quantity", label: "Quantity", kind: "amount", optional: true, keep: true },
      { key: "note", label: "Designer's note", kind: "text", optional: true },
    ],
    check: (values) =>
      ["quantity", "note"].some((key) => key in values)
        ? undefined
        : "Say what changes on the line.",
  },
  {
    key: "sel_line_remove",
    tool: "/selections",
    title: "An item line, removed",
    description: "Takes an item line off a draft revision.",
    fields: [line],
  },
  {
    key: "sel_item_request",
    tool: "/selections",
    title: "A provisional catalogue item",
    description:
      "Adds an item the catalogue lacks, flagged provisional so it can be specified at once (Masters approves or merges it later): its name, category (item_categories), brand (optional), a spec note and its unit (an active unit of measure). Specify it afterwards with sel_lines; read items for its id.",
    adds: true,
    fields: [
      { key: "name", label: "Name", kind: "text", max: 200 },
      { key: "category_id", label: "Category", kind: "id", table: "item_categories" },
      { key: "brand_id", label: "Brand", kind: "id", table: "brands", optional: true },
      { key: "spec_note", label: "Spec note", kind: "text", optional: true },
      uom,
    ],
  },
  {
    key: "sel_issue",
    tool: "/selections",
    title: "A design revision, issued to budgeting",
    description:
      "Issues a draft revision that has items, with an optional note: it goes to Budgets for pricing, supersedes the unit's earlier issued revision, and never changes again (a change is the next revision).",
    fields: [selection, { key: "notes", label: "Note", kind: "text", optional: true }],
  },
  {
    key: "sel_delete",
    tool: "/selections",
    title: "A draft revision, deleted",
    description:
      "Deletes a draft revision and its items for good (nothing uses a draft); the unit's spaces and photos stay. An issued revision is never deleted.",
    fields: [selection],
  },
  {
    key: "sel_view_caption",
    tool: "/selections",
    title: "A space's photo, captioned",
    description:
      "Changes the caption of a photo on a space (space_views); empty clears it. Photos change only while the unit has a draft revision.",
    fields: [view, { key: "caption", label: "Caption", kind: "text", optional: true }],
    check: (values) =>
      "caption" in values ? undefined : "Give the caption, or empty to clear it.",
  },
  {
    key: "sel_view_move",
    tool: "/selections",
    title: "A space's photo, moved",
    description:
      "Moves a photo one place up or down among its space's photos, while the unit has a draft revision.",
    fields: [
      view,
      { key: "direction", label: "Which way", kind: "choice", choices: ["up", "down"] },
    ],
  },
  {
    key: "sel_view_delete",
    tool: "/selections",
    title: "A space's photo, removed",
    description:
      "Removes a photo from a space for good, while the unit has a draft revision. Adding photos stays on the Selections screen.",
    fields: [view],
  },
  {
    key: "budget_start",
    tool: "/budgets",
    title: "Pricing an issued revision",
    description:
      "Starts the budget for a unit's issued revision (selections.status issued) that has none yet; an R+1 carries the previous budget's pricing forward, line by line.",
    adds: true,
    fields: [selection],
  },
  {
    key: "budget_line",
    tool: "/budgets",
    title: "A budget line, priced",
    description:
      "Prices one item line (selection_lines of the budget's revision) on a budget still pricing: the quantity (above 0; left out, the budget's own or the designer's), the expected vendor (active), the unit cost in rupees before margin and the margin % (left out, the line's own, or the item's default where the line has none; a cost with no margin at all is charged at cost). Empty clears the vendor, cost, margin or notes. Pricing a line marks it reviewed.",
    fields: [
      budget,
      line,
      { key: "quantity", label: "Quantity", kind: "amount", optional: true, keep: true },
      { key: "vendor_id", label: "Vendor", kind: "id", table: "vendors", optional: true },
      { key: "unit_cost", label: "Unit cost ₹", kind: "amount", optional: true },
      { key: "margin_pct", label: "Margin %", kind: "amount", optional: true },
      { key: "notes", label: "Notes", kind: "text", optional: true },
    ],
  },
  {
    key: "budget_approve",
    tool: "/budgets",
    title: "A budget, approved",
    description:
      "Approves a budget once every line has a cost, which locks it; the client quotation can then go.",
    fields: [budget],
  },
  {
    key: "budget_reopen",
    tool: "/budgets",
    title: "A budget, re-opened",
    description:
      "Re-opens an approved budget to fix its pricing, starting its next version (the quote already sent stays the earlier version).",
    fields: [budget],
  },
  {
    key: "budget_margin",
    tool: "/budgets",
    title: "An item's default margin",
    description:
      "Sets the default margin % for an item (items), used when a line of it is priced from now on; it never re-prices a line already priced. Empty clears it (no default, not 0%).",
    fields: [
      { key: "item_id", label: "Item", kind: "id", table: "items", record: true },
      { key: "margin_pct", label: "Margin %", kind: "amount", optional: true },
    ],
    check: (values) =>
      "margin_pct" in values ? undefined : "Give the margin, or empty to clear it.",
  },
  {
    key: "budget_delete",
    tool: "/budgets",
    title: "A budget, deleted",
    description:
      "Deletes a budget still on its first pricing (version 1, not approved); a re-opened one stays, since indents may rest on it.",
    fields: [budget],
  },
]);
