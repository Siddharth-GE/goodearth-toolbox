"use server";

import type { ActionState } from "@/lib/action-state";
import { requireTool } from "@/lib/auth/access";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { isTermsKind } from "./constants";

function readTermsForm(formData: FormData) {
  return {
    kind: String(formData.get("kind") ?? ""),
    name: String(formData.get("name") ?? "").trim(),
    body: String(formData.get("body") ?? "").trim(),
    is_active: formData.get("is_active") === "1",
    is_default: formData.get("is_default") === "1",
  };
}

function validate(form: ReturnType<typeof readTermsForm>): string | undefined {
  if (!isTermsKind(form.kind)) return "Choose which documents these terms are for.";
  if (!form.name) return "Give the terms a name, e.g. Standard supply terms.";
  if (!form.body) return "Write the terms themselves.";
  if (form.is_default && !form.is_active) return "Switched-off terms can't be the default.";
  return undefined;
}

/**
 * At most one default per kind — a partial unique index (0101). The row is
 * saved first with the flag down, so a name clash fails before the old
 * default is touched; only then is the old default lowered and this one
 * raised.
 */
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
