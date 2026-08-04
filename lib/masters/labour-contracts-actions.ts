"use server";

import type { ActionState } from "@/lib/action-state";
import { requireTool } from "@/lib/auth/access";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export type LabourContractFormState = ActionState;

function readLabourContractForm(formData: FormData) {
  // The dialog offers one "scope" select encoding plot:<id> / unit:<id>
  // / "" (general) — picking both is structurally impossible, mirroring
  // the at-most-one CHECK in migration 0025.
  const scope = String(formData.get("scope") ?? "");
  return {
    vendor_id: String(formData.get("vendor_id") ?? ""),
    project_id: String(formData.get("project_id") ?? ""),
    plot_id: scope.startsWith("plot:") ? scope.slice("plot:".length) : null,
    unit_id: scope.startsWith("unit:") ? scope.slice("unit:".length) : null,
    description: String(formData.get("description") ?? "").trim(),
    contract_value: Number(formData.get("contract_value")),
    is_active: formData.get("is_active") === "1",
  };
}

function validate(form: ReturnType<typeof readLabourContractForm>): string | undefined {
  if (!form.vendor_id) return "Choose the contractor (a vendor in Masters).";
  if (!form.project_id) return "Choose a project.";
  if (!form.description) return "Say what the contract covers.";
  if (!Number.isFinite(form.contract_value) || form.contract_value <= 0)
    return "Enter the contract value — more than zero.";
  return undefined;
}

export async function createLabourContract(
  _state: LabourContractFormState,
  formData: FormData,
): Promise<LabourContractFormState> {
  await requireTool("/masters");

  const form = readLabourContractForm(formData);
  const invalid = validate(form);
  if (invalid) return { error: invalid };

  const supabase = await createClient();
  const { error } = await supabase.from("labour_contracts").insert(form);
  if (error) {
    console.error("createLabourContract failed:", error);
    return { error: "Could not create the labour contract. Try again." };
  }

  revalidatePath("/masters/labour-contracts");
  return undefined;
}

export async function updateLabourContract(
  id: string,
  _state: LabourContractFormState,
  formData: FormData,
): Promise<LabourContractFormState> {
  await requireTool("/masters");

  const form = readLabourContractForm(formData);
  const invalid = validate(form);
  if (invalid) return { error: invalid };

  const supabase = await createClient();
  const { error } = await supabase.from("labour_contracts").update(form).eq("id", id);
  if (error) {
    console.error("updateLabourContract failed:", error);
    return { error: "Could not update the labour contract. Try again." };
  }

  revalidatePath("/masters/labour-contracts");
  return undefined;
}
