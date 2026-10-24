/** Masters: the shared reference data, record by record, through Masters' own saves. */
import { ITEM_KINDS, TERMS_KINDS } from "@/lib/masters/constants";
import { WORK_FAMILIES } from "@/lib/masters/work-families";

import type { Field, IdTable } from "../catalogue-fields";
import { defineEntries } from "./define";

const FILE = (name: string) => `lib/masters/${name}-actions.ts`;

const record = (key: string, label: string, table: IdTable): Field => ({
  key,
  label,
  kind: "id",
  table,
  record: true,
});
const name: Field = { key: "name", label: "Name", kind: "text" };
const active: Field = {
  key: "is_active",
  label: "Active",
  kind: "yesno",
  optional: true,
  start: true,
};
const words = (key: string, label: string, extra: Partial<Field> = {}): Field => ({
  key,
  label,
  kind: "text",
  optional: true,
  ...extra,
});

/**
 * A change's fields: each left out keeps what is there, and what the tool needs can't be emptied —
 * a required field, or one a new record starts with (a status, a state).
 */
const changing = (fields: Field[]): Field[] =>
  fields.map((field) =>
    field.kind === "yesno" || (field.optional && field.start === undefined)
      ? { ...field, optional: true }
      : { ...field, optional: true, keep: true },
  );

const DELETE =
  "Only an admin, and only while nothing uses it: one in use is refused — switch it off (Active) instead.";

const vendor = [
  name,
  words("contact_name", "Contact"),
  words("contact_designation", "Designation"),
  words("mobile", "Mobile"),
  words("email", "Email"),
  words("gst_no", "GSTIN"),
  words("gst_state", "GST state"),
  words("address", "Address"),
  { key: "payment_term_days", label: "Pay in days", kind: "whole", optional: true },
  active,
  { key: "is_contractor", label: "Contractor", kind: "yesno", optional: true, start: false },
] satisfies Field[];

const item = [
  words("code", "Code"),
  name,
  words("description", "Description"),
  { key: "kind", label: "Kind", kind: "choice", choices: ITEM_KINDS },
  { key: "category_id", label: "Category", kind: "id", table: "item_categories" },
  { key: "brand_id", label: "Brand", kind: "id", table: "brands", optional: true },
  {
    key: "placement",
    label: "Placement",
    kind: "choice",
    optional: true,
    choices: ["fixed", "loose", "soft_furnishing"],
  },
  { key: "default_uom", label: "Unit", kind: "text" },
  { key: "indicative_price", label: "Price", kind: "amount", optional: true },
  { key: "gst_pct", label: "GST %", kind: "amount", optional: true },
] satisfies Field[];

const client = [
  name,
  words("mobile", "Mobile"),
  words("email", "Email"),
  words("notes", "Notes"),
  active,
] satisfies Field[];

const company = [
  name,
  words("legal_name", "Legal name"),
  words("address", "Address"),
  words("gstin", "GSTIN"),
  { key: "state", label: "State", kind: "text", optional: true, start: "Kerala" },
  words("phone", "Phone"),
  words("email", "Email"),
  active,
] satisfies Field[];

const project = [
  name,
  words("code", "Code"),
  words("location", "Location"),
  {
    key: "project_type",
    label: "Type",
    kind: "choice",
    choices: ["apartment_villa_community", "eco_village", "mixed_residential_commercial"],
  },
  {
    key: "status",
    label: "Status",
    kind: "choice",
    optional: true,
    start: "planning",
    choices: ["planning", "active", "completed"],
  },
  { key: "company_id", label: "Company", kind: "id", table: "companies", optional: true },
] satisfies Field[];

const plotStatus: Field = {
  key: "status",
  label: "Status",
  kind: "choice",
  optional: true,
  start: "available",
  choices: ["available", "reserved", "sold"],
};

const plot = [
  { key: "project_id", label: "Project", kind: "id", table: "projects" },
  name,
  words("code", "Code"),
  { key: "area", label: "Area", kind: "amount", optional: true },
  plotStatus,
] satisfies Field[];

const unit = [
  { key: "project_id", label: "Project", kind: "id", table: "projects" },
  { key: "plot_id", label: "Plot", kind: "id", table: "plots" },
  name,
  words("code", "Code"),
  {
    key: "unit_type",
    label: "Type",
    kind: "choice",
    choices: ["apartment", "villa", "duplex_row_house"],
  },
  { key: "client_id", label: "Client", kind: "id", table: "clients", optional: true },
  plotStatus,
] satisfies Field[];

const store = [
  name,
  { key: "project_id", label: "Project", kind: "id", table: "projects", optional: true },
  words("location", "Location"),
  active,
] satisfies Field[];

const terms = [
  { key: "kind", label: "For", kind: "choice", choices: TERMS_KINDS },
  name,
  { key: "body", label: "Terms", kind: "text", max: 8000 },
  active,
  { key: "is_default", label: "Default", kind: "yesno", optional: true, start: false },
] satisfies Field[];

const bank = [
  words("bank_name", "Bank"),
  words("account_number", "Account number"),
  words("account_holder_name", "Account holder"),
  words("ifsc", "IFSC"),
] satisfies Field[];

/** A short list kept by name alone (units of measure, stages): add, rename, switch off, delete. */
function list<P extends string>(
  prefix: P,
  table: IdTable,
  noun: string,
  file: string,
  add: string,
  note: string,
) {
  const one = record(`${prefix}_id`, noun[0].toUpperCase() + noun.slice(1), table);
  return [
    {
      key: `${prefix}_new` as const,
      tool: "/masters",
      title: `A ${noun}, added`,
      description: `Adds a ${noun} at the end of the list. ${note}`,
      adds: true as const,
      fields: [name],
      form: { file: FILE(file), reader: add },
      alike: { table },
    },
    {
      key: `${prefix}_rename` as const,
      tool: "/masters",
      title: `A ${noun}, renamed`,
      description: `Renames a ${noun}; everything carrying it follows.`,
      fields: [one, name],
    },
    {
      key: `${prefix}_active` as const,
      tool: "/masters",
      title: `A ${noun}, switched on or off`,
      description: `Switches a ${noun} off (no longer offered) or back on.`,
      fields: [one, { key: "is_active", label: "Active", kind: "yesno" }] satisfies Field[],
    },
    {
      key: `${prefix}_delete` as const,
      tool: "/masters",
      title: `A ${noun}, deleted`,
      description: `Deletes a ${noun}. ${DELETE}`,
      fields: [one],
    },
  ];
}

export const MASTERS = defineEntries([
  {
    key: "vendor_new",
    tool: "/masters",
    title: "A vendor, added",
    description:
      "Adds a vendor or contractor (is_contractor). Read vendors first: a row that looks like an existing vendor (same GSTIN or mobile, or a near name) is flagged and starts unticked.",
    adds: true,
    fields: vendor,
    form: { file: FILE("vendors"), reader: "readVendorForm" },
    alike: { table: "vendors", tax: "gst_no", phone: "mobile" },
  },
  {
    key: "vendor_change",
    tool: "/masters",
    title: "A vendor, changed",
    description: "Changes a vendor's details.",
    fields: [record("vendor_id", "Vendor", "vendors"), ...changing(vendor)],
    form: { file: FILE("vendors"), reader: "readVendorForm" },
  },
  {
    key: "vendor_bank",
    tool: "/masters",
    title: "A vendor's bank details",
    description:
      "A vendor's bank account, kept apart from the vendor (vendor_payment_details). Left out keeps what is there; emptying all four removes them.",
    fields: [record("vendor_id", "Vendor", "vendors"), ...bank],
    form: { file: FILE("vendors"), reader: "saveVendorPaymentDetails" },
  },
  {
    key: "vendor_delete",
    tool: "/masters",
    title: "A vendor, deleted",
    description: `Deletes a vendor. ${DELETE}`,
    fields: [record("vendor_id", "Vendor", "vendors")],
  },
  {
    key: "item_new",
    tool: "/masters",
    title: "An item, added",
    description:
      "Adds a catalogue item (interiors) or a material (construction). Unit is a name from uoms (active ones); GST % one of the active gst_rates, or left out; price is indicative, per unit. Read items first: a near name or the same code is flagged.",
    adds: true,
    fields: item,
    form: { file: FILE("items"), reader: "readItemForm" },
    alike: { table: "items", code: "code" },
  },
  {
    key: "item_change",
    tool: "/masters",
    title: "An item, changed",
    description: "Changes an item's details, price or GST %.",
    fields: [record("item_id", "Item", "items"), ...changing(item)],
    form: { file: FILE("items"), reader: "readItemForm" },
  },
  {
    key: "item_delete",
    tool: "/masters",
    title: "An item, deleted",
    description: `Deletes an item. ${DELETE}`,
    fields: [record("item_id", "Item", "items")],
  },
  {
    key: "brand_new",
    tool: "/masters",
    title: "A brand, added",
    description: "Adds a brand.",
    adds: true,
    fields: [name],
    form: { file: FILE("brands"), reader: "createBrand" },
    alike: { table: "brands" },
  },
  {
    key: "brand_change",
    tool: "/masters",
    title: "A brand, changed",
    description: "Renames a brand, or switches it off or on.",
    fields: [record("brand_id", "Brand", "brands"), ...changing([name, active])],
    form: { file: FILE("brands"), reader: "updateBrand" },
  },
  {
    key: "brand_delete",
    tool: "/masters",
    title: "A brand, deleted",
    description: `Deletes a brand. ${DELETE}`,
    fields: [record("brand_id", "Brand", "brands")],
  },
  {
    key: "category_new",
    tool: "/masters",
    title: "An item category, added",
    description: "Adds an item category, for catalogue items or materials; its kind never changes.",
    adds: true,
    fields: [name, { key: "kind", label: "Kind", kind: "choice", choices: ITEM_KINDS }],
    form: { file: FILE("item-categories"), reader: "createItemCategory" },
    alike: { table: "item_categories" },
  },
  {
    key: "category_change",
    tool: "/masters",
    title: "An item category, changed",
    description: "Renames an item category, or switches it off or on.",
    fields: [record("category_id", "Category", "item_categories"), ...changing([name, active])],
    form: { file: FILE("item-categories"), reader: "updateItemCategory" },
  },
  {
    key: "category_delete",
    tool: "/masters",
    title: "An item category, deleted",
    description: `Deletes an item category. ${DELETE}`,
    fields: [record("category_id", "Category", "item_categories")],
  },
  {
    key: "client_new",
    tool: "/masters",
    title: "A client, added",
    description:
      "Adds a client. Read clients first: the same mobile or a near name is flagged and starts unticked.",
    adds: true,
    fields: client,
    form: { file: FILE("clients"), reader: "readClientForm" },
    alike: { table: "clients", phone: "mobile" },
  },
  {
    key: "client_change",
    tool: "/masters",
    title: "A client, changed",
    description: "Changes a client's details.",
    fields: [record("client_id", "Client", "clients"), ...changing(client)],
    form: { file: FILE("clients"), reader: "readClientForm" },
  },
  {
    key: "client_delete",
    tool: "/masters",
    title: "A client, deleted",
    description: `Deletes a client. ${DELETE}`,
    fields: [record("client_id", "Client", "clients")],
  },
  {
    key: "company_new",
    tool: "/masters",
    title: "A company, added",
    description:
      "Adds one of our own companies (the buyer on a PO). State is compared with each vendor's GST state; GSTIN is 15 letters and digits.",
    adds: true,
    fields: company,
    form: { file: FILE("companies"), reader: "readCompanyForm" },
    alike: { table: "companies", tax: "gstin", phone: "phone" },
  },
  {
    key: "company_change",
    tool: "/masters",
    title: "A company, changed",
    description: "Changes one of our companies' details.",
    fields: [record("company_id", "Company", "companies"), ...changing(company)],
    form: { file: FILE("companies"), reader: "readCompanyForm" },
  },
  {
    key: "company_delete",
    tool: "/masters",
    title: "A company, deleted",
    description: `Deletes a company. ${DELETE}`,
    fields: [record("company_id", "Company", "companies")],
  },
  {
    key: "project_new",
    tool: "/masters",
    title: "A project, added",
    description: "Adds a project. A code is 2–10 capitals, digits or dashes, e.g. SAARANG.",
    adds: true,
    fields: project,
    form: { file: FILE("projects"), reader: "readProjectForm" },
    alike: { table: "projects", code: "code" },
  },
  {
    key: "project_change",
    tool: "/masters",
    title: "A project, changed",
    description: "Changes a project's details.",
    fields: [record("project_id", "Project", "projects"), ...changing(project)],
    form: { file: FILE("projects"), reader: "readProjectForm" },
  },
  {
    key: "project_delete",
    tool: "/masters",
    title: "A project, deleted",
    description: "Deletes a project. Only an admin, and only while nothing uses it.",
    fields: [record("project_id", "Project", "projects")],
  },
  {
    key: "plot_new",
    tool: "/masters",
    title: "A plot, added",
    description:
      "Adds a plot to a project. A code is 2–10 capitals, digits or dashes, e.g. P12, unique in its project.",
    adds: true,
    fields: plot,
    form: { file: FILE("plots"), reader: "readPlotForm" },
  },
  {
    key: "plot_change",
    tool: "/masters",
    title: "A plot, changed",
    description: "Changes a plot's details.",
    fields: [record("plot_id", "Plot", "plots"), ...changing(plot)],
    form: { file: FILE("plots"), reader: "readPlotForm" },
  },
  {
    key: "plot_delete",
    tool: "/masters",
    title: "A plot, deleted",
    description: "Deletes a plot. Only an admin, and only while nothing uses it.",
    fields: [record("plot_id", "Plot", "plots")],
  },
  {
    key: "unit_new",
    tool: "/masters",
    title: "A unit, added",
    description:
      "Adds a unit (a villa or apartment) on a plot of the same project; one unit per plot. A code is 2–10 capitals, digits or dashes.",
    adds: true,
    fields: unit,
    form: { file: FILE("units"), reader: "readUnitForm" },
  },
  {
    key: "unit_change",
    tool: "/masters",
    title: "A unit, changed",
    description: "Changes a unit's details, or its client.",
    fields: [record("unit_id", "Unit", "units"), ...changing(unit)],
    form: { file: FILE("units"), reader: "readUnitForm" },
  },
  {
    key: "unit_delete",
    tool: "/masters",
    title: "A unit, deleted",
    description: "Deletes a unit. Only an admin, and only while nothing uses it.",
    fields: [record("unit_id", "Unit", "units")],
  },
  {
    key: "store_new",
    tool: "/masters",
    title: "A store, added",
    description: "Adds a store, on a project's site or none.",
    adds: true,
    fields: store,
    form: { file: FILE("stores"), reader: "readStoreForm" },
    alike: { table: "stores" },
  },
  {
    key: "store_change",
    tool: "/masters",
    title: "A store, changed",
    description: "Changes a store's details.",
    fields: [record("store_id", "Store", "stores"), ...changing(store)],
    form: { file: FILE("stores"), reader: "readStoreForm" },
  },
  {
    key: "store_delete",
    tool: "/masters",
    title: "A store, deleted",
    description: `Deletes a store. ${DELETE}`,
    fields: [record("store_id", "Store", "stores")],
  },
  {
    key: "terms_new",
    tool: "/masters",
    title: "A terms template, added",
    description:
      "Adds terms for purchase orders (po) or work orders. One default per kind; making these the default unsets the old one. A switched-off template can't be the default.",
    adds: true,
    fields: terms,
    form: { file: FILE("terms"), reader: "readTermsForm" },
    alike: { table: "document_terms" },
  },
  {
    key: "terms_change",
    tool: "/masters",
    title: "A terms template, changed",
    description: "Changes a terms template.",
    fields: [record("terms_id", "Terms", "document_terms"), ...changing(terms)],
    form: { file: FILE("terms"), reader: "readTermsForm" },
  },
  {
    key: "terms_delete",
    tool: "/masters",
    title: "A terms template, deleted",
    description: `Deletes a terms template. ${DELETE}`,
    fields: [record("terms_id", "Terms", "document_terms")],
  },
  ...list("uom", "uoms", "unit of measure", "uoms", "addUom", "Up to 20 characters, e.g. sqft."),
  ...list(
    "construction_stage",
    "construction_stages",
    "construction stage",
    "stages",
    "addConstructionStage",
    "The stages indents and budgets are filed under; up to 60 characters.",
  ),
  ...list(
    "progress_stage",
    "progress_stages",
    "build stage",
    "progress-stages",
    "addProgressStage",
    "Client Relations' build progress; order matters, the last active stage is the handover.",
  ),
  {
    key: "progress_stage_move",
    tool: "/masters",
    title: "A build stage, moved",
    description: "Moves a build stage one place up or down the list.",
    fields: [
      record("progress_stage_id", "Build stage", "progress_stages"),
      { key: "direction", label: "Move", kind: "choice", choices: ["up", "down"] },
    ],
  },
  {
    key: "gst_rate_new",
    tool: "/masters",
    title: "A GST rate, added",
    description: "Adds a GST percentage to the rates POs and items offer.",
    adds: true,
    fields: [{ key: "rate", label: "Rate %", kind: "amount" }],
    form: { file: FILE("gst-rates"), reader: "addGstRate" },
  },
  {
    key: "gst_rate_active",
    tool: "/masters",
    title: "A GST rate, switched on or off",
    description: "Switches a GST rate off (no longer offered) or back on, by its percentage.",
    fields: [
      { key: "rate", label: "Rate %", kind: "amount" },
      { key: "is_active", label: "Active", kind: "yesno" },
    ],
  },
  {
    key: "work_category_new",
    tool: "/masters",
    title: "A works category, added",
    description:
      "Adds a category to the works list, e.g. FD Foundation, in one of the five families.",
    adds: true,
    fields: [
      { key: "code", label: "Code", kind: "text" },
      name,
      { key: "family", label: "Family", kind: "choice", choices: WORK_FAMILIES },
    ],
    form: {
      file: FILE("works"),
      reader: "readWorksForm",
      ignored: ["category_id", "group_id", "is_active"],
    },
    alike: { table: "work_categories", code: "code" },
  },
  {
    key: "work_category_change",
    tool: "/masters",
    title: "A works category, changed",
    description: "Changes a works category's code, name or family, or switches it off or on.",
    fields: [
      record("work_category_id", "Category", "work_categories"),
      ...changing([
        { key: "code", label: "Code", kind: "text" },
        name,
        { key: "family", label: "Family", kind: "choice", choices: WORK_FAMILIES },
        active,
      ]),
    ],
    form: { file: FILE("works"), reader: "readWorksForm", ignored: ["category_id", "group_id"] },
  },
  {
    key: "work_group_new",
    tool: "/masters",
    title: "A works group, added",
    description:
      "Adds a group under a works category, e.g. FD.3; groups and works share one code space.",
    adds: true,
    fields: [
      { key: "category_id", label: "Category", kind: "id", table: "work_categories" },
      { key: "code", label: "Code", kind: "text" },
      name,
    ],
    form: {
      file: FILE("works"),
      reader: "readWorksForm",
      ignored: ["family", "group_id", "is_active"],
    },
    alike: { table: "work_groups", code: "code" },
  },
  {
    key: "work_group_change",
    tool: "/masters",
    title: "A works group, changed",
    description: "Changes a works group's code or name, or switches it off or on.",
    fields: [
      record("work_group_id", "Group", "work_groups"),
      ...changing([{ key: "code", label: "Code", kind: "text" }, name, active]),
    ],
    form: {
      file: FILE("works"),
      reader: "readWorksForm",
      ignored: ["family", "category_id", "group_id"],
    },
  },
  {
    key: "work_item_new",
    tool: "/masters",
    title: "A work, added",
    description:
      "Adds a work to the works list under a category, in one of its groups or none, e.g. FD.4; the name describes the work (up to 200 characters).",
    adds: true,
    fields: [
      { key: "category_id", label: "Category", kind: "id", table: "work_categories" },
      { key: "group_id", label: "Group", kind: "id", table: "work_groups", optional: true },
      { key: "code", label: "Code", kind: "text" },
      name,
    ],
    form: { file: FILE("works"), reader: "readWorksForm", ignored: ["family", "is_active"] },
    alike: { table: "work_items", code: "code" },
  },
  {
    key: "work_item_change",
    tool: "/masters",
    title: "A work, changed",
    description: "Changes a work's code, name or group, or switches it off or on.",
    fields: [
      record("work_item_id", "Work", "work_items"),
      ...changing([
        { key: "code", label: "Code", kind: "text" },
        name,
        { key: "group_id", label: "Group", kind: "id", table: "work_groups", optional: true },
        active,
      ]),
    ],
    form: { file: FILE("works"), reader: "readWorksForm", ignored: ["family", "category_id"] },
  },
  {
    key: "work_category_delete",
    tool: "/masters",
    title: "A works category, deleted",
    description: `Deletes a works category. ${DELETE}`,
    fields: [record("work_category_id", "Category", "work_categories")],
  },
  {
    key: "work_group_delete",
    tool: "/masters",
    title: "A works group, deleted",
    description: `Deletes a works group. ${DELETE}`,
    fields: [record("work_group_id", "Group", "work_groups")],
  },
  {
    key: "work_item_delete",
    tool: "/masters",
    title: "A work, deleted",
    description: `Deletes a work. ${DELETE}`,
    fields: [record("work_item_id", "Work", "work_items")],
  },
]);
