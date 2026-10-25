import "server-only";

import {
  approveBudget,
  deleteBudget,
  reopenBudget,
  saveLine,
  setItemMargin,
  startPricing,
} from "@/lib/budgets/actions";
import {
  addLines,
  addSpaces,
  createNextRevision,
  deleteDraftSelection,
  issueSelection,
  removeLine,
  requestItem,
  startFirstRevision,
  updateLine,
} from "@/lib/selections/actions";
import { captionSpaceView, deleteSpaceView, moveSpaceView } from "@/lib/selections/views-actions";
import { createClient } from "@/lib/supabase/server";

import type { SELECTIONS_BUDGETS } from "../entries/selections-budgets";
import { idFrom } from "../redirects";
import { failed, given, recordNow, retired, saving, type Runners, type Values } from "./kit";

type Key = (typeof SELECTIONS_BUDGETS)[number]["key"];
type Failure = { error: string };

const text = (values: Values, key: string) =>
  typeof values[key] === "string" && values[key] ? String(values[key]).trim() : null;
const numberOf = (values: Values, key: string) => {
  const value = text(values, key);
  return value === null ? null : Number(value);
};

type Revision = { unitId: string; revisionNo: number; status: string };

async function revisionOf(selectionId: string): Promise<Revision | Failure> {
  const now = await recordNow(
    "selections",
    { column: "id", id: selectionId },
    ["unit_id", "revision_no", "status"],
    "That revision is gone.",
  );
  if ("error" in now) return now;
  return {
    unitId: String(now.row.unit_id),
    revisionNo: Number(now.row.revision_no),
    status: String(now.row.status),
  };
}

/** The editor offers spaces, items and lines only on a draft. */
async function draftOf(selectionId: string): Promise<Revision | Failure> {
  const revision = await revisionOf(selectionId);
  if ("error" in revision) return revision;
  return revision.status === "draft"
    ? revision
    : { error: `R${revision.revisionNo} is issued; a change is the next revision (sel_next).` };
}

/** A line, on a draft. */
async function draftLine(
  lineId: string,
): Promise<{ selectionId: string; quantity: number; uom: string; note: string | null } | Failure> {
  const now = await recordNow(
    "selection_lines",
    { column: "id", id: lineId },
    ["selection_id", "quantity", "uom", "designer_note"],
    "That item line is gone.",
  );
  if ("error" in now) return now;
  const draft = await draftOf(String(now.row.selection_id));
  if ("error" in draft) return draft;
  return {
    selectionId: String(now.row.selection_id),
    quantity: Number(now.row.quantity),
    uom: String(now.row.uom),
    note: (now.row.designer_note as string | null) ?? null,
  };
}

/** Photos are changed on the editor of the unit's draft revision, and only there. */
async function photoOf(
  viewId: string,
): Promise<{ spaceId: string; sortOrder: number; draftId: string } | Failure> {
  const view = await recordNow(
    "space_views",
    { column: "id", id: viewId },
    ["space_id", "sort_order"],
    "That photo is gone.",
  );
  if ("error" in view) return view;
  const space = await recordNow(
    "spaces",
    { column: "id", id: String(view.row.space_id) },
    ["unit_id"],
    "That photo's space is gone.",
  );
  if ("error" in space) return space;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("selections")
    .select("id")
    .eq("unit_id", String(space.row.unit_id))
    .eq("status", "draft")
    .maybeSingle();
  if (error) return failed("selections", error);
  if (!data) return { error: "Photos change only while the unit has a draft revision." };
  return {
    spaceId: String(view.row.space_id),
    sortOrder: Number(view.row.sort_order),
    draftId: data.id,
  };
}

type Budget = { selectionId: string; status: string; version: number };

async function budgetOf(budgetId: string): Promise<Budget | Failure> {
  const now = await recordNow(
    "budgets",
    { column: "id", id: budgetId },
    ["selection_id", "status", "version"],
    "That budget is gone.",
  );
  if ("error" in now) return now;
  return {
    selectionId: String(now.row.selection_id),
    status: String(now.row.status),
    version: Number(now.row.version),
  };
}

/** The revision a new record's address names, as "R2". */
async function revisionMade(path: string | null): Promise<{ saved: string } | undefined> {
  const id = idFrom(path, "/selections/");
  if (!id) return undefined;
  const made = await revisionOf(id);
  return "error" in made ? undefined : { saved: `R${made.revisionNo}` };
}

export const SELECTIONS_BUDGETS_RUNNERS: Runners<Key> = {
  sel_start: async (v) => {
    const unitId = String(v.unit_id);
    // The units list offers Start only to a unit with no revision at all.
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("selections")
      .select("revision_no")
      .eq("unit_id", unitId)
      .order("revision_no", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) return failed("selections", error);
    if (data) {
      return {
        error: `That unit already has R${data.revision_no}; the next revision starts from its issued one (sel_next).`,
      };
    }
    const done = await saving(() => startFirstRevision(unitId), "/selections/");
    return "error" in done ? done : revisionMade(done.path);
  },
  sel_next: async (v) => {
    const revision = await revisionOf(String(v.selection_id));
    if ("error" in revision) return revision;
    // Offered only on the issued revision; a superseded one has a later issue to start from.
    if (revision.status !== "issued") {
      return {
        error:
          revision.status === "draft"
            ? `R${revision.revisionNo} is still a draft; carry on with it.`
            : `R${revision.revisionNo} is superseded; the next revision starts from the latest issued one.`,
      };
    }
    const done = await saving(() => createNextRevision(String(v.selection_id)), "/selections/");
    return "error" in done ? done : revisionMade(done.path);
  },
  sel_spaces: {
    lines: async (header, lines) => {
      const draft = await draftOf(String(header.selection_id));
      if ("error" in draft) return draft;
      // The dialog offers active space types only.
      const supabase = await createClient();
      const types = [...new Set(lines.map((one) => String(one.space_type_id)))];
      const { data, error } = await supabase
        .from("space_types")
        .select("id, status")
        .in("id", types);
      if (error) return failed("space_types", error);
      const active = new Set(
        (data ?? []).filter((type) => type.status === "active").map((type) => type.id),
      );
      if (types.some((type) => !active.has(type)))
        return { error: "That space type is not in use." };
      return addSpaces(
        draft.unitId,
        lines.map((one) => ({ spaceTypeId: String(one.space_type_id), label: String(one.label) })),
      );
    },
  },
  sel_lines: {
    lines: async (header, lines) => {
      const selectionId = String(header.selection_id);
      const draft = await draftOf(selectionId);
      if ("error" in draft) return draft;
      // The add skips a quantity of 0 and an item it cannot read without a word, so both are refused first.
      if (lines.some((one) => !(Number(one.quantity) > 0)))
        return { error: "Each quantity is more than 0." };
      const pairs = lines.map((one) => `${String(one.space_id)}:${String(one.item_id)}`);
      if (new Set(pairs).size < pairs.length)
        return { error: "One item is named twice in a space; give it one row." };
      const spaceIds = [...new Set(lines.map((one) => String(one.space_id)))];
      const supabase = await createClient();
      const { data: spaces, error } = await supabase
        .from("spaces")
        .select("id, unit_id, label")
        .in("id", spaceIds);
      if (error) return failed("spaces", error);
      const label = new Map((spaces ?? []).map((space) => [space.id, space.label]));
      if (
        spaceIds.some(
          (id) => !(spaces ?? []).some((s) => s.id === id && s.unit_id === draft.unitId),
        )
      )
        return { error: "That space is in another unit." };
      // The picker searches active items only.
      for (const itemId of new Set(lines.map((one) => String(one.item_id)))) {
        const refused = await retired("items", itemId);
        if (refused) return refused;
      }
      // One add per space: the add puts every item it is given into every space it is given.
      const done: string[] = [];
      for (const spaceId of spaceIds) {
        const result = await addLines(
          selectionId,
          draft.unitId,
          [spaceId],
          lines
            .filter((one) => String(one.space_id) === spaceId)
            .map((one) => ({ itemId: String(one.item_id), quantity: Number(one.quantity) })),
        );
        if (result?.error) {
          return {
            error:
              done.length > 0
                ? `${done.join(", ")} saved, then ${label.get(spaceId) ?? "a space"}: ${result.error}`
                : result.error,
          };
        }
        done.push(label.get(spaceId) ?? "A space");
      }
      return undefined;
    },
  },
  sel_line_change: async (v) => {
    const now = await draftLine(String(v.line_id));
    if ("error" in now) return now;
    return updateLine(
      now.selectionId,
      String(v.line_id),
      Number(given(v, "quantity", now.quantity)),
      now.uom,
      given(v, "note", now.note) || null,
    );
  },
  sel_line_remove: async (v) => {
    const now = await draftLine(String(v.line_id));
    if ("error" in now) return now;
    return removeLine(now.selectionId, String(v.line_id));
  },
  sel_item_request: async (v) => {
    const made = await requestItem({
      name: String(v.name),
      categoryId: String(v.category_id),
      brandId: text(v, "brand_id"),
      specNote: text(v, "spec_note"),
      uom: String(v.uom),
    });
    return made.error ? { error: made.error } : { saved: "a provisional item" };
  },
  sel_issue: async (v) => {
    const selectionId = String(v.selection_id);
    const draft = await draftOf(selectionId);
    if ("error" in draft) return draft;
    // The editor offers Issue only once the revision has items.
    const supabase = await createClient();
    const { count, error } = await supabase
      .from("selection_lines")
      .select("id", { count: "exact", head: true })
      .eq("selection_id", selectionId);
    if (error) return failed("selection_lines", error);
    if (!count) return { error: "That revision has no items yet." };
    return issueSelection(selectionId, text(v, "notes"));
  },
  sel_delete: async (v) => {
    const draft = await draftOf(String(v.selection_id));
    if ("error" in draft) return draft;
    const done = await saving(
      () => deleteDraftSelection(String(v.selection_id)),
      "/selections/units",
    );
    return "error" in done ? done : undefined;
  },
  sel_view_caption: async (v) => {
    const photo = await photoOf(String(v.view_id));
    if ("error" in photo) return photo;
    return captionSpaceView(String(v.view_id), photo.draftId, text(v, "caption") ?? "");
  },
  sel_view_move: async (v) => {
    const photo = await photoOf(String(v.view_id));
    if ("error" in photo) return photo;
    const up = v.direction === "up";
    // The arrows are off at either end; the move would otherwise change nothing and say done.
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("space_views")
      .select("id")
      .eq("space_id", photo.spaceId)
      [up ? "lt" : "gt"]("sort_order", photo.sortOrder)
      .limit(1);
    if (error) return failed("space_views", error);
    if (!data?.length) return { error: `That photo is already ${up ? "first" : "last"}.` };
    return moveSpaceView(String(v.view_id), photo.draftId, up ? "up" : "down");
  },
  sel_view_delete: async (v) => {
    const photo = await photoOf(String(v.view_id));
    if ("error" in photo) return photo;
    return deleteSpaceView(String(v.view_id));
  },
  budget_start: async (v) => {
    const selectionId = String(v.selection_id);
    const revision = await revisionOf(selectionId);
    if ("error" in revision) return revision;
    // The pricing list offers issued revisions only, each priced once.
    if (revision.status !== "issued")
      return { error: `R${revision.revisionNo} is not the issued revision.` };
    const existing = await recordNow(
      "budgets",
      { column: "selection_id", id: selectionId },
      ["id"],
      null,
    );
    if ("error" in existing) return existing;
    if (existing.row.id) return { error: `R${revision.revisionNo} already has its budget.` };
    const done = await saving(() => startPricing(selectionId), "/budgets/");
    return "error" in done ? done : { saved: `R${revision.revisionNo}-v1` };
  },
  budget_line: async (v) => {
    const budget = await budgetOf(String(v.budget_id));
    if ("error" in budget) return budget;
    if (budget.status !== "pricing")
      return { error: "That budget is approved. Re-open it before changing prices." };
    const selected = await recordNow(
      "selection_lines",
      { column: "id", id: String(v.line_id) },
      ["selection_id", "line_key", "quantity", "item_id"],
      "That item line is gone.",
    );
    if ("error" in selected) return selected;
    if (selected.row.selection_id !== budget.selectionId)
      return { error: "That item line is on another revision." };
    const lineKey = String(selected.row.line_key);

    const supabase = await createClient();
    const [priced, margin] = await Promise.all([
      supabase
        .from("budget_lines")
        .select("quantity, expected_vendor_id, unit_cost, margin_pct, notes")
        .eq("budget_id", String(v.budget_id))
        .eq("line_key", lineKey)
        .maybeSingle(),
      supabase
        .from("item_margins")
        .select("margin_pct")
        .eq("item_id", String(selected.row.item_id))
        .maybeSingle(),
    ]);
    if (priced.error) return failed("budget_lines", priced.error);
    if (margin.error) return failed("item_margins", margin.error);
    // What the grid shows for a line before it is priced: the designer's quantity and the item's margin.
    const now = priced.data ?? {
      quantity: selected.row.quantity as number,
      expected_vendor_id: null,
      unit_cost: null,
      margin_pct: margin.data?.margin_pct ?? null,
      notes: null,
    };

    const vendorId = given(v, "vendor_id", now.expected_vendor_id) || null;
    // The grid offers active vendors, and keeps the one already on the line.
    if (vendorId && vendorId !== now.expected_vendor_id) {
      const refused = await retired("vendors", vendorId);
      if (refused) return refused;
    }
    const unitCost = given(v, "unit_cost", now.unit_cost);
    const marginPct = given(v, "margin_pct", now.margin_pct);
    return saveLine(String(v.budget_id), budget.selectionId, lineKey, {
      quantity: Number(given(v, "quantity", now.quantity)),
      expectedVendorId: vendorId,
      unitCost: unitCost === "" ? null : Number(unitCost),
      marginPct: marginPct === "" ? null : Number(marginPct),
      notes: given(v, "notes", now.notes) || null,
    });
  },
  budget_approve: (v) => approveBudget(String(v.budget_id)),
  budget_reopen: async (v) => {
    const budget = await budgetOf(String(v.budget_id));
    if ("error" in budget) return budget;
    if (budget.status !== "approved") return { error: "That budget is still pricing." };
    return reopenBudget(String(v.budget_id));
  },
  budget_margin: (v) => setItemMargin(String(v.item_id), numberOf(v, "margin_pct")),
  budget_delete: async (v) => {
    const budget = await budgetOf(String(v.budget_id));
    if ("error" in budget) return budget;
    // Delete is offered only on a first pricing; a re-opened budget stays.
    if (budget.status !== "pricing" || budget.version !== 1)
      return { error: "Only a budget on its first pricing, not approved, can be deleted." };
    const done = await saving(() => deleteBudget(String(v.budget_id)), "/budgets/interiors");
    return "error" in done ? done : undefined;
  },
};
