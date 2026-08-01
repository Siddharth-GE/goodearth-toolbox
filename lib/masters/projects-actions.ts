"use server";

import type { ActionState } from "@/lib/action-state";
import { requireTool } from "@/lib/auth/access";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import type { ProjectStatus, ProjectType } from "./projects";

const PROJECT_TYPES = ["apartment_villa_community", "eco_village", "mixed_residential_commercial"];
const PROJECT_STATUSES = ["planning", "active", "completed"];

export type ProjectFormState = ActionState;

function readProjectForm(formData: FormData) {
  return {
    name: String(formData.get("name") ?? "").trim(),
    location: String(formData.get("location") ?? "").trim() || null,
    project_type: String(formData.get("project_type") ?? "") as ProjectType,
    status: String(formData.get("status") ?? "planning") as ProjectStatus,
  };
}

export async function createProject(
  _state: ProjectFormState,
  formData: FormData,
): Promise<ProjectFormState> {
  await requireTool("/masters");

  const { name, location, project_type, status } = readProjectForm(formData);
  if (!name) return { error: "Enter a project name." };
  if (!PROJECT_TYPES.includes(project_type)) return { error: "Choose a project type." };
  if (!PROJECT_STATUSES.includes(status)) return { error: "Choose a status." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("projects")
    .insert({ name, location, project_type, status });
  if (error) {
    console.error("createProject failed:", error);
    return { error: "Could not create project. Try again." };
  }

  revalidatePath("/masters/projects");
  return undefined;
}

export async function updateProject(
  id: string,
  _state: ProjectFormState,
  formData: FormData,
): Promise<ProjectFormState> {
  await requireTool("/masters");

  const { name, location, project_type, status } = readProjectForm(formData);
  if (!name) return { error: "Enter a project name." };
  if (!PROJECT_TYPES.includes(project_type)) return { error: "Choose a project type." };
  if (!PROJECT_STATUSES.includes(status)) return { error: "Choose a status." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("projects")
    .update({ name, location, project_type, status })
    .eq("id", id);
  if (error) {
    console.error("updateProject failed:", error);
    return { error: "Could not update project. Try again." };
  }

  revalidatePath("/masters/projects");
  return undefined;
}
