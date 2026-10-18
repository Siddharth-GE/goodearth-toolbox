"use server";

import { checked, optionalText, text } from "@/lib/form-data";
import type { ActionState } from "@/lib/action-state";
import { requireTool } from "@/lib/auth/access";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

function readVendorForm(formData: FormData) {
  const termsRaw = text(formData, "payment_term_days");
  return {
    name: text(formData, "name"),
    contact_name: optionalText(formData, "contact_name"),
    contact_designation: optionalText(formData, "contact_designation"),
    mobile: optionalText(formData, "mobile"),
    email: optionalText(formData, "email"),
    gst_no: optionalText(formData, "gst_no"),
    gst_state: optionalText(formData, "gst_state"),
    address: optionalText(formData, "address"),
    payment_term_days: termsRaw === "" ? null : Number(termsRaw),
    is_active: checked(formData, "is_active", "1"),
    is_contractor: checked(formData, "is_contractor", "1"),
  };
}

function badTerms(days: number | null): boolean {
  return days !== null && (!Number.isInteger(days) || days < 0);
}

export async function createVendor(_state: ActionState, formData: FormData): Promise<ActionState> {
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
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
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
 * Bank details live in the gated vendor_payment_details (0089), never on vendors.
 * One save replaces all four fields; clearing all four removes the row.
 */
export async function saveVendorPaymentDetails(
  vendorId: string,
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireTool("/masters");

  const details = {
    bank_name: optionalText(formData, "bank_name"),
    account_number: optionalText(formData, "account_number"),
    account_holder_name: optionalText(formData, "account_holder_name"),
    ifsc: optionalText(formData, "ifsc"),
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
