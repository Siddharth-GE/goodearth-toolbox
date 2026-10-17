import "server-only";

import { fetchAll } from "@/lib/supabase/fetch-all";
import { createClient } from "@/lib/supabase/server";

export type ProjectType =
  "apartment_villa_community" | "eco_village" | "mixed_residential_commercial";
export type ProjectStatus = "planning" | "active" | "completed";

export type ProjectRow = {
  id: string;
  name: string;
  // Nullable: a project without a code can't have indents raised.
  code: string | null;
  location: string | null;
  project_type: ProjectType;
  status: ProjectStatus;
  // Null prints the placeholder letterhead (0101).
  company_id: string | null;
  created_at: string;
  updated_at: string | null;
  updated_by: string | null;
};

export async function listProjects(): Promise<ProjectRow[]> {
  const supabase = await createClient();
  const data = await fetchAll((from, to) =>
    supabase.from("projects").select("*").order("name").order("id").range(from, to),
  );
  return data as ProjectRow[];
}
