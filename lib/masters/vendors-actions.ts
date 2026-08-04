"use server";

import type { ActionState } from "@/lib/action-state";
import { requireTool } from "@/lib/auth/access";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export type VendorFormState = ActionState;

function readVendorForm(formData: FormData) {
  return {
    name: String(formData.get("name") ?? "").trim(),
    contact_name: String(formData.get("contact_name") ?? "").trim() || null,
    mobile: String(formData.get("mobile") ?? "").trim() || null,
    gst_no: String(formData.get("gst_no") ?? "").trim() || null,
    address: String(formData.get("address") ?? "").trim() || null,
    is_active: formData.get("is_active") === "1",
  };
}

export async function createVendor(
  _state: VendorFormState,
  formData: FormData,
): Promise<VendorFormState> {
  await requireTool("/masters");

  const { name, contact_name, mobile, gst_no, address, is_active } = readVendorForm(formData);
  if (!name) return { error: "Enter the vendor's name." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("vendors")
    .insert({ name, contact_name, mobile, gst_no, address, is_active });
  if (error) {
    console.error("createVendor failed:", error);
    return { error: "Could not create vendor. Try again." };
  }

  revalidatePath("/masters/vendors");
  return undefined;
}

export async function updateVendor(
  id: string,
  _state: VendorFormState,
  formData: FormData,
): Promise<VendorFormState> {
  const user = await requireTool("/masters");

  const { name, contact_name, mobile, gst_no, address, is_active } = readVendorForm(formData);
  if (!name) return { error: "Enter the vendor's name." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("vendors")
    .update({ name, contact_name, mobile, gst_no, address, is_active, updated_by: user.id })
    .eq("id", id);
  if (error) {
    console.error("updateVendor failed:", error);
    return { error: "Could not update vendor. Try again." };
  }

  revalidatePath("/masters/vendors");
  return undefined;
}
