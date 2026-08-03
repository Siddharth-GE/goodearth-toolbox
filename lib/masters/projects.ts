import "server-only";

import { createClient } from "@/lib/supabase/server";

export type ProjectType =
  "apartment_villa_community" | "eco_village" | "mixed_residential_commercial";
export type ProjectStatus = "planning" | "active" | "completed";

export type ProjectRow = {
  id: string;
  name: string;
  // Short code indent numbers are built from (ASHRAM → IND/ASHRAM/001).
  // Nullable: a project without one can't have indents raised against it.
  code: string | null;
  location: string | null;
  project_type: ProjectType;
  status: ProjectStatus;
  created_at: string;
};

export async function listProjects(): Promise<ProjectRow[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("projects").select("*").order("name");
  return (data ?? []) as ProjectRow[];
}
