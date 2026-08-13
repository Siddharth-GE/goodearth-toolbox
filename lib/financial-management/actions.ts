"use server";

// Type-only import, and deliberately NOT re-exported: a bare
// `export type { ActionState }` in a "use server" file survives into the
// compiled module's runtime export list, where the type doesn't exist —
// every action in the chunk then dies at module load (the 2026-08-03
// production outage). Import it from "@/lib/action-state" instead.
import type { ActionState } from "@/lib/action-state";
import { requireTool } from "@/lib/auth/access";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { FACILITY_KINDS, MOVEMENT_KINDS, type FacilityKind, type MovementKind } from "./kinds";

const PARTY_LIMIT = 120;
const TEXT_LIMIT = 2000;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * "1,50,000" → 150000. Null for blank, NaN for nonsense — the caller
 * decides which of those is an error. People paste amounts with the
 * commas their bank statement prints.
 */
function parseAmount(raw: FormDataEntryValue | null): number | null {
  const cleaned = String(raw ?? "").replace(/[,\s₹]/g, "");
  if (!cleaned) return null;
  return Number(cleaned);
}

type FacilityFields = {
  party: string;
  kind: FacilityKind;
  interest_rate_pct: number | null;
  start_date: string | null;
  sanctioned_amount: number | null;
  terms: string | null;
};

/** Shared by create and update — the same form posts both. */
function readFacilityFields(formData: FormData): FacilityFields | { error: string } {
  const party = String(formData.get("party") ?? "").trim();
  if (!party) return { error: "Name the bank or investor." };
  if (party.length > PARTY_LIMIT)
    return { error: `Keep the name under ${PARTY_LIMIT} characters.` };

  const kind = String(formData.get("kind") ?? "");
  if (!(FACILITY_KINDS as readonly string[]).includes(kind)) {
    return { error: "Pick what kind of money this is." };
  }

  const rate = parseAmount(formData.get("interest_rate_pct"));
  if (rate !== null && (!Number.isFinite(rate) || rate < 0)) {
    return { error: "The interest rate must be a number, 0 or more. Leave it blank for equity." };
  }
  if (rate !== null && rate > 100) {
    return { error: "That rate reads as more than 100% a year — check it." };
  }

  const sanctioned = parseAmount(formData.get("sanctioned_amount"));
  if (sanctioned !== null && (!Number.isFinite(sanctioned) || sanctioned <= 0)) {
    return { error: "The sanctioned amount must be a number above zero, or blank for no cap." };
  }

  const startDate = String(formData.get("start_date") ?? "").trim();
  if (startDate && !ISO_DATE.test(startDate))
    return { error: "Pick the start date from the calendar." };

  const terms = String(formData.get("terms") ?? "").trim();
  if (terms.length > TEXT_LIMIT) return { error: `Keep the terms under ${TEXT_LIMIT} characters.` };

  return {
    party,
    kind: kind as FacilityKind,
    interest_rate_pct: rate,
    start_date: startDate || null,
    sanctioned_amount: sanctioned,
    terms: terms || null,
  };
}

/** Set up a funding source, then open it. */
export async function createFacility(
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireTool("/financial-management");

  const fields = readFacilityFields(formData);
  if ("error" in fields) return fields;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("funding_facilities")
    .insert({ ...fields, created_by: user.id, updated_by: user.id })
    .select("id")
    .single();

  if (error || !data) {
    console.error("createFacility failed:", error);
    return { error: "Could not save the facility. Try again." };
  }

  revalidatePath("/financial-management", "layout");
  // redirect() throws its own control-flow signal, so it must be outside
  // any try/catch and after every write has been checked.
  redirect(`/financial-management/funding/${data.id}`);
}

/** Edit a facility's terms. Recomputes the whole accrual history if the rate changed — PLAN.md's stated limit. */
export async function updateFacility(
  facilityId: string,
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireTool("/financial-management");

  const fields = readFacilityFields(formData);
  if ("error" in fields) return fields;

  const supabase = await createClient();
  const { error } = await supabase
    .from("funding_facilities")
    .update({ ...fields, updated_by: user.id })
    .eq("id", facilityId);

  if (error) {
    console.error("updateFacility failed:", error);
    return { error: "Could not save the changes. Try again." };
  }

  revalidateFunding(facilityId);
  return undefined;
}

/** Close (or reopen) a facility. A closed loan keeps its history. */
export async function setFacilityActive(
  facilityId: string,
  isActive: boolean,
): Promise<ActionState> {
  const user = await requireTool("/financial-management");
  const supabase = await createClient();

  const { error } = await supabase
    .from("funding_facilities")
    .update({ is_active: isActive, updated_by: user.id })
    .eq("id", facilityId);

  if (error) {
    console.error("setFacilityActive failed:", error);
    return { error: "Could not update the facility. Try again." };
  }

  revalidateFunding(facilityId);
  return undefined;
}

/**
 * Delete a facility — refused in plain English once it has history. The
 * RESTRICT FK enforces the same rule at the database, so the pre-check
 * here is for the message, not the safety.
 */
export async function deleteFacility(facilityId: string): Promise<ActionState> {
  await requireTool("/financial-management");
  const supabase = await createClient();

  const { count, error: countError } = await supabase
    .from("funding_movements")
    .select("id", { count: "exact", head: true })
    .eq("facility_id", facilityId);

  if (countError) {
    console.error("deleteFacility count failed:", countError);
    return { error: "Could not check the facility's history. Try again." };
  }
  if ((count ?? 0) > 0) {
    return {
      error:
        "This facility has recorded movements, so it can't be deleted — deactivate it instead.",
    };
  }

  const { error } = await supabase.from("funding_facilities").delete().eq("id", facilityId);
  if (error) {
    console.error("deleteFacility failed:", error);
    return { error: "Could not delete the facility. Try again." };
  }

  revalidatePath("/financial-management", "layout");
  redirect("/financial-management/funding");
}

/** Record a drawdown, repayment or interest payment against a facility. */
export async function recordMovement(
  facilityId: string,
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireTool("/financial-management");

  const kind = String(formData.get("kind") ?? "");
  if (!(MOVEMENT_KINDS as readonly string[]).includes(kind)) {
    return { error: "Pick what kind of movement this is." };
  }

  const amount = parseAmount(formData.get("amount"));
  if (amount === null || !Number.isFinite(amount) || amount <= 0) {
    return { error: "Enter the amount as a number above zero." };
  }

  const happenedOn = String(formData.get("happened_on") ?? "").trim();
  if (!ISO_DATE.test(happenedOn)) return { error: "Pick the date from the calendar." };

  const reference = String(formData.get("reference") ?? "").trim();
  const note = String(formData.get("note") ?? "").trim();
  if (reference.length > TEXT_LIMIT || note.length > TEXT_LIMIT) {
    return { error: `Keep the reference and note under ${TEXT_LIMIT} characters.` };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("funding_movements").insert({
    facility_id: facilityId,
    kind: kind as MovementKind,
    amount,
    happened_on: happenedOn,
    reference: reference || null,
    note: note || null,
    created_by: user.id,
    updated_by: user.id,
  });

  if (error) {
    console.error("recordMovement failed:", error);
    return { error: "Could not record the movement. Try again." };
  }

  revalidateFunding(facilityId);
  return undefined;
}

/**
 * Remove a movement. Allowed — a mistyped payment must be correctable —
 * and the audit trigger keeps the before-image.
 */
export async function deleteMovement(movementId: string, facilityId: string): Promise<ActionState> {
  await requireTool("/financial-management");
  const supabase = await createClient();

  const { error } = await supabase.from("funding_movements").delete().eq("id", movementId);
  if (error) {
    console.error("deleteMovement failed:", error);
    return { error: "Could not remove the movement. Try again." };
  }

  revalidateFunding(facilityId);
  return undefined;
}

/** A movement or facility change touches the Cash page's totals too. */
function revalidateFunding(facilityId: string) {
  revalidatePath("/financial-management", "layout");
  revalidatePath(`/financial-management/funding/${facilityId}`);
}
