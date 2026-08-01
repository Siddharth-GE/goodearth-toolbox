"use server";

import type { ActionState } from "@/lib/action-state";
import { requireTool } from "@/lib/auth/access";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export type ClientFormState = ActionState;

function readClientForm(formData: FormData) {
  return {
    name: String(formData.get("name") ?? "").trim(),
    mobile: String(formData.get("mobile") ?? "").trim() || null,
    email: String(formData.get("email") ?? "").trim() || null,
    notes: String(formData.get("notes") ?? "").trim() || null,
  };
}

export async function createClientRecord(
  _state: ClientFormState,
  formData: FormData,
): Promise<ClientFormState> {
  await requireTool("/masters");

  const { name, mobile, email, notes } = readClientForm(formData);
  if (!name) return { error: "Enter the client's name." };

  const supabase = await createClient();
  const { error } = await supabase.from("clients").insert({ name, mobile, email, notes });
  if (error) {
    console.error("createClientRecord failed:", error);
    return { error: "Could not create client. Try again." };
  }

  revalidatePath("/masters/clients");
  return undefined;
}

export async function updateClientRecord(
  id: string,
  _state: ClientFormState,
  formData: FormData,
): Promise<ClientFormState> {
  await requireTool("/masters");

  const { name, mobile, email, notes } = readClientForm(formData);
  if (!name) return { error: "Enter the client's name." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("clients")
    .update({ name, mobile, email, notes })
    .eq("id", id);
  if (error) {
    console.error("updateClientRecord failed:", error);
    return { error: "Could not update client. Try again." };
  }

  revalidatePath("/masters/clients");
  return undefined;
}
