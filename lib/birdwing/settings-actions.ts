"use server";

// Type-only import, not re-exported from a "use server" file (npm run check:actions).
import type { ActionState } from "@/lib/action-state";
import { requireAdmin } from "@/lib/auth/access";
import { requireUser } from "@/lib/auth/dal";
import { dbErrorMessage } from "@/lib/db-error";
import { optionalText, text } from "@/lib/form-data";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { parseCount, parseGstPct, parseRupees } from "./forms";
import { CHARGE_KINDS, oneOf } from "./shared";

/** ADMIN ONLY: the 0115 policies check is_admin() on every write and each action checks first, so a /birdwing holder can read but never change.
 * Nothing is deleted: stays already name a room, head or cost centre, so it is switched off. */

const refresh = () => revalidatePath("/birdwing", "layout");

async function admin() {
  const user = await requireUser();
  await requireAdmin(user);
  return user;
}

function failed(error: { message: string; code?: string }, fallback: string): ActionState {
  if (error.code === "23505") return { error: "That name is already in use." };
  console.error(`birdwing settings: ${fallback}`, error);
  return { error: dbErrorMessage(error, fallback) };
}

export async function saveRoom(
  roomId: string | null,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await admin();
  const code = text(formData, "code").toUpperCase();
  const name = text(formData, "name");
  if (!code || code.length > 12) return { error: "Give the room a short code, like R1." };
  if (!name) return { error: "Give the room a name." };
  const capacity = parseCount(text(formData, "max_guests"), "Most guests", 30);
  if (!capacity.ok) return { error: capacity.error };
  const sort = parseCount(text(formData, "sort_order"), "Order", 10_000);
  if (!sort.ok) return { error: sort.error };

  const row = {
    code,
    name,
    max_guests: capacity.value || null,
    sort_order: sort.value,
    is_active: formData.get("is_active") === "on",
    updated_by: user.id,
  };
  const supabase = await createClient();
  const { error } = roomId
    ? await supabase.from("birdwing_rooms").update(row).eq("id", roomId)
    : await supabase.from("birdwing_rooms").insert({ ...row, created_by: user.id });
  if (error) return failed(error, "Could not save the room. Try again.");
  refresh();
  return undefined;
}

export async function saveRateCardItem(
  itemId: string | null,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await admin();
  const head = text(formData, "head");
  if (!head) return { error: "Name the charge, e.g. Dinner." };
  const kind = oneOf(CHARGE_KINDS, text(formData, "kind"));
  if (!kind) return { error: "Pick what kind of charge it is." };
  const rate = parseRupees(text(formData, "default_rate"), "Rate", { blank: 0 });
  if (!rate.ok) return { error: rate.error };
  const gst = parseGstPct(text(formData, "gst_pct"));
  if (!gst.ok) return { error: gst.error };
  const sort = parseCount(text(formData, "sort_order"), "Order", 10_000);
  if (!sort.ok) return { error: sort.error };

  const row = {
    head,
    kind,
    default_rate: rate.value,
    gst_pct: gst.value,
    sac: optionalText(formData, "sac"),
    sort_order: sort.value,
    is_active: formData.get("is_active") === "on",
    updated_by: user.id,
  };
  const supabase = await createClient();
  const { error } = itemId
    ? await supabase.from("birdwing_rate_card").update(row).eq("id", itemId)
    : await supabase.from("birdwing_rate_card").insert({ ...row, created_by: user.id });
  if (error) return failed(error, "Could not save the charge. Try again.");
  refresh();
  return undefined;
}

export async function saveCostCentre(
  centreId: string | null,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await admin();
  const name = text(formData, "name");
  if (!name) return { error: "Name the cost centre, e.g. Marketing." };
  const sort = parseCount(text(formData, "sort_order"), "Order", 10_000);
  if (!sort.ok) return { error: sort.error };

  const row = {
    name,
    sort_order: sort.value,
    is_active: formData.get("is_active") === "on",
    updated_by: user.id,
  };
  const supabase = await createClient();
  const { error } = centreId
    ? await supabase.from("birdwing_cost_centres").update(row).eq("id", centreId)
    : await supabase.from("birdwing_cost_centres").insert({ ...row, created_by: user.id });
  if (error) return failed(error, "Could not save the cost centre. Try again.");
  refresh();
  return undefined;
}

export async function saveInvoiceSettings(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await admin();
  const supabase = await createClient();
  const { error } = await supabase
    .from("birdwing_settings")
    .update({
      company_id: optionalText(formData, "company_id"),
      place_of_supply: optionalText(formData, "place_of_supply"),
      bank_details: optionalText(formData, "bank_details"),
      upi_id: optionalText(formData, "upi_id"),
      invoice_terms: optionalText(formData, "invoice_terms"),
      checkin_time: optionalText(formData, "checkin_time"),
      checkout_time: optionalText(formData, "checkout_time"),
      updated_by: user.id,
    })
    .eq("id", true);
  if (error) return failed(error, "Could not save the invoice details. Try again.");
  refresh();
  return undefined;
}
