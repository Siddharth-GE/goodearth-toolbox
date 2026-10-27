"use server";

import { checked, optionalText, parseNumber, rawText, text } from "@/lib/form-data";
import type { ActionState } from "@/lib/action-state";
import { requireTool } from "@/lib/auth/access";
import { guardError } from "@/lib/db-error";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { cleanContractorCode, isContractorCode } from "./contractor-bill-number";
import { deleteMaster } from "./delete-master";

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
    bill_code: cleanContractorCode(rawText(formData, "bill_code")),
  };
}

function badTerms(days: number | null): boolean {
  return days !== null && (!Number.isInteger(days) || days < 0);
}

function formProblem(input: ReturnType<typeof readVendorForm>): string | undefined {
  if (!input.name) return "Enter the vendor's name.";
  if (badTerms(input.payment_term_days)) return "Payment terms must be a whole number of days.";
  if (input.bill_code && !isContractorCode(input.bill_code))
    return "A bill code is four letters or digits, e.g. RAJU.";
  return undefined;
}

const DUPLICATE_CODE = "Another vendor already has that bill code.";

export async function createVendor(_state: ActionState, formData: FormData): Promise<ActionState> {
  await requireTool("/masters");

  const input = readVendorForm(formData);
  const problem = formProblem(input);
  if (problem) return { error: problem };

  const supabase = await createClient();
  const { error } = await supabase.from("vendors").insert(input);
  if (error) {
    if (error.code === "23505") return { error: DUPLICATE_CODE };
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
  const problem = formProblem(input);
  if (problem) return { error: problem };

  const supabase = await createClient();
  const { error } = await supabase
    .from("vendors")
    .update({ ...input, updated_by: user.id })
    .eq("id", id);
  if (error) {
    if (error.code === "23505") return { error: DUPLICATE_CODE };
    console.error("updateVendor failed:", error);
    return guardError(error, "Could not update vendor. Try again.", ["can no longer change"]);
  }

  revalidatePath("/masters/vendors");
  return undefined;
}

/** The last paper bill number in one company; once the toolbox has billed that contractor there, only raised (0164). */
export async function saveContractorBillNumber(
  vendorId: string,
  companyId: string,
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireTool("/masters");

  const lastNo = parseNumber(formData.get("last_no")) ?? 0;
  if (!Number.isInteger(lastNo) || lastNo < 0)
    return { error: "The last bill number is a whole number, 0 if there was none." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("contractor_bill_numbers")
    .upsert(
      { vendor_id: vendorId, company_id: companyId, last_no: lastNo, updated_by: user.id },
      { onConflict: "vendor_id,company_id" },
    );
  if (error) {
    console.error("saveContractorBillNumber failed:", error);
    return guardError(error, "Could not save the bill number. Try again.", [
      "already numbering",
      "for good",
    ]);
  }

  revalidatePath("/masters/vendors", "layout");
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

/** Only while nothing uses it, and only by an admin (0150); anything in use is retired with Active instead. */
export async function deleteVendor(id: string): Promise<ActionState> {
  const user = await requireTool("/masters");
  return deleteMaster(user, "vendors", id, {
    noun: "vendor",
    retire: true,
    paths: ["/masters/vendors"],
  });
}
