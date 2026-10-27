"use server";

import type { ActionState } from "@/lib/action-state";
import { requireTool } from "@/lib/auth/access";
import { checked, optionalText, rawText, text } from "@/lib/form-data";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { deleteMaster } from "./delete-master";

// GSTIN shape, loose on purpose: catches a pasted PAN or a missing character; the checksum is the tax portal's job.
const GSTIN_SHAPE = /^[0-9]{2}[A-Z0-9]{13}$/;
const PAN_SHAPE = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
// Loose: the Udyam number and the older Udyog Aadhaar are both still printed.
const MSME_SHAPE = /^[A-Z0-9-]{6,40}$/;

const code = (formData: FormData, key: string) =>
  rawText(formData, key).toUpperCase().replace(/\s+/g, "") || null;

function readCompanyForm(formData: FormData) {
  return {
    name: text(formData, "name"),
    legal_name: optionalText(formData, "legal_name"),
    address: optionalText(formData, "address"),
    gstin: code(formData, "gstin"),
    pan: code(formData, "pan"),
    msme_number: code(formData, "msme_number"),
    state: text(formData, "state"),
    phone: optionalText(formData, "phone"),
    email: optionalText(formData, "email"),
    is_active: checked(formData, "is_active", "1"),
  };
}

function validate(form: ReturnType<typeof readCompanyForm>): string | undefined {
  if (!form.name) return "Enter the company's name.";
  if (!form.state)
    return "Enter the company's state — POs compare it with each vendor's GST state.";
  if (form.gstin && !GSTIN_SHAPE.test(form.gstin)) {
    return "A GSTIN is 15 letters and digits, starting with the state's two digits, e.g. 32ABCDE1234F1Z5.";
  }
  if (form.pan && !PAN_SHAPE.test(form.pan)) {
    return "A PAN is 10 characters: five letters, four digits, then a letter, e.g. ABCDE1234F.";
  }
  if (form.msme_number && !MSME_SHAPE.test(form.msme_number)) {
    return "An MSME number is letters, digits and dashes, e.g. UDYAM-KR-03-0539542.";
  }
  if (form.email && !form.email.includes("@")) return "That email address looks incomplete.";
  return undefined;
}

function refresh() {
  revalidatePath("/masters/companies");
  revalidatePath("/masters/projects", "layout");
}

export async function createCompany(_state: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireTool("/masters");

  const form = readCompanyForm(formData);
  const invalid = validate(form);
  if (invalid) return { error: invalid };

  const supabase = await createClient();
  const { error } = await supabase.from("companies").insert({ ...form, created_by: user.id });
  if (error) {
    if (error.code === "23505") return { error: "Another company already has that name." };
    console.error("createCompany failed:", error);
    return { error: "Could not add the company. Try again." };
  }

  refresh();
  return undefined;
}

export async function updateCompany(
  id: string,
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireTool("/masters");

  const form = readCompanyForm(formData);
  const invalid = validate(form);
  if (invalid) return { error: invalid };

  const supabase = await createClient();
  const { error } = await supabase
    .from("companies")
    .update({ ...form, updated_by: user.id })
    .eq("id", id);
  if (error) {
    if (error.code === "23505") return { error: "Another company already has that name." };
    console.error("updateCompany failed:", error);
    return { error: "Could not save the company. Try again." };
  }

  refresh();
  return undefined;
}

/** Only while nothing uses it, and only by an admin (0150); anything in use is retired with Active instead. */
export async function deleteCompany(id: string): Promise<ActionState> {
  const user = await requireTool("/masters");
  return deleteMaster(user, "companies", id, {
    noun: "company",
    retire: true,
    paths: ["/masters/companies", "/masters/projects"],
  });
}
