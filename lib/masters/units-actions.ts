"use server";

import type { ActionState } from "@/lib/action-state";
import { requireTool } from "@/lib/auth/access";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import type { UnitStatus, UnitType } from "./units";

const UNIT_TYPES = ["apartment", "villa", "duplex_row_house"];
const UNIT_STATUSES = ["available", "reserved", "sold"];

export type UnitFormState = ActionState;

function readUnitForm(formData: FormData) {
  return {
    project_id: String(formData.get("project_id") ?? ""),
    // Required since 0029: every unit sits on exactly one plot.
    plot_id: String(formData.get("plot_id") ?? ""),
    name: String(formData.get("name") ?? "").trim(),
    // Normalised the way poReference() expects: uppercase, no spaces.
    // The DB CHECK (^[A-Z0-9-]{2,10}$, migration 0021) is the backstop.
    code:
      String(formData.get("code") ?? "")
        .trim()
        .toUpperCase()
        .replace(/\s+/g, "") || null,
    unit_type: String(formData.get("unit_type") ?? "") as UnitType,
    client_id: String(formData.get("client_id") ?? "") || null,
    status: String(formData.get("status") ?? "available") as UnitStatus,
  };
}

const CODE_SHAPE = /^[A-Z0-9-]{2,10}$/;

function validateCode(code: string | null): string | undefined {
  if (code !== null && !CODE_SHAPE.test(code)) {
    return "Codes are 2–10 letters, digits or dashes, e.g. V12A.";
  }
  return undefined;
}

// Two unique constraints can fire a 23505 here: the per-project code,
// and the one-unit-per-plot index (0029). The constraint name in the
// message tells them apart.
function duplicateError(message: string): string {
  if (message.includes("units_plot_id_key")) {
    return "That plot already has a unit — one unit per plot.";
  }
  return "That code is already used by another unit in this project.";
}

export async function createUnit(
  _state: UnitFormState,
  formData: FormData,
): Promise<UnitFormState> {
  await requireTool("/masters");

  const { project_id, plot_id, name, code, unit_type, client_id, status } = readUnitForm(formData);
  if (!project_id) return { error: "Choose a project." };
  if (!plot_id) return { error: "Choose a plot — every unit sits on one." };
  if (!name) return { error: "Enter a unit name." };
  const codeError = validateCode(code);
  if (codeError) return { error: codeError };
  if (!UNIT_TYPES.includes(unit_type)) return { error: "Choose a unit type." };
  if (!UNIT_STATUSES.includes(status)) return { error: "Choose a status." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("units")
    .insert({ project_id, plot_id, name, code, unit_type, client_id, status });
  if (error) {
    if (error.code === "23505") return { error: duplicateError(error.message) };
    console.error("createUnit failed:", error);
    return { error: "Could not create unit. Try again." };
  }

  revalidatePath("/masters/units");
  return undefined;
}

// Also how "assign a client" happens — the edit form just includes the
// client picker, no separate action needed.
export async function updateUnit(
  id: string,
  _state: UnitFormState,
  formData: FormData,
): Promise<UnitFormState> {
  const user = await requireTool("/masters");

  const { project_id, plot_id, name, code, unit_type, client_id, status } = readUnitForm(formData);
  if (!project_id) return { error: "Choose a project." };
  if (!plot_id) return { error: "Choose a plot — every unit sits on one." };
  if (!name) return { error: "Enter a unit name." };
  const codeError = validateCode(code);
  if (codeError) return { error: codeError };
  if (!UNIT_TYPES.includes(unit_type)) return { error: "Choose a unit type." };
  if (!UNIT_STATUSES.includes(status)) return { error: "Choose a status." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("units")
    .update({ project_id, plot_id, name, code, unit_type, client_id, status, updated_by: user.id })
    .eq("id", id);
  if (error) {
    if (error.code === "23505") return { error: duplicateError(error.message) };
    console.error("updateUnit failed:", error);
    return { error: "Could not update unit. Try again." };
  }

  revalidatePath("/masters/units");
  return undefined;
}
