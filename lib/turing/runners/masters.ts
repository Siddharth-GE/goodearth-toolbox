import "server-only";

import type { ActionState } from "@/lib/action-state";
import { createBrand, deleteBrand, updateBrand } from "@/lib/masters/brands-actions";
import {
  createClientRecord,
  deleteClient,
  updateClientRecord,
} from "@/lib/masters/clients-actions";
import { createCompany, deleteCompany, updateCompany } from "@/lib/masters/companies-actions";
import { addGstRate, setGstRateActive } from "@/lib/masters/gst-rates-actions";
import {
  createItemCategory,
  deleteItemCategory,
  updateItemCategory,
} from "@/lib/masters/item-categories-actions";
import {
  approveItemRequest,
  mergeItemRequest,
  rejectItemRequest,
} from "@/lib/masters/item-requests-actions";
import { createItem, deleteItem, updateItem } from "@/lib/masters/items-actions";
import { createPlot, deletePlot, updatePlot } from "@/lib/masters/plots-actions";
import {
  addProgressStage,
  deleteProgressStage,
  moveProgressStage,
  renameProgressStage,
  setProgressStageActive,
} from "@/lib/masters/progress-stages-actions";
import { createProject, deleteProject, updateProject } from "@/lib/masters/projects-actions";
import {
  addConstructionStage,
  deleteConstructionStage,
  renameConstructionStage,
  setConstructionStageActive,
} from "@/lib/masters/stages-actions";
import { createStore, deleteStore, updateStore } from "@/lib/masters/stores-actions";
import { createTerms, deleteTerms, updateTerms } from "@/lib/masters/terms-actions";
import { createUnit, deleteUnit, updateUnit } from "@/lib/masters/units-actions";
import { addUom, deleteUom, renameUom, setUomActive } from "@/lib/masters/uoms-actions";
import {
  createVendor,
  deleteVendor,
  saveVendorPaymentDetails,
  updateVendor,
} from "@/lib/masters/vendors-actions";
import {
  addWorkCategory,
  addWorkGroup,
  addWorkItem,
  deleteWorkCategory,
  deleteWorkGroup,
  deleteWorkItem,
  updateWorkCategory,
  updateWorkGroup,
  updateWorkItem,
} from "@/lib/masters/works-actions";

import { entryFor, formKeys, formOf } from "../catalogue-fields";
import type { MASTERS } from "../entries/masters";
import { given, recordNow, retired, type Runners, type Values } from "./kit";

type Key = (typeof MASTERS)[number]["key"];
type Save = (state: ActionState, form: FormData) => Promise<ActionState>;
type Update = (id: string, state: ActionState, form: FormData) => Promise<ActionState>;

const missingEntry = { error: "Turing's list of changes is out of date. Reload and try again." };

/** A new record: the form as the admin saved it, with what the tool's form starts ticked. */
const adding =
  (key: Key, save: Save) =>
  async (values: Values): Promise<ActionState> => {
    const entry = entryFor(key);
    if (!entry) return missingEntry;
    return save(undefined, formOf(entry, values));
  };

/**
 * A change: the tool's update replaces every field, so each one left out is read as it stands
 * and sent back unchanged. `from` names where the record lives when it is not the entry's own
 * table by id; `gone: null` there means no row yet is a state of its own (no bank details).
 */
const changing =
  (key: Key, update: Update, from: { table: string; column?: string; gone: string | null }) =>
  async (values: Values): Promise<ActionState> => {
    const entry = entryFor(key);
    const record = entry?.fields.find((field) => field.record);
    if (!entry || !record) return missingEntry;
    const id = String(values[record.key]);
    const now = await recordNow(
      from.table,
      { column: from.column ?? "id", id },
      formKeys(entry),
      from.gone,
    );
    if ("error" in now) return now;
    return update(id, undefined, formOf(entry, values, now.row));
  };

const of = (values: Values, key: string) => String(values[key]);

/**
 * The request's provisional item, while it is still pending: the decisions update by id alone,
 * so a second one would undo the first (accepting a rejected item leaves it switched off).
 */
async function pendingRequest(requestId: string): Promise<{ itemId: string } | { error: string }> {
  const now = await recordNow(
    "item_requests",
    { column: "id", id: requestId },
    ["status", "provisional_item_id"],
    "That item request is gone.",
  );
  if ("error" in now) return now;
  if (now.row.status !== "pending") return { error: `That request is already ${now.row.status}.` };
  return { itemId: String(now.row.provisional_item_id) };
}

export const MASTERS_RUNNERS: Runners<Key> = {
  vendor_new: adding("vendor_new", createVendor),
  vendor_change: changing("vendor_change", updateVendor, {
    table: "vendors",
    gone: "That vendor is gone.",
  }),
  vendor_bank: changing("vendor_bank", saveVendorPaymentDetails, {
    table: "vendor_payment_details",
    column: "vendor_id",
    gone: null,
  }),
  vendor_delete: (v) => deleteVendor(of(v, "vendor_id")),

  item_new: adding("item_new", createItem),
  item_change: changing("item_change", updateItem, {
    table: "items",
    gone: "That item is gone.",
  }),
  item_delete: (v) => deleteItem(of(v, "item_id")),
  item_request_accept: async (v) => {
    const request = await pendingRequest(of(v, "request_id"));
    if ("error" in request) return request;
    const item = await recordNow(
      "items",
      { column: "id", id: request.itemId },
      ["code", "is_active"],
      "That request's item is gone.",
    );
    if ("error" in item) return item;
    // Accepted while switched off, it would be in no picker yet read as saved.
    if (item.row.is_active === false) {
      return {
        error:
          "Its item is switched off in Masters. Switch it back on first, or merge or reject the request.",
      };
    }
    // The accept writes the code whole, so one left out is sent as it stands.
    return approveItemRequest(
      of(v, "request_id"),
      request.itemId,
      given(v, "code", item.row.code as string | null) || null,
    );
  },
  item_request_merge: async (v) => {
    const request = await pendingRequest(of(v, "request_id"));
    if ("error" in request) return request;
    // The screen offers active items other than the provisional one itself.
    if (of(v, "item_id") === request.itemId)
      return { error: "An item can't be merged into itself." };
    return (
      (await retired("items", of(v, "item_id"))) ??
      mergeItemRequest(of(v, "request_id"), request.itemId, of(v, "item_id"))
    );
  },
  item_request_reject: async (v) => {
    const request = await pendingRequest(of(v, "request_id"));
    if ("error" in request) return request;
    return rejectItemRequest(of(v, "request_id"), request.itemId);
  },

  brand_new: adding("brand_new", createBrand),
  brand_change: changing("brand_change", updateBrand, {
    table: "brands",
    gone: "That brand is gone.",
  }),
  brand_delete: (v) => deleteBrand(of(v, "brand_id")),

  category_new: adding("category_new", createItemCategory),
  category_change: changing("category_change", updateItemCategory, {
    table: "item_categories",
    gone: "That category is gone.",
  }),
  category_delete: (v) => deleteItemCategory(of(v, "category_id")),

  client_new: adding("client_new", createClientRecord),
  client_change: changing("client_change", updateClientRecord, {
    table: "clients",
    gone: "That client is gone.",
  }),
  client_delete: (v) => deleteClient(of(v, "client_id")),

  company_new: adding("company_new", createCompany),
  company_change: changing("company_change", updateCompany, {
    table: "companies",
    gone: "That company is gone.",
  }),
  company_delete: (v) => deleteCompany(of(v, "company_id")),

  project_new: adding("project_new", createProject),
  project_change: changing("project_change", updateProject, {
    table: "projects",
    gone: "That project is gone.",
  }),
  project_delete: (v) => deleteProject(of(v, "project_id")),

  plot_new: adding("plot_new", createPlot),
  plot_change: changing("plot_change", updatePlot, {
    table: "plots",
    gone: "That plot is gone.",
  }),
  plot_delete: (v) => deletePlot(of(v, "plot_id")),

  unit_new: adding("unit_new", createUnit),
  unit_change: changing("unit_change", updateUnit, {
    table: "units",
    gone: "That unit is gone.",
  }),
  unit_delete: (v) => deleteUnit(of(v, "unit_id")),

  store_new: adding("store_new", createStore),
  store_change: changing("store_change", updateStore, {
    table: "stores",
    gone: "That store is gone.",
  }),
  store_delete: (v) => deleteStore(of(v, "store_id")),

  terms_new: adding("terms_new", createTerms),
  terms_change: changing("terms_change", updateTerms, {
    table: "document_terms",
    gone: "Those terms are gone.",
  }),
  terms_delete: (v) => deleteTerms(of(v, "terms_id")),

  uom_new: adding("uom_new", addUom),
  uom_rename: (v) => renameUom(of(v, "uom_id"), of(v, "name")),
  uom_active: (v) => setUomActive(of(v, "uom_id"), v.is_active === true),
  uom_delete: (v) => deleteUom(of(v, "uom_id")),

  construction_stage_new: adding("construction_stage_new", addConstructionStage),
  construction_stage_rename: (v) =>
    renameConstructionStage(of(v, "construction_stage_id"), of(v, "name")),
  construction_stage_active: (v) =>
    setConstructionStageActive(of(v, "construction_stage_id"), v.is_active === true),
  construction_stage_delete: (v) => deleteConstructionStage(of(v, "construction_stage_id")),

  progress_stage_new: adding("progress_stage_new", addProgressStage),
  progress_stage_rename: (v) => renameProgressStage(of(v, "progress_stage_id"), of(v, "name")),
  progress_stage_active: (v) =>
    setProgressStageActive(of(v, "progress_stage_id"), v.is_active === true),
  progress_stage_delete: (v) => deleteProgressStage(of(v, "progress_stage_id")),
  progress_stage_move: (v) =>
    moveProgressStage(of(v, "progress_stage_id"), v.direction === "up" ? "up" : "down"),

  gst_rate_new: adding("gst_rate_new", addGstRate),
  gst_rate_active: async (v) => {
    // A rate is a number, not an id, so nothing else checks it names one; the update alone would match nothing and say saved.
    const now = await recordNow(
      "gst_rates",
      { column: "rate", id: of(v, "rate") },
      ["rate"],
      `There is no ${of(v, "rate")}% rate on the list.`,
    );
    if ("error" in now) return now;
    return setGstRateActive(Number(v.rate), v.is_active === true);
  },

  work_category_new: adding("work_category_new", addWorkCategory),
  work_category_change: changing("work_category_change", updateWorkCategory, {
    table: "work_categories",
    gone: "That works category is gone.",
  }),
  work_category_delete: (v) => deleteWorkCategory(of(v, "work_category_id")),
  work_group_new: adding("work_group_new", addWorkGroup),
  work_group_change: changing("work_group_change", updateWorkGroup, {
    table: "work_groups",
    gone: "That works group is gone.",
  }),
  work_group_delete: (v) => deleteWorkGroup(of(v, "work_group_id")),
  work_item_new: adding("work_item_new", addWorkItem),
  work_item_change: changing("work_item_change", updateWorkItem, {
    table: "work_items",
    gone: "That work is gone.",
  }),
  work_item_delete: (v) => deleteWorkItem(of(v, "work_item_id")),
};
