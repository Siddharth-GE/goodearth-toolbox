"use server";

// Type-only import, never re-exported from a "use server" file (check:actions enforces it).
import type { ActionState } from "@/lib/action-state";
import { requireTool } from "@/lib/auth/access";
import { dbErrorMessage } from "@/lib/db-error";
import { text } from "@/lib/form-data";
import { createClient } from "@/lib/supabase/server";
import { checkUpload, extensionFor, storeUpload } from "@/lib/uploads/store";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { checkStatusOf, signOffProblem } from "./checklists";

/** Site checklists (0134). site_checklists_guard and site_checklist_items_guard hold the rules: a signed-off checklist never
 * changes, and sign-off needs every item answered with a remark on each Fail and N/A. The checks here are for the message. */

const GRANT = "/supervisors";
const BUCKET = "site-checklists";
const TEXT_LIMIT = 500;

const refresh = () => revalidatePath("/supervisors", "layout");
const refused = (error: { message: string }, fallback: string): ActionState => ({
  error: dbErrorMessage(error, fallback, [
    "signed off",
    "never change",
    "Answer every",
    "Say what",
  ]),
});

/** A checklist starts with one unanswered row per active item of its template, then opens. */
export async function startChecklist(
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireTool(GRANT);
  const plotId = text(formData, "plot_id");
  const templateId = text(formData, "template_id");
  const location = text(formData, "location");
  const drawingRevision = text(formData, "drawing_revision");
  if (!plotId) return { error: "Which villa?" };
  if (!templateId) return { error: "Pick the checklist." };
  if (location.length > TEXT_LIMIT || drawingRevision.length > TEXT_LIMIT) {
    return { error: `Keep each field under ${TEXT_LIMIT} characters.` };
  }

  const supabase = await createClient();
  const { data: templateItems, error: itemsError } = await supabase
    .from("checklist_template_items")
    .select("id")
    .eq("template_id", templateId)
    .eq("is_active", true)
    .order("sort_order");
  if (itemsError) {
    console.error("startChecklist template read failed:", itemsError);
    return { error: "Could not read the checklist. Try again." };
  }
  if (!templateItems?.length) return { error: "That checklist has no items to check." };

  const { data: checklist, error } = await supabase
    .from("site_checklists")
    .insert({
      plot_id: plotId,
      template_id: templateId,
      location: location || null,
      drawing_revision: drawingRevision || null,
      created_by: user.id,
      updated_by: user.id,
    })
    .select("id")
    .single();
  if (error || !checklist) {
    console.error("startChecklist failed:", error);
    return { error: "Could not start the checklist. Try again." };
  }

  const { error: rowsError } = await supabase.from("site_checklist_items").insert(
    templateItems.map((item) => ({
      checklist_id: checklist.id,
      template_item_id: item.id,
      created_by: user.id,
      updated_by: user.id,
    })),
  );
  if (rowsError) {
    console.error("startChecklist items failed:", rowsError);
    const { error: undoError } = await supabase
      .from("site_checklists")
      .delete()
      .eq("id", checklist.id);
    if (undoError) console.error("startChecklist cleanup failed:", undoError);
    return { error: "Could not start the checklist. Try again." };
  }

  refresh();
  redirect(`/supervisors/villas/${plotId}/checklists/${checklist.id}`);
}

export type ChecklistDetailsInput = {
  location: string | null;
  drawingRevision: string | null;
  finishedOn: string | null;
  inspectedOn: string | null;
  note: string | null;
};

export async function updateChecklistDetails(
  checklistId: string,
  input: ChecklistDetailsInput,
): Promise<ActionState> {
  const user = await requireTool(GRANT);
  const fields = [input.location, input.drawingRevision, input.note];
  if (fields.some((field) => (field ?? "").length > TEXT_LIMIT * 4)) {
    return { error: "That is too long to save." };
  }
  const supabase = await createClient();
  const { error } = await supabase
    .from("site_checklists")
    .update({
      location: input.location?.trim() || null,
      drawing_revision: input.drawingRevision?.trim() || null,
      finished_on: input.finishedOn || null,
      inspected_on: input.inspectedOn || null,
      note: input.note?.trim() || null,
      updated_by: user.id,
    })
    .eq("id", checklistId);
  if (error) {
    console.error("updateChecklistDetails failed:", error);
    return refused(error, "Could not save. Try again.");
  }
  refresh();
  return undefined;
}

export async function answerChecklistItem(
  itemId: string,
  input: { status: string; remarks: string | null },
): Promise<ActionState> {
  const user = await requireTool(GRANT);
  const status = checkStatusOf(input.status);
  if (!status) return { error: "Pick Pass, Fail or N/A." };
  if ((input.remarks ?? "").length > TEXT_LIMIT * 4) return { error: "That remark is too long." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("site_checklist_items")
    .update({ status, remarks: input.remarks?.trim() || null, updated_by: user.id })
    .eq("id", itemId);
  if (error) {
    console.error("answerChecklistItem failed:", error);
    return refused(error, "Could not save the answer. Try again.");
  }
  refresh();
  return undefined;
}

export async function signOffChecklist(checklistId: string): Promise<ActionState> {
  const user = await requireTool(GRANT);
  const supabase = await createClient();
  const { data: items, error: readError } = await supabase
    .from("site_checklist_items")
    .select("status, remarks")
    .eq("checklist_id", checklistId);
  if (readError) {
    console.error("signOffChecklist read failed:", readError);
    return { error: "Could not read the checklist. Try again." };
  }
  const problem = signOffProblem(
    (items ?? []).map((item) => ({
      status: checkStatusOf(item.status) ?? "not_checked",
      remarks: item.remarks,
    })),
  );
  if (problem) return { error: problem };

  const { error } = await supabase
    .from("site_checklists")
    .update({
      status: "signed_off",
      signed_off_by: user.id,
      signed_off_at: new Date().toISOString(),
      updated_by: user.id,
    })
    .eq("id", checklistId);
  if (error) {
    console.error("signOffChecklist failed:", error);
    return refused(error, "Could not sign the checklist off. Try again.");
  }
  refresh();
  return undefined;
}

/** Only an open checklist can go — one started by mistake. Its items go with it. */
export async function deleteChecklist(checklistId: string, plotId: string): Promise<ActionState> {
  await requireTool(GRANT);
  const supabase = await createClient();
  const { error, count } = await supabase
    .from("site_checklists")
    .delete({ count: "exact" })
    .eq("id", checklistId)
    .eq("status", "open");
  if (error) {
    console.error("deleteChecklist failed:", error);
    return { error: "Could not delete the checklist. Try again." };
  }
  if (!count) return { error: "A signed-off checklist is a record — it can't be deleted." };
  refresh();
  redirect(`/supervisors/villas/${plotId}`);
}

/** One file per checklist — a test certificate or a photo — in the private site-checklists bucket. A new one replaces it. */
export async function uploadChecklistFile(
  checklistId: string,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireTool(GRANT);
  const file = checkUpload(formData.get("file"));
  if (typeof file === "string") return { error: file };

  const supabase = await createClient();
  const path = `checklists/${checklistId}/${crypto.randomUUID()}.${extensionFor(file.type)}`;
  const stored = await storeUpload(supabase, BUCKET, path, file);
  if (stored) return { error: stored };

  const { error } = await supabase
    .from("site_checklists")
    .update({ attachment_path: path, updated_by: user.id })
    .eq("id", checklistId);
  if (error) {
    // No delete policy on the bucket: an orphaned object is unreachable without its row.
    console.error("uploadChecklistFile row write failed:", error);
    return refused(error, "Could not attach the file. Try again.");
  }
  refresh();
  return undefined;
}

// Templates: kept here by /supervisors, switched off rather than deleted. An item's wording is never rewritten, because
// signed-off checklists point at it: a changed check is the old one switched off and a new one added.

export async function createChecklistTemplate(
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireTool(GRANT);
  const name = text(formData, "name");
  if (!name) return { error: "Name the checklist." };
  if (name.length > 120) return { error: "Keep the name under 120 characters." };

  const supabase = await createClient();
  const { data: last, error: orderError } = await supabase
    .from("checklist_templates")
    .select("sort_order")
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (orderError) {
    console.error("createChecklistTemplate order read failed:", orderError);
    return { error: "Could not add the checklist. Try again." };
  }
  const { error } = await supabase.from("checklist_templates").insert({
    name,
    work_refs: text(formData, "work_refs") || null,
    note: text(formData, "note") || null,
    sort_order: (last?.sort_order ?? 0) + 1,
    created_by: user.id,
    updated_by: user.id,
  });
  if (error) {
    console.error("createChecklistTemplate failed:", error);
    return {
      error:
        error.code === "23505"
          ? "A checklist with that name already exists."
          : "Could not add the checklist. Try again.",
    };
  }
  refresh();
  return undefined;
}

export async function updateChecklistTemplate(
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireTool(GRANT);
  const id = text(formData, "id");
  const name = text(formData, "name");
  if (!id) return { error: "Which checklist?" };
  if (!name) return { error: "Name the checklist." };
  if (name.length > 120) return { error: "Keep the name under 120 characters." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("checklist_templates")
    .update({
      name,
      work_refs: text(formData, "work_refs") || null,
      note: text(formData, "note") || null,
      updated_by: user.id,
    })
    .eq("id", id);
  if (error) {
    console.error("updateChecklistTemplate failed:", error);
    return {
      error:
        error.code === "23505"
          ? "A checklist with that name already exists."
          : "Could not save the checklist. Try again.",
    };
  }
  refresh();
  return undefined;
}

export async function setChecklistTemplateActive(
  id: string,
  active: boolean,
): Promise<ActionState> {
  const user = await requireTool(GRANT);
  const supabase = await createClient();
  const { error } = await supabase
    .from("checklist_templates")
    .update({ is_active: active, updated_by: user.id })
    .eq("id", id);
  if (error) {
    console.error("setChecklistTemplateActive failed:", error);
    return { error: "Could not save. Try again." };
  }
  refresh();
  return undefined;
}

export async function addChecklistTemplateItem(
  templateId: string,
  itemText: string,
): Promise<ActionState> {
  const user = await requireTool(GRANT);
  const value = itemText.trim();
  if (!value) return { error: "Type the check." };
  if (value.length > TEXT_LIMIT) return { error: `Keep a check under ${TEXT_LIMIT} characters.` };

  const supabase = await createClient();
  const { data: last, error: orderError } = await supabase
    .from("checklist_template_items")
    .select("sort_order")
    .eq("template_id", templateId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (orderError) {
    console.error("addChecklistTemplateItem order read failed:", orderError);
    return { error: "Could not add the check. Try again." };
  }
  const { error } = await supabase.from("checklist_template_items").insert({
    template_id: templateId,
    sort_order: (last?.sort_order ?? 0) + 1,
    text: value,
    origin: "added",
    created_by: user.id,
    updated_by: user.id,
  });
  if (error) {
    console.error("addChecklistTemplateItem failed:", error);
    return { error: "Could not add the check. Try again." };
  }
  refresh();
  return undefined;
}

export async function setChecklistTemplateItemActive(
  id: string,
  active: boolean,
): Promise<ActionState> {
  const user = await requireTool(GRANT);
  const supabase = await createClient();
  const { error } = await supabase
    .from("checklist_template_items")
    .update({ is_active: active, updated_by: user.id })
    .eq("id", id);
  if (error) {
    console.error("setChecklistTemplateItemActive failed:", error);
    return { error: "Could not save. Try again." };
  }
  refresh();
  return undefined;
}
