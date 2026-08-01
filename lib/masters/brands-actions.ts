"use server";

import { requireApp } from "@/lib/auth/access";
import { requireUser } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export type BrandFormState = { error?: string } | undefined;

export async function createBrand(
  _state: BrandFormState,
  formData: FormData,
): Promise<BrandFormState> {
  const user = await requireUser();
  await requireApp(user, "/masters");

  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { error: "Enter a brand name." };

  const supabase = await createClient();
  const { error } = await supabase.from("brands").insert({ name });
  if (error) {
    if (error.code === "23505") return { error: "A brand with this name already exists." };
    console.error("createBrand failed:", error);
    return { error: "Could not create brand. Try again." };
  }

  revalidatePath("/masters/categories");
  return undefined;
}
