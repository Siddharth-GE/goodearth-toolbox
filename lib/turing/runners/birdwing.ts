import "server-only";

import {
  addCharge,
  addReceipt,
  addSettlement,
  addStayRoom,
  cancelInvoice,
  cancelReceipt,
  cancelSettlement,
  createBlock,
  createStay,
  deleteCharge,
  issueInvoice,
  markReviewed,
  moveStay,
  removeStayRoom,
  saveCheckinDetails,
  updateStay,
} from "@/lib/birdwing/actions";
import { saveCostCentre, saveRateCardItem } from "@/lib/birdwing/settings-actions";
import { formatMoney } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

import { entryFor, formOf, type Entry } from "../catalogue-fields";
import { moveRefused, roomCodes, roomNights, type BIRDWING } from "../entries/birdwing";
import { idFrom } from "../redirects";
import { failed, given, recordNow, saving, type Runners, type Values } from "./kit";

type Key = (typeof BIRDWING)[number]["key"];
type Refusal = { error: string } | null;
type Failure = { error: string };

const text = (values: Values, key: string) =>
  typeof values[key] === "string" && values[key] ? String(values[key]).trim() : null;
const entry = (key: Key) => entryFor(key) as Entry;
const STAYS = "/birdwing/stays/";

/** Rooms by code, as the screens offer them: only rooms in use. */
async function roomIds(codes: string[]): Promise<{ ids: string[] } | Failure> {
  if (codes.length === 0) return { ids: [] };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("birdwing_rooms")
    .select("id, code, is_active")
    .in("code", codes);
  if (error) return failed("birdwing_rooms", error);
  const byCode = new Map((data ?? []).map((room) => [room.code.toUpperCase(), room]));
  const ids: string[] = [];
  for (const code of codes) {
    const room = byCode.get(code);
    if (!room) return { error: `There is no room ${code}.` };
    if (!room.is_active) return { error: `Room ${code} is not in use.` };
    ids.push(room.id);
  }
  return { ids };
}

/** The pickers offer cost centres in use, and the one a stay already has. */
async function centreRefused(id: string | null, current: unknown = null): Promise<Refusal> {
  if (!id || id === current) return null;
  const now = await recordNow(
    "birdwing_cost_centres",
    { column: "id", id },
    ["is_active"],
    "That cost centre is gone.",
  );
  if ("error" in now) return now;
  return now.row.is_active === false ? { error: "That cost centre is not in use." } : null;
}

async function stayNow(id: string, columns: string[] = []) {
  return recordNow(
    "birdwing_stays",
    { column: "id", id },
    ["status", "is_block", ...columns],
    "That stay is gone.",
  );
}

/** The stay page hides its details and check-in forms on a cancelled stay, and a block has neither. */
function detailsRefused(row: Record<string, unknown>, block: string): Refusal {
  if (row.is_block) return { error: block };
  if (row.status === "cancelled") return { error: "A cancelled stay can no longer be changed." };
  return null;
}

/** …and its room picker on a cancelled or checked-out one. */
const roomsRefused = (row: Record<string, unknown>): Refusal =>
  row.status === "cancelled" || row.status === "checked_out"
    ? { error: "A cancelled or checked-out stay's rooms can no longer be changed." }
    : null;

async function refOf(stayId: string): Promise<string> {
  const now = await recordNow("birdwing_stays", { column: "id", id: stayId }, ["ref"], null);
  return "row" in now && now.row.ref ? String(now.row.ref) : "the stay";
}

/** A form with the rooms' ids where the row named them by code, as the screens' checkboxes send them. */
function withRooms(form: FormData, ids: string[]): FormData {
  form.delete("rooms");
  for (const id of ids) form.append("room_id", id);
  return form;
}

export const BIRDWING_RUNNERS: Runners<Key> = {
  bw_stay_new: async (v) => {
    const rooms = await roomIds(roomCodes(v.rooms));
    if ("error" in rooms) return rooms;
    const refused = await centreRefused(text(v, "cost_centre_id"));
    if (refused) return refused;
    const form = withRooms(formOf(entry("bw_stay_new"), v), rooms.ids);
    const done = await saving(() => createStay(undefined, form), STAYS);
    if ("error" in done) return done;
    const id = idFrom(done.path, STAYS);
    return id ? { saved: await refOf(id) } : undefined;
  },
  bw_block_new: async (v) => {
    const rooms = await roomIds(roomCodes(v.rooms));
    if ("error" in rooms) return rooms;
    if (rooms.ids.length === 0) return { error: "Name the rooms to block." };
    const form = withRooms(formOf(entry("bw_block_new"), v), rooms.ids);
    const done = await saving(() => createBlock(undefined, form), "/birdwing/calendar");
    return "error" in done ? done : undefined;
  },
  bw_stay_change: async (v) => {
    const id = String(v.stay_id);
    const now = await stayNow(id, [
      "arrival",
      "departure",
      "use",
      "channel",
      "cost_centre_id",
      "referred_by",
      "adults",
      "children",
      "pets",
      "ota_commission",
      "discount",
      "accounting_month",
      "notes",
    ]);
    if ("error" in now) return now;
    const row = now.row;
    const refused = detailsRefused(
      row,
      "A room block has no stay details; remove it and block the rooms again.",
    );
    if (refused) return refused;
    // The cost centre picker shows only on a Goodearth stay; a guest's would be dropped unsaid.
    if (given(v, "use", row.use as string) === "guest" && text(v, "cost_centre_id")) {
      return { error: "A paying guest's stay has no cost centre." };
    }
    const centre = await centreRefused(text(v, "cost_centre_id"), row.cost_centre_id);
    if (centre) return centre;
    const form = formOf(entry("bw_stay_change"), v, {
      ...row,
      accounting_month: String(row.accounting_month ?? "").slice(0, 7),
    });
    return updateStay(id, undefined, form);
  },
  bw_stay_move: async (v) => {
    const id = String(v.stay_id);
    const now = await stayNow(id);
    if ("error" in now) return now;
    const refused = moveRefused(String(now.row.status), String(v.to));
    if (refused) return { error: refused };
    return moveStay(id, String(v.to), text(v, "reason"));
  },
  bw_checkin: async (v) => {
    const id = String(v.stay_id);
    const now = await stayNow(id, [
      "guest_id",
      "guest_names",
      "food_preferences",
      "allergies",
      "requirements",
      "id_verified",
    ]);
    if ("error" in now) return now;
    const refused = detailsRefused(now.row, "A room block has no guest.");
    if (refused) return refused;
    const guestId = (now.row.guest_id as string | null) ?? null;
    let guest: Record<string, unknown> = {};
    if (guestId) {
      const found = await recordNow(
        "birdwing_guests",
        { column: "id", id: guestId },
        ["name", "phone", "email", "city", "id_type", "id_last4"],
        "That stay's guest is gone.",
      );
      if ("error" in found) return found;
      guest = { ...found.row, guest_name: found.row.name };
    } else if (
      ["guest_name", "phone", "email", "city", "id_type", "id_last4"].some((key) => key in v)
    ) {
      // The save skips the guest's own fields when the stay names no guest.
      return { error: "That stay has no guest record, so only its own check-in details save." };
    }
    const form = formOf(entry("bw_checkin"), v, { ...now.row, ...guest });
    return saveCheckinDetails(id, guestId, undefined, form);
  },
  bw_room_add: async (v) => {
    const id = String(v.stay_id);
    const codes = roomCodes(v.room);
    if (codes.length !== 1) return { error: "Name one room per row, like R1." };
    const now = await stayNow(id);
    if ("error" in now) return now;
    const refused = roomsRefused(now.row);
    if (refused) return refused;
    const rooms = await roomIds(codes);
    if ("error" in rooms) return rooms;
    const form = new FormData();
    form.set("room_id", rooms.ids[0]);
    form.set("extra_beds", text(v, "extra_beds") ?? "0");
    form.set("from", text(v, "from") ?? "");
    form.set("to", text(v, "to") ?? "");
    return addStayRoom(id, undefined, form);
  },
  bw_room_remove: async (v) => {
    const id = String(v.stay_room_id);
    const room = await recordNow(
      "birdwing_stay_rooms",
      { column: "id", id },
      ["stay_id", "released_at"],
      "That room is no longer on the stay.",
    );
    if ("error" in room) return room;
    if (room.row.released_at) return { error: "That room was released with its stay." };
    const now = await stayNow(String(room.row.stay_id));
    if ("error" in now) return now;
    const refused = roomsRefused(now.row);
    if (refused) return refused;
    return removeStayRoom(id);
  },
  bw_charge_add: async (v) => {
    const id = String(v.stay_id);
    const values: Values = { ...v };
    const cardId = text(v, "rate_card_id");
    // The form fills the rate from the card and the quantity from the stay's room-nights.
    let roomHead = false;
    if (cardId) {
      const card = await recordNow(
        "birdwing_rate_card",
        { column: "id", id: cardId },
        ["kind", "default_rate", "is_active"],
        "That rate card head is gone.",
      );
      if ("error" in card) return card;
      if (card.row.is_active === false) {
        return {
          error: "That rate card head is switched off; an admin switches it on in Settings.",
        };
      }
      if (!text(v, "rate")) values.rate = String(card.row.default_rate ?? "");
      roomHead = card.row.kind === "room";
    }
    if (!text(v, "qty")) {
      let qty = 0;
      if (roomHead) {
        const supabase = await createClient();
        const { data, error } = await supabase
          .from("birdwing_stay_rooms")
          .select("from_date, to_date")
          .eq("stay_id", id)
          .is("released_at", null);
        if (error) return failed("birdwing_stay_rooms", error);
        qty = roomNights(data ?? []);
      }
      values.qty = String(qty || 1);
    }
    return addCharge(id, undefined, formOf(entry("bw_charge_add"), values));
  },
  bw_charge_delete: (v) => deleteCharge(String(v.charge_id)),
  bw_invoice_issue: async (v) => {
    const id = String(v.stay_id);
    const values: Values = { ...v };
    if (!text(v, "bill_to_name")) {
      // The form starts with the guest's name.
      const now = await stayNow(id, ["guest_id"]);
      if ("error" in now) return now;
      if (now.row.guest_id) {
        const guest = await recordNow(
          "birdwing_guests",
          { column: "id", id: String(now.row.guest_id) },
          ["name"],
          null,
        );
        if ("error" in guest) return guest;
        values.bill_to_name = String(guest.row.name ?? "");
      }
    }
    const result = await issueInvoice(id, undefined, formOf(entry("bw_invoice_issue"), values));
    if (result?.error) return result;
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("birdwing_invoices")
      .select("number")
      .eq("stay_id", id)
      .eq("status", "issued")
      .maybeSingle();
    if (error) console.error("turing: the issued invoice's number not read:", error);
    return data?.number ? { saved: data.number } : undefined;
  },
  bw_invoice_cancel: async (v) => {
    const id = String(v.invoice_id);
    const now = await recordNow(
      "birdwing_invoices",
      { column: "id", id },
      ["status", "historic"],
      "That invoice is gone.",
    );
    if ("error" in now) return now;
    if (now.row.historic) return { error: "An invoice from the old sheet is not cancelled here." };
    if (now.row.status !== "issued") return { error: "That invoice is already cancelled." };
    return cancelInvoice(id, String(v.reason));
  },
  bw_receipt: async (v) => {
    const id = String(v.stay_id);
    const now = await stayNow(id);
    if ("error" in now) return now;
    if (now.row.is_block) return { error: "A room block takes no money." };
    return addReceipt(id, undefined, formOf(entry("bw_receipt"), v));
  },
  bw_receipt_cancel: async (v) => {
    const id = String(v.receipt_id);
    const now = await recordNow(
      "birdwing_receipts",
      { column: "id", id },
      ["cancel_reason"],
      "That receipt is gone.",
    );
    if ("error" in now) return now;
    if (now.row.cancel_reason) return { error: "That receipt is already cancelled." };
    return cancelReceipt(id, String(v.reason));
  },
  bw_settle: async (v) => {
    const id = String(v.stay_id);
    const now = await stayNow(id, ["use", "cost_centre_id", "accounting_month"]);
    if ("error" in now) return now;
    if (now.row.is_block) return { error: "A room block owes nothing." };
    const facts = await recordNow(
      "birdwing_stay_facts",
      { column: "stay_id", id },
      ["pending"],
      null,
    );
    if ("error" in facts) return facts;
    // The stay page offers this only while at least a rupee is pending, starting at all of it.
    const pending = Math.round(Number(facts.row.pending ?? 0) * 100) / 100;
    if (pending < 1) return { error: "Nothing is pending on that stay." };
    const kind = text(v, "kind") ?? (now.row.use === "guest" ? "write_off" : "cross_charge");
    if (kind === "write_off" && text(v, "cost_centre_id")) {
      return { error: "A write-off goes to no cost centre." };
    }
    const centre =
      kind === "cross_charge"
        ? (text(v, "cost_centre_id") ?? (now.row.cost_centre_id as string | null))
        : null;
    const refused = await centreRefused(centre, now.row.cost_centre_id);
    if (refused) return refused;
    const amount = text(v, "amount") ? Number(v.amount) : pending;
    if (amount > pending) {
      return { error: `That is more than the ${formatMoney(pending, { paise: true })} pending.` };
    }
    const form = formOf(entry("bw_settle"), {
      ...v,
      kind,
      cost_centre_id: centre ?? "",
      amount: String(amount),
      month: text(v, "month") ?? String(now.row.accounting_month ?? "").slice(0, 7),
    });
    return addSettlement(id, undefined, form);
  },
  bw_settle_cancel: async (v) => {
    const id = String(v.settlement_id);
    const now = await recordNow(
      "birdwing_cross_charges",
      { column: "id", id },
      ["cancel_reason"],
      "That cross-charge or write-off is gone.",
    );
    if ("error" in now) return now;
    if (now.row.cancel_reason) return { error: "That is already cancelled." };
    return cancelSettlement(id, String(v.reason));
  },
  bw_reviewed: (v) => markReviewed([String(v.stay_id)]),
  bw_rate_new: (v) => saveRateCardItem(null, undefined, formOf(entry("bw_rate_new"), v)),
  bw_rate_change: async (v) => {
    const id = String(v.rate_card_id);
    const now = await recordNow(
      "birdwing_rate_card",
      { column: "id", id },
      ["head", "kind", "default_rate", "gst_pct", "sac", "sort_order", "is_active"],
      "That rate card head is gone.",
    );
    if ("error" in now) return now;
    return saveRateCardItem(id, undefined, formOf(entry("bw_rate_change"), v, now.row));
  },
  bw_cost_centre_new: (v) =>
    saveCostCentre(null, undefined, formOf(entry("bw_cost_centre_new"), v)),
  bw_cost_centre_change: async (v) => {
    const id = String(v.cost_centre_id);
    const now = await recordNow(
      "birdwing_cost_centres",
      { column: "id", id },
      ["name", "sort_order", "is_active"],
      "That cost centre is gone.",
    );
    if ("error" in now) return now;
    return saveCostCentre(id, undefined, formOf(entry("bw_cost_centre_change"), v, now.row));
  },
};
