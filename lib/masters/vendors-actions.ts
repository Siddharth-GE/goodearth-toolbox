"use server";

import type { ActionState } from "@/lib/action-state";
import { requireTool } from "@/lib/auth/access";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export type VendorFormState = ActionState;

function readVendorForm(formData: FormData) {
  const termsRaw = String(formData.get("payment_term_days") ?? "").trim();
  return {
    name: String(formData.get("name") ?? "").trim(),
    contact_name: String(formData.get("contact_name") ?? "").trim() || null,
    contact_designation: String(formData.get("contact_designation") ?? "").trim() || null,
    mobile: String(formData.get("mobile") ?? "").trim() || null,
    email: String(formData.get("email") ?? "").trim() || null,
    gst_no: String(formData.get("gst_no") ?? "").trim() || null,
    gst_state: String(formData.get("gst_state") ?? "").trim() || null,
    address: String(formData.get("address") ?? "").trim() || null,
    payment_term_days: termsRaw === "" ? null : Number(termsRaw),
    is_active: formData.get("is_active") === "1",
    is_contractor: formData.get("is_contractor") === "1",
  };
}

function badTerms(days: number | null): boolean {
  return days !== null && (!Number.isInteger(days) || days < 0);
}

export async function createVendor(
  _state: VendorFormState,
  formData: FormData,
): Promise<VendorFormState> {
  await requireTool("/masters");

  const input = readVendorForm(formData);
  if (!input.name) return { error: "Enter the vendor's name." };
  if (badTerms(input.payment_term_days))
    return { error: "Payment terms must be a whole number of days." };

  const supabase = await createClient();
  const { error } = await supabase.from("vendors").insert(input);
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

  const input = readVendorForm(formData);
  if (!input.name) return { error: "Enter the vendor's name." };
  if (badTerms(input.payment_term_days))
    return { error: "Payment terms must be a whole number of days." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("vendors")
    .update({ ...input, updated_by: user.id })
    .eq("id", id);
  if (error) {
    console.error("updateVendor failed:", error);
    return { error: "Could not update vendor. Try again." };
  }

  revalidatePath("/masters/vendors");
  return undefined;
}

/**
 * Bank details live in vendor_payment_details (0089), the gated 1:1
 * table — never on the open vendors row. One save replaces the whole
 * set of four fields; clearing all four removes the row.
 */
export async function saveVendorPaymentDetails(
  vendorId: string,
  _state: VendorFormState,
  formData: FormData,
): Promise<VendorFormState> {
  const user = await requireTool("/masters");

  const details = {
    bank_name: String(formData.get("bank_name") ?? "").trim() || null,
    account_number: String(formData.get("account_number") ?? "").trim() || null,
    account_holder_name: String(formData.get("account_holder_name") ?? "").trim() || null,
    ifsc: String(formData.get("ifsc") ?? "").trim() || null,
  };
  const empty = Object.values(details).every((value) => value === null);

  const supabase = await createClient();
  const { error } = empty
    ? await supabase.from("vendor_payment_details").delete().eq("vendor_id", vendorId)
    : await supabase
        .from("vendor_payment_details")
        .upsert({ vendor_id: vendorId, ...details, updated_by: user.id });
  if (error) {
    console.error("saveVendorPaymentDetails failed:", error);
    return { error: "Could not save bank details. Try again." };
  }

  revalidatePath("/masters/vendors");
  return undefined;
}
