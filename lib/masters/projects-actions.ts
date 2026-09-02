"use server";

import type { ActionState } from "@/lib/action-state";
import { requireTool } from "@/lib/auth/access";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import type { ProjectStatus, ProjectType } from "./projects";

const PROJECT_TYPES = ["apartment_villa_community", "eco_village", "mixed_residential_commercial"];
const PROJECT_STATUSES = ["planning", "active", "completed"];

function readProjectForm(formData: FormData) {
  return {
    name: String(formData.get("name") ?? "").trim(),
    // Normalised the way indentReference() expects: uppercase, no spaces.
    // The DB CHECK (^[A-Z0-9-]{2,10}$, migration 0019) is the backstop.
    code:
      String(formData.get("code") ?? "")
        .trim()
        .toUpperCase()
        .replace(/\s+/g, "") || null,
    location: String(formData.get("location") ?? "").trim() || null,
    project_type: String(formData.get("project_type") ?? "") as ProjectType,
    status: String(formData.get("status") ?? "planning") as ProjectStatus,
  };
}

const CODE_SHAPE = /^[A-Z0-9-]{2,10}$/;

function validateCode(code: string | null): string | undefined {
  if (code !== null && !CODE_SHAPE.test(code)) {
    return "Codes are 2–10 letters, digits or dashes, e.g. ASHRAM.";
  }
  return undefined;
}

export async function createProject(_state: ActionState, formData: FormData): Promise<ActionState> {
  await requireTool("/masters");

  const { name, code, location, project_type, status } = readProjectForm(formData);
  if (!name) return { error: "Enter a project name." };
  const codeError = validateCode(code);
  if (codeError) return { error: codeError };
  if (!PROJECT_TYPES.includes(project_type)) return { error: "Choose a project type." };
  if (!PROJECT_STATUSES.includes(status)) return { error: "Choose a status." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("projects")
    .insert({ name, code, location, project_type, status });
  if (error) {
    if (error.code === "23505") return { error: "That code is already used by another project." };
    console.error("createProject failed:", error);
    return { error: "Could not create project. Try again." };
  }

  revalidatePath("/masters/projects");
  return undefined;
}

export async function updateProject(
  id: string,
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireTool("/masters");

  const { name, code, location, project_type, status } = readProjectForm(formData);
  if (!name) return { error: "Enter a project name." };
  const codeError = validateCode(code);
  if (codeError) return { error: codeError };
  if (!PROJECT_TYPES.includes(project_type)) return { error: "Choose a project type." };
  if (!PROJECT_STATUSES.includes(status)) return { error: "Choose a status." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("projects")
    .update({ name, code, location, project_type, status, updated_by: user.id })
    .eq("id", id);
  if (error) {
    if (error.code === "23505") return { error: "That code is already used by another project." };
    console.error("updateProject failed:", error);
    return { error: "Could not update project. Try again." };
  }

  revalidatePath("/masters/projects");
  return undefined;
}
