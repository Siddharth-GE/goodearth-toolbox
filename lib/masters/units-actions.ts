"use server";

import { requireApp } from "@/lib/auth/access";
import { requireUser } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import type { UnitStatus, UnitType } from "./units";

const UNIT_TYPES = ["apartment", "villa", "duplex_row_house"];
const UNIT_STATUSES = ["available", "reserved", "sold"];

export type UnitFormState = { error?: string } | undefined;

function readUnitForm(formData: FormData) {
  return {
    project_id: String(formData.get("project_id") ?? ""),
    plot_id: String(formData.get("plot_id") ?? "") || null,
    name: String(formData.get("name") ?? "").trim(),
    unit_type: String(formData.get("unit_type") ?? "") as UnitType,
    client_id: String(formData.get("client_id") ?? "") || null,
    status: String(formData.get("status") ?? "available") as UnitStatus,
  };
}

export async function createUnit(_state: UnitFormState, formData: FormData): Promise<UnitFormState> {
  const user = await requireUser();
  await requireApp(user, "/masters");

  const { project_id, plot_id, name, unit_type, client_id, status } = readUnitForm(formData);
  if (!project_id) return { error: "Choose a project." };
  if (!name) return { error: "Enter a unit name." };
  if (!UNIT_TYPES.includes(unit_type)) return { error: "Choose a unit type." };
  if (!UNIT_STATUSES.includes(status)) return { error: "Choose a status." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("units")
    .insert({ project_id, plot_id, name, unit_type, client_id, status });
  if (error) {
    console.error("createUnit failed:", error);
    return { error: "Could not create unit. Try again." };
  }

  revalidatePath("/masters/units");
  return undefined;
}

// Also how "assign a client" happens — the edit form just includes the
// client picker, no separate action needed.
export async function updateUnit(id: string, _state: UnitFormState, formData: FormData): Promise<UnitFormState> {
  const user = await requireUser();
  await requireApp(user, "/masters");

  const { project_id, plot_id, name, unit_type, client_id, status } = readUnitForm(formData);
  if (!project_id) return { error: "Choose a project." };
  if (!name) return { error: "Enter a unit name." };
  if (!UNIT_TYPES.includes(unit_type)) return { error: "Choose a unit type." };
  if (!UNIT_STATUSES.includes(status)) return { error: "Choose a status." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("units")
    .update({ project_id, plot_id, name, unit_type, client_id, status })
    .eq("id", id);
  if (error) {
    console.error("updateUnit failed:", error);
    return { error: "Could not update unit. Try again." };
  }

  revalidatePath("/masters/units");
  return undefined;
}
