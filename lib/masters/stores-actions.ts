"use server";

import { requireApp } from "@/lib/auth/access";
import { requireUser } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export type StoreFormState = { error?: string } | undefined;

function readStoreForm(formData: FormData) {
  return {
    name: String(formData.get("name") ?? "").trim(),
    project_id: String(formData.get("project_id") ?? "") || null,
    location: String(formData.get("location") ?? "").trim() || null,
    is_active: formData.get("is_active") === "1",
  };
}

export async function createStore(_state: StoreFormState, formData: FormData): Promise<StoreFormState> {
  const user = await requireUser();
  await requireApp(user, "/masters");

  const { name, project_id, location, is_active } = readStoreForm(formData);
  if (!name) return { error: "Enter the store's name." };

  const supabase = await createClient();
  const { error } = await supabase.from("stores").insert({ name, project_id, location, is_active });
  if (error) {
    console.error("createStore failed:", error);
    return { error: "Could not create store. Try again." };
  }

  revalidatePath("/masters/stores");
  return undefined;
}

export async function updateStore(id: string, _state: StoreFormState, formData: FormData): Promise<StoreFormState> {
  const user = await requireUser();
  await requireApp(user, "/masters");

  const { name, project_id, location, is_active } = readStoreForm(formData);
  if (!name) return { error: "Enter the store's name." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("stores")
    .update({ name, project_id, location, is_active })
    .eq("id", id);
  if (error) {
    console.error("updateStore failed:", error);
    return { error: "Could not update store. Try again." };
  }

  revalidatePath("/masters/stores");
  return undefined;
}
