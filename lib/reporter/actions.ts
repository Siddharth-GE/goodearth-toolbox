"use server";

// Type-only import, and deliberately NOT re-exported: a bare
// `export type { ActionState }` in a "use server" file survives into the
// compiled module's runtime export list, where the type doesn't exist —
// every action in the chunk then dies at module load (the 2026-08-03
// production outage). Import it from "@/lib/action-state" instead.
import type { ActionState } from "@/lib/action-state";
import { requireTool } from "@/lib/auth/access";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { decodeSpecParam, parseReportSpec, REPORT_SCHEMA_VERSION } from "./spec";

const NAME_LIMIT = 120;
const DESCRIPTION_LIMIT = 300;

/**
 * Saving a report saves a QUESTION, not an answer — the spec, never the
 * figures. Running it later re-reads the live tables through the
 * reader's own RLS, so a report saved by an admin shows a colleague
 * only what that colleague may see.
 *
 * Every action re-parses the spec on the way in. The browser sends it
 * as the same base64url `?spec=` the page uses, and 0054's jsonb column
 * is something the database cannot check — so parseReportSpec is the
 * only place a malformed spec can be stopped, exactly as
 * parsePlanInputs guards business_plans.
 */

type Named = { name: string; description: string | null };

function readName(formData: FormData): Named | { error: string } {
  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  if (!name) return { error: "Give the report a name." };
  if (name.length > NAME_LIMIT) return { error: `Keep the name under ${NAME_LIMIT} characters.` };
  if (description.length > DESCRIPTION_LIMIT) {
    return { error: `Keep the description under ${DESCRIPTION_LIMIT} characters.` };
  }
  return { name, description: description || null };
}

/**
 * Save the spec on screen as a new report, then open it. This is both
 * "Save" on an unsaved report and "Save a copy" of a starter or of
 * someone else's — one insert either way, so there is one code path.
 */
export async function saveReport(_state: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireTool("/reporter");

  const named = readName(formData);
  if ("error" in named) return { error: named.error };

  const raw = decodeSpecParam(String(formData.get("spec") ?? ""));
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
      // Denormalised out of the spec so the list page can say what each
      // report is over without parsing every document.
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
  // redirect() throws its own control-flow signal, so it must be outside
  // any try/catch and after every write has been checked.
  redirect(`/reporter/${data.id}`);
}

/**
 * Write a changed spec back to a saved report. Separate from renaming,
 * because reshaping a report and retitling it are different decisions
 * and a person should be able to do either without the other.
 */
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

/** Rename a report, or reword what it says it answers. */
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

/**
 * Throw a report away. 0054 narrows DELETE to the person who created it
 * or an admin — editing someone's report is a change they can see and
 * undo, deleting it is not. RLS refuses silently (zero rows affected
 * rather than an error), so the refusal is checked here and said in
 * plain English.
 */
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
