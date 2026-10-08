"use server";

import type { ActionState } from "@/lib/action-state";
import { requireTool } from "@/lib/auth/access";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

// Two state digits, then thirteen letters and digits: 32ABCDE1234F1Z5.
// Loose on purpose — the shape catches a pasted PAN or a missing
// character; the checksum is the tax portal's job, not ours.
const GSTIN_SHAPE = /^[0-9]{2}[A-Z0-9]{13}$/;

function readCompanyForm(formData: FormData) {
  const text = (key: string) => String(formData.get(key) ?? "").trim() || null;
  return {
    name: String(formData.get("name") ?? "").trim(),
    legal_name: text("legal_name"),
    address: text("address"),
    gstin:
      String(formData.get("gstin") ?? "")
        .toUpperCase()
        .replace(/\s+/g, "") || null,
    state: String(formData.get("state") ?? "").trim(),
    phone: text("phone"),
    email: text("email"),
    is_active: formData.get("is_active") === "1",
  };
}

function validate(form: ReturnType<typeof readCompanyForm>): string | undefined {
  if (!form.name) return "Enter the company's name.";
  if (!form.state)
    return "Enter the company's state — POs compare it with each vendor's GST state.";
  if (form.gstin && !GSTIN_SHAPE.test(form.gstin)) {
    return "A GSTIN is 15 letters and digits, starting with the state's two digits, e.g. 32ABCDE1234F1Z5.";
  }
  if (form.email && !form.email.includes("@")) return "That email address looks incomplete.";
  return undefined;
}

function refresh() {
  revalidatePath("/masters/companies");
  // The projects list and each project's page show the company's name.
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
