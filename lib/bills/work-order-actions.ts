"use server";

// Type-only import, never re-exported from a "use server" file — the
// 2026-08-03 outage rule, enforced by npm run check:actions.
import type { ActionState } from "@/lib/action-state";
import { requireTool } from "@/lib/auth/access";
import { guardError } from "@/lib/db-error";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { workOrderProblem, workOrderTotal, type WorkOrderLineInput } from "./work-orders";

/**
 * Writes for work orders (0105, plan.md B6). The database holds the
 * rules — labour_contracts_guard (number permanent, terms and value
 * permanent once approved, who may approve), the lines' pending-only
 * trigger, and the trigger that makes the value the lines' sum. These
 * actions say the same things first, in words. Approving and switching
 * an order off are the existing approveLabourContract and
 * setLabourContractActive.
 */

const WO_GUARD_PHRASES = [
  "permanent",
  "short code",
  "approved",
  "approver",
  "approval limit",
  "no longer change",
] as const;

export type WorkOrderSaveInput = {
  vendorId: string;
  projectId: string;
  plotId: string | null;
  unitId: string | null;
  description: string;
  terms: string | null;
  lines: WorkOrderLineInput[];
};

function invalid(input: WorkOrderSaveInput): string | undefined {
  if (input.plotId && input.unitId) return "A work order is for one plot or one unit, not both.";
  return workOrderProblem(input);
}

const lineRows = (contractId: string, userId: string, lines: WorkOrderLineInput[]) =>
  lines.map((line, index) => ({
    contract_id: contractId,
    sort_order: index,
    work_item_id: line.workItemId,
    description: line.description.trim(),
    is_lump_sum: line.isLumpSum,
    quantity: line.isLumpSum ? null : line.quantity,
    uom: line.isLumpSum ? null : line.uom,
    rate: line.rate ?? 0,
    created_by: userId,
    updated_by: userId,
  }));

/** A new work order, pending approval, numbered by the database. */
export async function createWorkOrder(input: WorkOrderSaveInput): Promise<ActionState> {
  const user = await requireTool("/bills");
  const problem = invalid(input);
  if (problem) return { error: problem };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("labour_contracts")
    .insert({
      vendor_id: input.vendorId,
      project_id: input.projectId,
      plot_id: input.plotId,
      unit_id: input.unitId,
      description: input.description.trim(),
      // The lines' sum; the database rewrites it from the lines below.
      contract_value: workOrderTotal(input.lines),
      terms: input.terms?.trim() || null,
      created_by: user.id,
      updated_by: user.id,
    })
    .select("id, reference")
    .single();
  if (error) {
    console.error("createWorkOrder failed:", error);
    return guardError(error, "Could not make the work order. Try again.", WO_GUARD_PHRASES);
  }

  const { error: linesError } = await supabase
    .from("labour_contract_lines")
    .insert(lineRows(data.id, user.id, input.lines));
  revalidatePath("/bills", "layout");
  if (linesError) {
    console.error("createWorkOrder lines failed:", linesError);
    return {
      error: `${data.reference ?? "The work order"} was made, but its works were refused — open it from the list and add them again.`,
    };
  }
  redirect(`/bills/work-orders/${data.id}`);
}

/**
 * Saves a pending order: its header, then its works as given — the new
 * list goes in first and the old lines come out after, so a refusal
 * part-way never leaves the order with nothing. The project is part of
 * the number and stays as it was made.
 */
export async function saveWorkOrder(id: string, input: WorkOrderSaveInput): Promise<ActionState> {
  const user = await requireTool("/bills");
  const problem = invalid(input);
  if (problem) return { error: problem };

  const supabase = await createClient();
  const { data: current, error: readError } = await supabase
    .from("labour_contracts")
    .select("status")
    .eq("id", id)
    .maybeSingle();
  if (readError) {
    console.error("saveWorkOrder read failed:", readError);
    return { error: "Could not read the work order. Try again." };
  }
  if (!current) return { error: "That work order no longer exists." };
  if (current.status !== "pending_approval") {
    return { error: "This work order is approved — its works and terms can no longer change." };
  }

  const { data: oldLines, error: oldError } = await supabase
    .from("labour_contract_lines")
    .select("id")
    .eq("contract_id", id);
  if (oldError) {
    console.error("saveWorkOrder lines read failed:", oldError);
    return { error: "Could not read the work order's works. Try again." };
  }

  const { error: headerError } = await supabase
    .from("labour_contracts")
    .update({
      vendor_id: input.vendorId,
      plot_id: input.plotId,
      unit_id: input.unitId,
      description: input.description.trim(),
      terms: input.terms?.trim() || null,
      updated_by: user.id,
    })
    .eq("id", id);
  if (headerError) {
    console.error("saveWorkOrder header failed:", headerError);
    return guardError(headerError, "Could not save the work order. Try again.", WO_GUARD_PHRASES);
  }

  const { error: insertError } = await supabase
    .from("labour_contract_lines")
    .insert(lineRows(id, user.id, input.lines));
  if (insertError) {
    console.error("saveWorkOrder lines insert failed:", insertError);
    revalidatePath("/bills", "layout");
    return guardError(
      insertError,
      "The details were saved, but the works were refused. Try again.",
      WO_GUARD_PHRASES,
    );
  }
  const oldIds = (oldLines ?? []).map((line) => line.id);
  if (oldIds.length) {
    const { error: deleteError } = await supabase
      .from("labour_contract_lines")
      .delete()
      .in("id", oldIds);
    if (deleteError) {
      console.error("saveWorkOrder old lines delete failed:", deleteError);
      revalidatePath("/bills", "layout");
      return {
        error:
          "The new works were saved but the old ones could not be removed — check the list below and remove the extras.",
      };
    }
  }

  revalidatePath("/bills", "layout");
  return undefined;
}

/** "Save as template": the order's terms and works, without quantities or rates. */
export async function saveWorkOrderAsTemplate(id: string, name: string): Promise<ActionState> {
  const user = await requireTool("/bills");
  const templateName = name.trim();
  if (!templateName) return { error: "Name the template." };

  const supabase = await createClient();
  const [{ data: order, error: orderError }, { data: lines, error: linesError }] =
    await Promise.all([
      supabase.from("labour_contracts").select("terms").eq("id", id).maybeSingle(),
      supabase
        .from("labour_contract_lines")
        .select("work_item_id, description, is_lump_sum, uom, sort_order")
        .eq("contract_id", id)
        .order("sort_order")
        .order("created_at"),
    ]);
  if (orderError || linesError) {
    console.error("saveWorkOrderAsTemplate read failed:", orderError ?? linesError);
    return { error: "Could not read the work order. Try again." };
  }
  if (!order) return { error: "That work order no longer exists." };
  if (!lines?.length) return { error: "A template needs at least one work — add some first." };

  const { data: template, error } = await supabase
    .from("work_order_templates")
    .insert({ name: templateName, terms: order.terms, created_by: user.id, updated_by: user.id })
    .select("id")
    .single();
  if (error) {
    if (error.code === "23505") return { error: "A template with that name already exists." };
    console.error("saveWorkOrderAsTemplate failed:", error);
    return { error: "Could not save the template. Try again." };
  }

  const { error: templateLinesError } = await supabase.from("work_order_template_lines").insert(
    lines.map((line, index) => ({
      template_id: template.id,
      sort_order: index,
      work_item_id: line.work_item_id,
      description: line.description,
      is_lump_sum: line.is_lump_sum,
      uom: line.uom,
      created_by: user.id,
      updated_by: user.id,
    })),
  );
  revalidatePath("/bills", "layout");
  if (templateLinesError) {
    console.error("saveWorkOrderAsTemplate lines failed:", templateLinesError);
    return {
      error: `The template "${templateName}" was made without its works — switch it off under Templates and try again.`,
    };
  }
  return undefined;
}

/** A template is never deleted — switched off, it stops being offered. */
export async function setWorkOrderTemplateActive(
  templateId: string,
  isActive: boolean,
): Promise<ActionState> {
  const user = await requireTool("/bills");
  const supabase = await createClient();
  const { error } = await supabase
    .from("work_order_templates")
    .update({ is_active: isActive, updated_by: user.id })
    .eq("id", templateId);
  if (error) {
    console.error("setWorkOrderTemplateActive failed:", error);
    return { error: "Could not change the template. Try again." };
  }
  revalidatePath("/bills", "layout");
  return undefined;
}
