"use server";

// Type-only import, never re-exported from a "use server" file — the
// 2026-08-03 outage rule, enforced by npm run check:actions.
import type { ActionState } from "@/lib/action-state";
import { requireTool } from "@/lib/auth/access";
import { text } from "@/lib/form-data";
import { createClient } from "@/lib/supabase/server";
import {
  LABOUR_KIND_LABEL,
  labourShape,
  type LabourKind,
  type LabourShape,
} from "@/lib/supervisors/labour";
import { revalidatePath } from "next/cache";

const GRANT = "/supervisors";
const NOTE_LIMIT = 2000;

/**
 * Writes for the Supervisors app. Two tables, both its own: labour_logs
 * and issue_requests. Nothing here writes another tool's table — the
 * store-keeper's fulfil/decline lives in lib/inventory (Step H), the
 * documented exception. Every action opens with requireTool and
 * revalidates the layout, or the welcome counts go stale while the
 * moved list refreshes (the exact-path trap in CLAUDE.md).
 */

function count(formData: FormData, field: string): number {
  const raw = String(formData.get(field) ?? "").trim();
  if (!raw) return 0;
  return Number(raw);
}

type LabourFields = LabourShape & {
  plot_id: string;
  work_item_id: string;
  contractor_id: string;
  log_date: string;
  note: string | null;
};

/**
 * The form as a row (0104): daily wages, piece-work by quantity, or a
 * lump sum. A measured log takes the work's unit from the rate book
 * (work_unit_facts, money-free), never a unit typed on the phone.
 */
async function readLabourFields(
  supabase: Awaited<ReturnType<typeof createClient>>,
  formData: FormData,
): Promise<LabourFields | { error: string }> {
  const plotId = text(formData, "plot_id");
  const workItemId = text(formData, "work_item_id");
  const contractorId = text(formData, "contractor_id");
  const logDate = text(formData, "log_date");
  const kind = text(formData, "kind") || "nmr";
  const note = text(formData, "note");

  if (!plotId) return { error: "Pick the villa." };
  if (!workItemId) return { error: "Pick the work the labour was on." };
  if (!contractorId) return { error: "Pick the contractor." };
  if (!logDate) return { error: "Pick the date." };
  if (note.length > NOTE_LIMIT) {
    return { error: `Keep the note under ${NOTE_LIMIT} characters.` };
  }

  let workUom: string | null = null;
  if (kind === "pw_qty") {
    const { data, error } = await supabase
      .from("work_unit_facts")
      .select("uom")
      .eq("work_item_id", workItemId)
      .maybeSingle();
    if (error) {
      console.error("readLabourFields work unit failed:", error);
      return { error: "Could not read the work's unit. Try again." };
    }
    workUom = data?.uom ?? null;
  }

  const quantityRaw = text(formData, "quantity").replace(/[,\s]/g, "");
  const shape = labourShape({
    kind,
    masons: count(formData, "masons"),
    helpers: count(formData, "helpers"),
    others: count(formData, "others"),
    quantity: quantityRaw ? Number(quantityRaw) : null,
    workUom,
    description: text(formData, "description"),
  });
  if ("error" in shape) return shape;

  return {
    ...shape,
    plot_id: plotId,
    work_item_id: workItemId,
    contractor_id: contractorId,
    log_date: logDate,
    note: note || null,
  };
}

const sameDayMessage = (kind: LabourKind) =>
  `That day already has a ${LABOUR_KIND_LABEL[kind].toLowerCase()} entry for this contractor and work — edit that one instead.`;

/** The guard's refusal for a log already on a bill (0104). */
const BILLED_MESSAGE = "This log is on a bill now, so it can't be changed or deleted.";

export async function recordLabourLog(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireTool(GRANT);
  const supabase = await createClient();
  const fields = await readLabourFields(supabase, formData);
  if ("error" in fields) return fields;

  const { error } = await supabase
    .from("labour_logs")
    .insert({ ...fields, created_by: user.id, updated_by: user.id });
  if (error) {
    if (error.code === "23505") return { error: sameDayMessage(fields.kind) };
    console.error("recordLabourLog failed:", error);
    return {
      error: error.message.includes("contractor")
        ? error.message
        : "Could not save the log. Try again.",
    };
  }

  revalidatePath("/supervisors", "layout");
  return undefined;
}

export async function updateLabourLog(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireTool(GRANT);
  const id = text(formData, "id");
  if (!id) return { error: "Which log?" };
  const supabase = await createClient();
  const fields = await readLabourFields(supabase, formData);
  if ("error" in fields) return fields;

  const { error } = await supabase
    .from("labour_logs")
    .update({
      work_item_id: fields.work_item_id,
      contractor_id: fields.contractor_id,
      log_date: fields.log_date,
      kind: fields.kind,
      masons: fields.masons,
      helpers: fields.helpers,
      others: fields.others,
      quantity: fields.quantity,
      uom: fields.uom,
      description: fields.description,
      note: fields.note,
      updated_by: user.id,
    })
    .eq("id", id);
  if (error) {
    if (error.code === "23505") return { error: sameDayMessage(fields.kind) };
    if (error.message.includes("bill")) return { error: BILLED_MESSAGE };
    console.error("updateLabourLog failed:", error);
    return { error: "Could not save the change. Try again." };
  }

  revalidatePath("/supervisors", "layout");
  return undefined;
}

export async function deleteLabourLog(id: string): Promise<ActionState> {
  await requireTool(GRANT);
  if (!id) return { error: "Which log?" };

  const supabase = await createClient();
  const { error } = await supabase.from("labour_logs").delete().eq("id", id);
  if (error) {
    if (error.message.includes("bill")) return { error: BILLED_MESSAGE };
    console.error("deleteLabourLog failed:", error);
    return { error: "Could not delete the log. Try again." };
  }

  revalidatePath("/supervisors", "layout");
  return undefined;
}

// ---------------------------------------------------------------------
// Requests for issue
// ---------------------------------------------------------------------

export async function createIssueRequest(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireTool(GRANT);
  const plotId = text(formData, "plot_id");
  const workItemId = text(formData, "work_item_id");
  const itemId = text(formData, "item_id");
  const quantityRaw = text(formData, "quantity").replace(/[,\s]/g, "");
  const note = text(formData, "note");

  if (!plotId) return { error: "Pick the villa." };
  if (!workItemId) return { error: "Say which work the material is for." };
  if (!itemId) return { error: "Pick the material." };
  const quantity = Number(quantityRaw);
  if (!quantityRaw || Number.isNaN(quantity) || quantity <= 0) {
    return { error: "The quantity must be a number above zero." };
  }
  if (note.length > NOTE_LIMIT) {
    return { error: `Keep the note under ${NOTE_LIMIT} characters.` };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("issue_requests").insert({
    plot_id: plotId,
    work_item_id: workItemId,
    item_id: itemId,
    quantity,
    note: note || null,
    created_by: user.id,
    updated_by: user.id,
  });
  if (error) {
    console.error("createIssueRequest failed:", error);
    return { error: "Could not send the request. Try again." };
  }

  revalidatePath("/supervisors", "layout");
  return undefined;
}

export async function withdrawIssueRequest(id: string): Promise<ActionState> {
  await requireTool(GRANT);
  if (!id) return { error: "Which request?" };

  const supabase = await createClient();
  // The delete policy only reaches rows still 'requested'; a resolved
  // request matches nothing and the count says so honestly.
  const { error, count: deleted } = await supabase
    .from("issue_requests")
    .delete({ count: "exact" })
    .eq("id", id)
    .eq("status", "requested");
  if (error) {
    console.error("withdrawIssueRequest failed:", error);
    return { error: "Could not withdraw the request. Try again." };
  }
  if (!deleted) {
    return { error: "The store has already answered this request — it can't be withdrawn now." };
  }

  revalidatePath("/supervisors", "layout");
  return undefined;
}
