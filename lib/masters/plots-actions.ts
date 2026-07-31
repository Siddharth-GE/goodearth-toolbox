"use server";

import { requireApp } from "@/lib/auth/access";
import { requireUser } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import type { PlotStatus } from "./plots";

const PLOT_STATUSES = ["available", "reserved", "sold"];

export type PlotFormState = { error?: string } | undefined;

function readPlotForm(formData: FormData) {
  return {
    project_id: String(formData.get("project_id") ?? ""),
    name: String(formData.get("name") ?? "").trim(),
    area: formData.get("area") ? Number(formData.get("area")) : null,
    status: String(formData.get("status") ?? "available") as PlotStatus,
  };
}

export async function createPlot(_state: PlotFormState, formData: FormData): Promise<PlotFormState> {
  const user = await requireUser();
  await requireApp(user, "/masters");

  const { project_id, name, area, status } = readPlotForm(formData);
  if (!project_id) return { error: "Choose a project." };
  if (!name) return { error: "Enter a plot name." };
  if (!PLOT_STATUSES.includes(status)) return { error: "Choose a status." };

  const supabase = await createClient();
  const { error } = await supabase.from("plots").insert({ project_id, name, area, status });
  if (error) {
    console.error("createPlot failed:", error);
    return { error: "Could not create plot. Try again." };
  }

  revalidatePath("/masters/plots");
  return undefined;
}

export async function updatePlot(id: string, _state: PlotFormState, formData: FormData): Promise<PlotFormState> {
  const user = await requireUser();
  await requireApp(user, "/masters");

  const { project_id, name, area, status } = readPlotForm(formData);
  if (!project_id) return { error: "Choose a project." };
  if (!name) return { error: "Enter a plot name." };
  if (!PLOT_STATUSES.includes(status)) return { error: "Choose a status." };

  const supabase = await createClient();
  const { error } = await supabase.from("plots").update({ project_id, name, area, status }).eq("id", id);
  if (error) {
    console.error("updatePlot failed:", error);
    return { error: "Could not update plot. Try again." };
  }

  revalidatePath("/masters/plots");
  return undefined;
}
