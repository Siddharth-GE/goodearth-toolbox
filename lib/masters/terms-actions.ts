"use server";

import { checked, rawText, text } from "@/lib/form-data";
import type { ActionState } from "@/lib/action-state";
import { requireTool } from "@/lib/auth/access";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { isTermsKind } from "./constants";
import { deleteMaster } from "./delete-master";

function readTermsForm(formData: FormData) {
  return {
    kind: rawText(formData, "kind"),
    name: text(formData, "name"),
    body: text(formData, "body"),
    is_active: checked(formData, "is_active", "1"),
    is_default: checked(formData, "is_default", "1"),
  };
}

function validate(form: ReturnType<typeof readTermsForm>): string | undefined {
  if (!isTermsKind(form.kind)) return "Choose which documents these terms are for.";
  if (!form.name) return "Give the terms a name, e.g. Standard supply terms.";
  if (!form.body) return "Write the terms themselves.";
  if (form.is_default && !form.is_active) return "Switched-off terms can't be the default.";
  return undefined;
}

/** One default per kind (partial unique index, 0101): save with the flag down first so a name clash fails before the old default is touched. */
async function makeDefault(id: string, kind: string, userId: string): Promise<ActionState> {
  const supabase = await createClient();
  const { error: lowerError } = await supabase
    .from("document_terms")
    .update({ is_default: false, updated_by: userId })
    .eq("kind", kind)
    .eq("is_default", true)
    .neq("id", id);
  if (lowerError) {
    console.error("makeDefault (lower) failed:", lowerError);
    return { error: "Saved, but could not make these the default. Try again." };
  }
  const { error: raiseError } = await supabase
    .from("document_terms")
    .update({ is_default: true, updated_by: userId })
    .eq("id", id);
  if (raiseError) {
    console.error("makeDefault (raise) failed:", raiseError);
    return {
      error: "Saved, but could not make these the default — no default is set now. Try again.",
    };
  }
  return undefined;
}

function nameClash(code: string | undefined): boolean {
  return code === "23505";
}

export async function createTerms(_state: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireTool("/masters");

  const form = readTermsForm(formData);
  const invalid = validate(form);
  if (invalid) return { error: invalid };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("document_terms")
    .insert({
      kind: form.kind,
      name: form.name,
      body: form.body,
      is_active: form.is_active,
      is_default: false,
      created_by: user.id,
    })
    .select("id")
    .single();
  if (error || !data) {
    if (nameClash(error?.code)) return { error: "Terms with that name already exist." };
    console.error("createTerms failed:", error);
    return { error: "Could not add the terms. Try again." };
  }

  const result = form.is_default ? await makeDefault(data.id, form.kind, user.id) : undefined;
  revalidatePath("/masters/terms");
  return result;
}

export async function updateTerms(
  id: string,
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireTool("/masters");

  const form = readTermsForm(formData);
  const invalid = validate(form);
  if (invalid) return { error: invalid };

  const supabase = await createClient();
  const { error } = await supabase
    .from("document_terms")
    .update({
      kind: form.kind,
      name: form.name,
      body: form.body,
      is_active: form.is_active,
      is_default: false,
      updated_by: user.id,
    })
    .eq("id", id);
  if (error) {
    if (nameClash(error.code)) return { error: "Terms with that name already exist." };
    console.error("updateTerms failed:", error);
    return { error: "Could not save the terms. Try again." };
  }

  const result = form.is_default ? await makeDefault(id, form.kind, user.id) : undefined;
  revalidatePath("/masters/terms");
  return result;
}

/** Only while nothing uses it, and only by an admin (0150); anything in use is retired with Active instead. */
export async function deleteTerms(id: string): Promise<ActionState> {
  const user = await requireTool("/masters");
  return deleteMaster(user, "document_terms", id, {
    noun: "terms template",
    retire: true,
    paths: ["/masters/terms"],
  });
}
