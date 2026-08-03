"use server";

import type { ActionState } from "@/lib/action-state";
import { requireTool } from "@/lib/auth/access";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export type GstRateFormState = ActionState;

export async function addGstRate(
  _state: GstRateFormState,
  formData: FormData,
): Promise<GstRateFormState> {
  await requireTool("/masters");

  const raw = String(formData.get("rate") ?? "").trim();
  const rate = Number(raw);
  if (raw === "" || !Number.isFinite(rate)) return { error: "Enter a GST percentage." };
  if (rate < 0 || rate > 100) return { error: "GST is a percentage between 0 and 100." };

  const supabase = await createClient();
  const { error } = await supabase.from("gst_rates").insert({ rate });
  if (error) {
    if (error.code === "23505") return { error: "That rate is already in the list." };
    console.error("addGstRate failed:", error);
    return { error: "Could not add the rate. Try again." };
  }

  revalidatePath("/masters/gst-rates");
  return undefined;
}

export async function setGstRateActive(rate: number, isActive: boolean): Promise<GstRateFormState> {
  await requireTool("/masters");

  const supabase = await createClient();
  const { error } = await supabase
    .from("gst_rates")
    .update({ is_active: isActive })
    .eq("rate", rate);
  if (error) {
    console.error("setGstRateActive failed:", error);
    return { error: "Could not update the rate. Try again." };
  }

  revalidatePath("/masters/gst-rates");
  return undefined;
}
