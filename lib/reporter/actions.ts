"use server";

// Type-only import; never re-export it from a "use server" file (BUGCATCHER #5).
import { rawText, text } from "@/lib/form-data";
import type { ActionState } from "@/lib/action-state";
import { requireTool } from "@/lib/auth/access";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { decodeSpecParam, parseReportSpec, REPORT_SCHEMA_VERSION } from "./spec";

const NAME_LIMIT = 120;
const DESCRIPTION_LIMIT = 300;

// A saved report is the spec, never the figures: it re-reads live data under the reader's own RLS.
// Every action re-parses the spec; the jsonb column can't check it.

type Named = { name: string; description: string | null };

function readName(formData: FormData): Named | { error: string } {
  const name = text(formData, "name");
  const description = text(formData, "description");
  if (!name) return { error: "Give the report a name." };
  if (name.length > NAME_LIMIT) return { error: `Keep the name under ${NAME_LIMIT} characters.` };
  if (description.length > DESCRIPTION_LIMIT) {
    return { error: `Keep the description under ${DESCRIPTION_LIMIT} characters.` };
  }
  return { name, description: description || null };
}

export async function saveReport(_state: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireTool("/reporter");

  const named = readName(formData);
  if ("error" in named) return { error: named.error };

  const raw = decodeSpecParam(rawText(formData, "spec"));
  if (raw === null) {
    return { error: "That report could not be read. Run it again and save from the report page." };
  }
  const spec = parseReportSpec(raw);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("reports")
    .insert({
      name: named.name,
      description: named.description,
      // Denormalised so the list page needn't parse every document.
      dataset: spec.dataset,
      schema_version: REPORT_SCHEMA_VERSION,
      spec,
      created_by: user.id,
      updated_by: user.id,
    })
    .select("id")
    .single();

  if (error || !data) {
    console.error("saveReport failed:", error);
    return { error: "Could not save the report. Try again." };
  }

  revalidatePath("/reporter", "layout");
  // redirect() throws, so it stays outside any try/catch.
  redirect(`/reporter/${data.id}`);
}

export async function updateReportSpec(reportId: string, specParam: string): Promise<ActionState> {
  const user = await requireTool("/reporter");

  const raw = decodeSpecParam(specParam);
  if (raw === null) return { error: "Those changes could not be read. Run the report and retry." };
  const spec = parseReportSpec(raw);

  const supabase = await createClient();
  const { error } = await supabase
    .from("reports")
    .update({
      dataset: spec.dataset,
      schema_version: REPORT_SCHEMA_VERSION,
      spec,
      updated_by: user.id,
    })
    .eq("id", reportId);

  if (error) {
    console.error("updateReportSpec failed:", error);
    return { error: "Could not save the changes. They are still on screen — try again." };
  }

  revalidatePath("/reporter", "layout");
  revalidatePath(`/reporter/${reportId}`);
  return undefined;
}

export async function renameReport(
  reportId: string,
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireTool("/reporter");

  const named = readName(formData);
  if ("error" in named) return { error: named.error };

  const supabase = await createClient();
  const { error } = await supabase
    .from("reports")
    .update({ name: named.name, description: named.description, updated_by: user.id })
    .eq("id", reportId);

  if (error) {
    console.error("renameReport failed:", error);
    return { error: "Could not rename the report. Try again." };
  }

  revalidatePath("/reporter", "layout");
  revalidatePath(`/reporter/${reportId}`);
  return undefined;
}

// RLS refuses a DELETE silently (zero rows, no error), so the refusal is checked here (0054).
export async function deleteReport(reportId: string): Promise<ActionState> {
  await requireTool("/reporter");
  const supabase = await createClient();

  const { data, error } = await supabase.from("reports").delete().eq("id", reportId).select("id");

  if (error) {
    console.error("deleteReport failed:", error);
    return { error: "Could not delete the report. Try again." };
  }
  if (!data || data.length === 0) {
    return { error: "This report belongs to someone else. Only they or an admin can delete it." };
  }

  revalidatePath("/reporter", "layout");
  return undefined;
}
