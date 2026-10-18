"use server";

// Type-only import, not re-exported from a "use server" file (npm run check:actions).
import type { ActionState } from "@/lib/action-state";
import { requireTool } from "@/lib/auth/access";
import { dbErrorMessage } from "@/lib/db-error";
import { optionalText, text } from "@/lib/form-data";
import { todayInIndia } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  parseChannel,
  parseCount,
  parseGstPct,
  parseMonth,
  parseQty,
  parseRoomNights,
  parseRupees,
  parseStayDates,
  parseUse,
} from "./forms";
import { pendingByStay } from "./queries";
import { canMove } from "./workflow";
import {
  CHARGE_KINDS,
  GRANT,
  ID_TYPES,
  RECEIPT_MODES,
  STAY_STATUSES,
  isInternalUse,
  oneOf,
} from "./shared";

/** Every action opens with requireTool and revalidates the layout (the welcome counts sit one screen away).
 * The 0115 guards refuse in plain English; `GUARD_PHRASES` lets those through, else the action's fallback shows. */

const GUARD_PHRASES = [
  "never change",
  "cannot go from",
  "is cancelled",
  "its record now",
  "falls outside",
  "must fall within",
  "has been issued",
  "cancel it",
  "cancelled for good",
  "could not be found",
  "nothing to invoice",
  "made out to",
  "Birdwing → Settings",
  "at least one charge",
  "discount is more",
  "released",
];

type Client = Awaited<ReturnType<typeof createClient>>;

const refresh = () => revalidatePath("/birdwing", "layout");

function fromDb(error: { message: string; code?: string }, fallback: string): ActionState {
  console.error(`birdwing: ${fallback}`, error);
  return { error: dbErrorMessage(error, fallback, GUARD_PHRASES) };
}

async function roomClash(
  supabase: Client,
  rooms: { roomId: string; from: string; to: string }[],
  ignoreStayId?: string,
): Promise<string | null> {
  for (const room of rooms) {
    let query = supabase
      .from("birdwing_stay_rooms")
      .select("stay_id, birdwing_rooms(code), birdwing_stays(ref)")
      .eq("room_id", room.roomId)
      .is("released_at", null)
      .lt("from_date", room.to)
      .gt("to_date", room.from)
      .limit(1);
    if (ignoreStayId) query = query.neq("stay_id", ignoreStayId);
    const { data, error } = await query;
    if (error) {
      console.error("birdwing roomClash failed:", error);
      return "Could not check the room's nights. Try again.";
    }
    const clash = data?.[0];
    if (clash) {
      return `${clash.birdwing_rooms?.code ?? "That room"} is already booked on those nights (${clash.birdwing_stays?.ref ?? "another stay"}).`;
    }
  }
  return null;
}

const OVERLAP = "23P01";

// The 0115 guard mints the BW- reference and overwrites this placeholder; the insert type still demands the column.
const MINTED_BY_DATABASE = "";
const overlapMessage = "That room was booked on those nights a moment ago. Pick another room.";

export async function createStay(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireTool(GRANT);

  const dates = parseStayDates(text(formData, "arrival"), text(formData, "departure"));
  if (!dates.ok) return { error: dates.error };
  const use = parseUse(text(formData, "use"));
  if (!use.ok) return { error: use.error };
  const channel = parseChannel(text(formData, "channel"));
  if (!channel.ok) return { error: channel.error };
  const adults = parseCount(text(formData, "adults"), "Adults");
  if (!adults.ok) return { error: adults.error };
  const children = parseCount(text(formData, "children"), "Children");
  if (!children.ok) return { error: children.error };
  const pets = parseCount(text(formData, "pets"), "Pets", 20);
  if (!pets.ok) return { error: pets.error };
  const status = text(formData, "status") === "enquiry" ? "enquiry" : "confirmed";

  const roomIds = [...new Set(formData.getAll("room_id").map(String).filter(Boolean))];
  const { arrival, departure } = dates.value;
  if (roomIds.length > 0 && departure === arrival) {
    return {
      error: "A day visit has no night, so no room. Pick a later departure or clear the rooms.",
    };
  }

  const costCentreId = optionalText(formData, "cost_centre_id");
  const supabase = await createClient();

  const clash = await roomClash(
    supabase,
    roomIds.map((roomId) => ({ roomId, from: arrival, to: departure })),
  );
  if (clash) return { error: clash };

  let guestId = optionalText(formData, "guest_id");
  if (!guestId) {
    const name = text(formData, "guest_name");
    if (!name) return { error: "Pick the guest, or type a new guest's name." };
    if (name.length > 120) return { error: "Keep the guest's name under 120 characters." };
    const { data: guest, error } = await supabase
      .from("birdwing_guests")
      .insert({
        name,
        phone: optionalText(formData, "guest_phone"),
        email: optionalText(formData, "guest_email"),
        city: optionalText(formData, "guest_city"),
        created_by: user.id,
        updated_by: user.id,
      })
      .select("id")
      .single();
    if (error) return fromDb(error, "Could not save the guest. Try again.");
    guestId = guest.id;
  }

  const { data: stay, error } = await supabase
    .from("birdwing_stays")
    .insert({
      ref: MINTED_BY_DATABASE,
      guest_id: guestId,
      use: use.value,
      channel: channel.value,
      cost_centre_id: isInternalUse(use.value) ? costCentreId : null,
      referred_by: optionalText(formData, "referred_by"),
      status,
      arrival,
      departure,
      accounting_month: `${arrival.slice(0, 7)}-01`,
      adults: adults.value,
      children: children.value,
      pets: pets.value,
      notes: optionalText(formData, "notes"),
      created_by: user.id,
      updated_by: user.id,
    })
    .select("id")
    .single();
  if (error) return fromDb(error, "Could not save the stay. Try again.");

  if (roomIds.length > 0) {
    const { error: roomError } = await supabase.from("birdwing_stay_rooms").insert(
      roomIds.map((roomId) => ({
        stay_id: stay.id,
        room_id: roomId,
        from_date: arrival,
        to_date: departure,
        created_by: user.id,
        updated_by: user.id,
      })),
    );
    if (roomError) {
      // Two people booked the same room in the same second: the stay is cancelled with the reason, keeping no room it did not get.
      const { error: cancelError } = await supabase
        .from("birdwing_stays")
        .update({
          status: "cancelled",
          cancel_reason: "Not saved — a room was booked by someone else at the same moment.",
          updated_by: user.id,
        })
        .eq("id", stay.id);
      if (cancelError) console.error("createStay cancel failed:", cancelError);
      if (roomError.code === OVERLAP) return { error: overlapMessage };
      return fromDb(roomError, "Could not book the rooms. Try again.");
    }
  }

  refresh();
  redirect(`/birdwing/stays/${stay.id}`);
}

export async function createBlock(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireTool(GRANT);

  const dates = parseStayDates(text(formData, "from"), text(formData, "to"));
  if (!dates.ok) return { error: dates.error };
  const { arrival, departure } = dates.value;
  if (departure === arrival) return { error: "A block needs at least one night." };
  const roomIds = [...new Set(formData.getAll("room_id").map(String).filter(Boolean))];
  if (roomIds.length === 0) return { error: "Pick the rooms to block." };
  const note = text(formData, "note");
  if (!note) return { error: "Say why the rooms are blocked, e.g. Painting." };

  const supabase = await createClient();
  const clash = await roomClash(
    supabase,
    roomIds.map((roomId) => ({ roomId, from: arrival, to: departure })),
  );
  if (clash) return { error: clash };

  const { data: block, error } = await supabase
    .from("birdwing_stays")
    .insert({
      ref: MINTED_BY_DATABASE,
      is_block: true,
      status: "blocked",
      arrival,
      departure,
      accounting_month: `${arrival.slice(0, 7)}-01`,
      notes: note,
      created_by: user.id,
      updated_by: user.id,
    })
    .select("id")
    .single();
  if (error) return fromDb(error, "Could not block the rooms. Try again.");

  const { error: roomError } = await supabase.from("birdwing_stay_rooms").insert(
    roomIds.map((roomId) => ({
      stay_id: block.id,
      room_id: roomId,
      from_date: arrival,
      to_date: departure,
      created_by: user.id,
      updated_by: user.id,
    })),
  );
  if (roomError) {
    const { error: cancelError } = await supabase
      .from("birdwing_stays")
      .update({
        status: "cancelled",
        cancel_reason: "Not saved — a room was taken.",
        updated_by: user.id,
      })
      .eq("id", block.id);
    if (cancelError) console.error("createBlock cancel failed:", cancelError);
    if (roomError.code === OVERLAP) return { error: overlapMessage };
    return fromDb(roomError, "Could not block the rooms. Try again.");
  }

  refresh();
  redirect("/birdwing/calendar");
}

export async function updateStay(
  stayId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireTool(GRANT);

  const dates = parseStayDates(text(formData, "arrival"), text(formData, "departure"));
  if (!dates.ok) return { error: dates.error };
  const use = parseUse(text(formData, "use"));
  if (!use.ok) return { error: use.error };
  const channel = parseChannel(text(formData, "channel"));
  if (!channel.ok) return { error: channel.error };
  const adults = parseCount(text(formData, "adults"), "Adults");
  if (!adults.ok) return { error: adults.error };
  const children = parseCount(text(formData, "children"), "Children");
  if (!children.ok) return { error: children.error };
  const pets = parseCount(text(formData, "pets"), "Pets", 20);
  if (!pets.ok) return { error: pets.error };
  const ota = parseRupees(text(formData, "ota_commission"), "OTA commission", { blank: 0 });
  if (!ota.ok) return { error: ota.error };
  const discount = parseRupees(text(formData, "discount"), "Discount", { blank: 0 });
  if (!discount.ok) return { error: discount.error };
  const month = parseMonth(text(formData, "accounting_month"));
  if (!month.ok) return { error: month.error };

  const supabase = await createClient();
  const { error } = await supabase
    .from("birdwing_stays")
    .update({
      use: use.value,
      channel: channel.value,
      cost_centre_id: isInternalUse(use.value) ? optionalText(formData, "cost_centre_id") : null,
      referred_by: optionalText(formData, "referred_by"),
      arrival: dates.value.arrival,
      departure: dates.value.departure,
      adults: adults.value,
      children: children.value,
      pets: pets.value,
      ota_commission: ota.value,
      discount: discount.value,
      accounting_month: month.value,
      notes: optionalText(formData, "notes"),
      updated_by: user.id,
    })
    .eq("id", stayId);
  if (error) return fromDb(error, "Could not save the stay. Try again.");

  refresh();
  return undefined;
}

export async function moveStay(
  stayId: string,
  to: string,
  reason: string | null,
): Promise<ActionState> {
  const user = await requireTool(GRANT);
  const next = oneOf(STAY_STATUSES, to);
  if (!next) return { error: "That is not a status a stay can have." };
  if (next === "cancelled" && !reason?.trim()) return { error: "Say why it is cancelled." };

  const supabase = await createClient();
  const { data: stay, error: readError } = await supabase
    .from("birdwing_stays")
    .select("status")
    .eq("id", stayId)
    .maybeSingle();
  if (readError) return fromDb(readError, "Could not read the stay. Try again.");
  if (!stay) return { error: "That stay could not be found." };
  const from = oneOf(STAY_STATUSES, stay.status);
  if (!from || !canMove(from, next)) {
    return { error: "The stay has moved on since this page was opened. Reload it." };
  }

  // No .eq("status") filter: a stale button meets the guard's own sentence, not a silent nothing.
  const { error } = await supabase
    .from("birdwing_stays")
    .update({
      status: next,
      ...(next === "cancelled" ? { cancel_reason: reason?.trim() } : {}),
      updated_by: user.id,
    })
    .eq("id", stayId);
  if (error) return fromDb(error, "Could not change the stay. Try again.");

  refresh();
  return undefined;
}

export async function saveCheckinDetails(
  stayId: string,
  guestId: string | null,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireTool(GRANT);
  const supabase = await createClient();

  if (guestId) {
    const idType = optionalText(formData, "id_type");
    const idLast4 = optionalText(formData, "id_last4");
    if (idType && !oneOf(ID_TYPES, idType)) return { error: "Pick the kind of ID." };
    if (idLast4 && !/^[A-Za-z0-9]{1,4}$/.test(idLast4)) {
      return {
        error: "Keep only the last four letters or digits of the ID — never the whole number.",
      };
    }
    const name = text(formData, "guest_name");
    if (!name) return { error: "The guest needs a name." };
    const { error } = await supabase
      .from("birdwing_guests")
      .update({
        name,
        phone: optionalText(formData, "phone"),
        email: optionalText(formData, "email"),
        city: optionalText(formData, "city"),
        id_type: idType,
        id_last4: idLast4,
        updated_by: user.id,
      })
      .eq("id", guestId);
    if (error) return fromDb(error, "Could not save the guest. Try again.");
  }

  const { error } = await supabase
    .from("birdwing_stays")
    .update({
      guest_names: optionalText(formData, "guest_names"),
      food_preferences: optionalText(formData, "food_preferences"),
      allergies: optionalText(formData, "allergies"),
      requirements: optionalText(formData, "requirements"),
      id_verified: formData.get("id_verified") === "on",
      updated_by: user.id,
    })
    .eq("id", stayId);
  if (error) return fromDb(error, "Could not save the check-in details. Try again.");

  refresh();
  return undefined;
}

export async function addStayRoom(
  stayId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireTool(GRANT);
  const roomId = text(formData, "room_id");
  if (!roomId) return { error: "Pick a room." };
  const beds = parseCount(text(formData, "extra_beds"), "Extra beds", 6);
  if (!beds.ok) return { error: beds.error };

  const supabase = await createClient();
  const { data: stay, error: readError } = await supabase
    .from("birdwing_stays")
    .select("arrival, departure")
    .eq("id", stayId)
    .maybeSingle();
  if (readError) return fromDb(readError, "Could not read the stay. Try again.");
  if (!stay) return { error: "That stay could not be found." };

  const nights = parseRoomNights(
    text(formData, "from") || stay.arrival,
    text(formData, "to") || stay.departure,
    stay,
  );
  if (!nights.ok) return { error: nights.error };

  const clash = await roomClash(supabase, [{ roomId, ...nights.value }], stayId);
  if (clash) return { error: clash };

  const { error } = await supabase.from("birdwing_stay_rooms").insert({
    stay_id: stayId,
    room_id: roomId,
    from_date: nights.value.from,
    to_date: nights.value.to,
    extra_beds: beds.value,
    created_by: user.id,
    updated_by: user.id,
  });
  if (error) {
    if (error.code === OVERLAP)
      return { error: "That room is already booked on one of those nights." };
    return fromDb(error, "Could not add the room. Try again.");
  }

  refresh();
  return undefined;
}

export async function removeStayRoom(stayRoomId: string): Promise<ActionState> {
  await requireTool(GRANT);
  const supabase = await createClient();
  const { error } = await supabase.from("birdwing_stay_rooms").delete().eq("id", stayRoomId);
  if (error) return fromDb(error, "Could not remove the room. Try again.");
  refresh();
  return undefined;
}

export async function addCharge(
  stayId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireTool(GRANT);
  const supabase = await createClient();

  const qty = parseQty(text(formData, "qty"));
  if (!qty.ok) return { error: qty.error };
  const rate = parseRupees(text(formData, "rate"), "Rate", { blank: null });
  if (!rate.ok) return { error: rate.error };
  if (rate.value === null) return { error: "Type the rate." };
  const inclusive = formData.get("rate_includes_gst") === "on";

  // From the rate card: head, kind, GST and SAC are COPIED onto the line, so a new rate card never rewrites an old invoice.
  const rateCardId = optionalText(formData, "rate_card_id");
  let line: { head: string; kind: string; gst_pct: number; sac: string | null };
  if (rateCardId) {
    const { data: card, error } = await supabase
      .from("birdwing_rate_card")
      .select("head, kind, gst_pct, sac")
      .eq("id", rateCardId)
      .maybeSingle();
    if (error) return fromDb(error, "Could not read the rate card. Try again.");
    if (!card) return { error: "That rate card head could not be found." };
    line = { head: card.head, kind: card.kind, gst_pct: Number(card.gst_pct), sac: card.sac };
  } else {
    const head = text(formData, "head");
    if (!head) return { error: "Pick a head from the rate card, or name the charge." };
    const gst = parseGstPct(text(formData, "gst_pct"));
    if (!gst.ok) return { error: gst.error };
    line = {
      head,
      kind: oneOf(CHARGE_KINDS, text(formData, "kind")) ?? "other",
      gst_pct: gst.value,
      sac: optionalText(formData, "sac"),
    };
  }

  const { data: last, error: lastError } = await supabase
    .from("birdwing_stay_charges")
    .select("sort_order")
    .eq("stay_id", stayId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (lastError) return fromDb(lastError, "Could not add the charge. Try again.");

  const { error } = await supabase.from("birdwing_stay_charges").insert({
    stay_id: stayId,
    rate_card_id: rateCardId,
    ...line,
    description: optionalText(formData, "description"),
    qty: qty.value,
    rate: rate.value,
    rate_includes_gst: inclusive,
    sort_order: (last?.sort_order ?? -1) + 1,
    created_by: user.id,
    updated_by: user.id,
  });
  if (error) {
    if (error.code === "23503") return { error: "A room block carries no charges." };
    return fromDb(error, "Could not add the charge. Try again.");
  }

  refresh();
  return undefined;
}

export async function deleteCharge(chargeId: string): Promise<ActionState> {
  await requireTool(GRANT);
  const supabase = await createClient();
  const { error } = await supabase.from("birdwing_stay_charges").delete().eq("id", chargeId);
  if (error) return fromDb(error, "Could not remove the charge. Try again.");
  refresh();
  return undefined;
}

export async function issueInvoice(
  stayId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireTool(GRANT);
  const billTo = text(formData, "bill_to_name");
  if (!billTo) return { error: "Say who the invoice is made out to." };
  const gstin = optionalText(formData, "bill_to_gstin");
  if (gstin && !/^[0-9A-Z]{15}$/i.test(gstin)) {
    return { error: "A GSTIN is 15 letters and digits — check it, or leave it blank." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("birdwing_issue_invoice", {
    p_stay_id: stayId,
    p_bill_to_name: billTo,
    p_bill_to_gstin: gstin?.toUpperCase() ?? undefined,
    p_bill_to_address: optionalText(formData, "bill_to_address") ?? undefined,
  });
  if (error) return fromDb(error, "Could not issue the invoice. Try again.");

  refresh();
  return undefined;
}

export async function cancelInvoice(invoiceId: string, reason: string): Promise<ActionState> {
  const user = await requireTool(GRANT);
  if (!reason.trim()) return { error: "Say why the invoice is cancelled." };
  const supabase = await createClient();
  const { error } = await supabase
    .from("birdwing_invoices")
    .update({
      status: "cancelled",
      cancelled_at: new Date().toISOString(),
      cancelled_by: user.id,
      cancel_reason: reason.trim(),
      updated_by: user.id,
    })
    .eq("id", invoiceId);
  if (error) return fromDb(error, "Could not cancel the invoice. Try again.");
  refresh();
  return undefined;
}

export async function addReceipt(
  stayId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireTool(GRANT);
  const amount = parseRupees(text(formData, "amount"), "Amount", { blank: null, positive: true });
  if (!amount.ok) return { error: amount.error };
  if (amount.value === null) return { error: "Type the amount received." };
  const receivedOn = text(formData, "received_on") || todayInIndia();
  if (receivedOn > todayInIndia()) return { error: "A receipt can't be dated in the future." };
  const mode = oneOf(RECEIPT_MODES, text(formData, "mode"));
  if (!mode) return { error: "Pick how it was paid." };

  const supabase = await createClient();
  const { data: invoice, error: invoiceError } = await supabase
    .from("birdwing_invoices")
    .select("id")
    .eq("stay_id", stayId)
    .eq("status", "issued")
    .maybeSingle();
  if (invoiceError) return fromDb(invoiceError, "Could not record the receipt. Try again.");

  const { error } = await supabase.from("birdwing_receipts").insert({
    stay_id: stayId,
    invoice_id: invoice?.id ?? null,
    amount: amount.value,
    received_on: receivedOn,
    mode,
    reference: optionalText(formData, "reference"),
    note: optionalText(formData, "note"),
    created_by: user.id,
    updated_by: user.id,
  });
  if (error) return fromDb(error, "Could not record the receipt. Try again.");

  refresh();
  return undefined;
}

export async function deleteReceipt(receiptId: string): Promise<ActionState> {
  await requireTool(GRANT);
  const supabase = await createClient();
  const { error } = await supabase.from("birdwing_receipts").delete().eq("id", receiptId);
  if (error) return fromDb(error, "Could not remove the receipt. Try again.");
  refresh();
  return undefined;
}

export async function addSettlement(
  stayId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireTool(GRANT);
  const kind = text(formData, "kind") === "write_off" ? "write_off" : "cross_charge";
  const costCentreId = optionalText(formData, "cost_centre_id");
  if (kind === "cross_charge" && !costCentreId) {
    return { error: "Pick the cost centre that carries this stay." };
  }
  const amount = parseRupees(text(formData, "amount"), "Amount", { blank: null, positive: true });
  if (!amount.ok) return { error: amount.error };
  if (amount.value === null) return { error: "Type the amount." };
  const month = parseMonth(text(formData, "month"));
  if (!month.ok) return { error: month.error };
  const note = optionalText(formData, "note");
  if (kind === "write_off" && !note) return { error: "Say why it is written off." };

  const supabase = await createClient();
  const { error } = await supabase.from("birdwing_cross_charges").insert({
    stay_id: stayId,
    kind,
    cost_centre_id: kind === "cross_charge" ? costCentreId : null,
    amount: amount.value,
    charged_month: month.value,
    note,
    created_by: user.id,
    updated_by: user.id,
  });
  if (error) return fromDb(error, "Could not record it. Try again.");

  refresh();
  return undefined;
}

export async function deleteSettlement(settlementId: string): Promise<ActionState> {
  await requireTool(GRANT);
  const supabase = await createClient();
  const { error } = await supabase.from("birdwing_cross_charges").delete().eq("id", settlementId);
  if (error) return fromDb(error, "Could not remove it. Try again.");
  refresh();
  return undefined;
}

export async function markReviewed(stayIds: string[]): Promise<ActionState> {
  const user = await requireTool(GRANT);
  if (stayIds.length === 0) return { error: "Tick at least one stay." };
  const supabase = await createClient();
  const { error } = await supabase
    .from("birdwing_stays")
    .update({ reviewed_at: new Date().toISOString(), reviewed_by: user.id, updated_by: user.id })
    .in("id", stayIds.slice(0, 200));
  if (error) return fromDb(error, "Could not mark them reviewed. Try again.");
  refresh();
  return undefined;
}

export async function assignCostCentre(
  stayIds: string[],
  costCentreId: string,
): Promise<ActionState> {
  const user = await requireTool(GRANT);
  if (stayIds.length === 0) return { error: "Tick at least one stay." };
  if (!costCentreId) return { error: "Pick a cost centre." };
  const supabase = await createClient();
  const { error } = await supabase
    .from("birdwing_stays")
    .update({ cost_centre_id: costCentreId, updated_by: user.id })
    .in("id", stayIds.slice(0, 200))
    .neq("use", "guest");
  if (error) return fromDb(error, "Could not set the cost centre. Try again.");
  refresh();
  return undefined;
}

/** Closes each ticked stay's pending balance: a cross-charge to its own cost centre (skipped and named if none) or a write-off. */
export async function settleStays(
  stayIds: string[],
  kind: "cross_charge" | "write_off",
  note: string,
): Promise<ActionState> {
  const user = await requireTool(GRANT);
  if (stayIds.length === 0) return { error: "Tick at least one stay." };
  if (kind === "write_off" && !note.trim()) return { error: "Say why they are written off." };
  const supabase = await createClient();
  const pending = await pendingByStay(stayIds);

  const { data: stays, error: readError } = await supabase
    .from("birdwing_stays")
    .select("id, ref, cost_centre_id, accounting_month")
    .in("id", stayIds.slice(0, 200));
  if (readError) return fromDb(readError, "Could not read the stays. Try again.");

  const missing = (stays ?? []).filter((stay) => kind === "cross_charge" && !stay.cost_centre_id);
  if (missing.length > 0) {
    return {
      error: `Give these a cost centre first: ${missing.map((stay) => stay.ref).join(", ")}.`,
    };
  }
  const rows = (stays ?? [])
    .filter((stay) => (pending.get(stay.id) ?? 0) >= 1)
    .map((stay) => ({
      stay_id: stay.id,
      kind,
      cost_centre_id: kind === "cross_charge" ? stay.cost_centre_id : null,
      amount: Math.round((pending.get(stay.id) ?? 0) * 100) / 100,
      charged_month: stay.accounting_month,
      note: note.trim() || null,
      created_by: user.id,
      updated_by: user.id,
    }));
  if (rows.length === 0) return { error: "None of the ticked stays has anything pending." };

  const { error } = await supabase.from("birdwing_cross_charges").insert(rows);
  if (error) return fromDb(error, "Could not close them. Try again.");
  refresh();
  return undefined;
}
