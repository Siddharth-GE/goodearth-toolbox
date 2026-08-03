"use server";

import type { ActionState } from "@/lib/action-state";
import { requireTool } from "@/lib/auth/access";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import type { PlotStatus } from "./plots";

const PLOT_STATUSES = ["available", "reserved", "sold"];

export type PlotFormState = ActionState;

function readPlotForm(formData: FormData) {
  return {
    project_id: String(formData.get("project_id") ?? ""),
    name: String(formData.get("name") ?? "").trim(),
    // Normalised the way poReference() expects: uppercase, no spaces.
    // The DB CHECK (^[A-Z0-9-]{2,10}$, migration 0021) is the backstop.
    code:
      String(formData.get("code") ?? "")
        .trim()
        .toUpperCase()
        .replace(/\s+/g, "") || null,
    area: formData.get("area") ? Number(formData.get("area")) : null,
    status: String(formData.get("status") ?? "available") as PlotStatus,
  };
}

const CODE_SHAPE = /^[A-Z0-9-]{2,10}$/;

function validateCode(code: string | null): string | undefined {
  if (code !== null && !CODE_SHAPE.test(code)) {
    return "Codes are 2–10 letters, digits or dashes, e.g. P12.";
  }
  return undefined;
}

export async function createPlot(
  _state: PlotFormState,
  formData: FormData,
): Promise<PlotFormState> {
  await requireTool("/masters");

  const { project_id, name, code, area, status } = readPlotForm(formData);
  if (!project_id) return { error: "Choose a project." };
  if (!name) return { error: "Enter a plot name." };
  const codeError = validateCode(code);
  if (codeError) return { error: codeError };
  if (!PLOT_STATUSES.includes(status)) return { error: "Choose a status." };

  const supabase = await createClient();
  const { error } = await supabase.from("plots").insert({ project_id, name, code, area, status });
  if (error) {
    if (error.code === "23505")
      return { error: "That code is already used by another plot in this project." };
    console.error("createPlot failed:", error);
    return { error: "Could not create plot. Try again." };
  }

  revalidatePath("/masters/plots");
  return undefined;
}

export async function updatePlot(
  id: string,
  _state: PlotFormState,
  formData: FormData,
): Promise<PlotFormState> {
  await requireTool("/masters");

  const { project_id, name, code, area, status } = readPlotForm(formData);
  if (!project_id) return { error: "Choose a project." };
  if (!name) return { error: "Enter a plot name." };
  const codeError = validateCode(code);
  if (codeError) return { error: codeError };
  if (!PLOT_STATUSES.includes(status)) return { error: "Choose a status." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("plots")
    .update({ project_id, name, code, area, status })
    .eq("id", id);
  if (error) {
    if (error.code === "23505")
      return { error: "That code is already used by another plot in this project." };
    console.error("updatePlot failed:", error);
    return { error: "Could not update plot. Try again." };
  }

  revalidatePath("/masters/plots");
  return undefined;
}
