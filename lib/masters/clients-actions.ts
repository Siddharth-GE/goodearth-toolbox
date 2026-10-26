"use server";

import { checked, optionalText, text } from "@/lib/form-data";
import type { ActionState } from "@/lib/action-state";
import { requireTool } from "@/lib/auth/access";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { deleteMaster } from "./delete-master";

function readClientForm(formData: FormData) {
  return {
    name: text(formData, "name"),
    mobile: optionalText(formData, "mobile"),
    email: optionalText(formData, "email"),
    notes: optionalText(formData, "notes"),
    is_active: checked(formData, "is_active", "1"),
  };
}

export async function createClientRecord(
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireTool("/masters");

  const { name, mobile, email, notes, is_active } = readClientForm(formData);
  if (!name) return { error: "Enter the client's name." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("clients")
    .insert({ name, mobile, email, notes, is_active });
  if (error) {
    console.error("createClientRecord failed:", error);
    return { error: "Could not create client. Try again." };
  }

  revalidatePath("/masters/clients");
  return undefined;
}

export async function updateClientRecord(
  id: string,
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireTool("/masters");

  const { name, mobile, email, notes, is_active } = readClientForm(formData);
  if (!name) return { error: "Enter the client's name." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("clients")
    .update({ name, mobile, email, notes, is_active, updated_by: user.id })
    .eq("id", id);
  if (error) {
    console.error("updateClientRecord failed:", error);
    return { error: "Could not update client. Try again." };
  }

  revalidatePath("/masters/clients");
  return undefined;
}

/** Only while nothing uses it, and only by an admin (0150); anything in use is retired with Active instead. */
export async function deleteClient(id: string): Promise<ActionState> {
  const user = await requireTool("/masters");
  return deleteMaster(user, "clients", id, {
    noun: "client",
    retire: true,
    paths: ["/masters/clients"],
  });
}
