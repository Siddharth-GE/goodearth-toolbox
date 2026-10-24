/** Birdwing Stays: stays, room blocks, rooms, charges, invoices and money in, through its own saves. */
import type { Field, Value } from "../catalogue-fields";
import { defineEntries } from "./define";

// Birdwing's fixed lists, restated for Turing (which may not import them); birdwing.test.ts holds them equal.
export const USES = ["guest", "client", "prospect", "team", "architect", "director", "vendor"];
export const CHANNELS = ["direct", "airbnb", "booking", "mmt", "other"];
export const MODES = ["upi", "bank", "cash", "cheque", "ota", "other"];
export const KINDS = ["room", "food", "experience", "addon", "other"];
export const ID_TYPES = ["aadhaar", "passport", "driving_licence", "voter_id", "other"];

/** Mirror of Birdwing's `canMove` (birdwing_stays_guard is the real boundary), so a refusal says what the stay is. */
export const NEXT: Record<string, readonly string[]> = {
  enquiry: ["confirmed", "cancelled"],
  confirmed: ["checked_in", "cancelled"],
  checked_in: ["checked_out", "confirmed"],
  checked_out: ["checked_in"],
  blocked: ["cancelled"],
  cancelled: [],
};

const STATUS_WORDS: Record<string, string> = {
  enquiry: "an enquiry",
  confirmed: "confirmed",
  checked_in: "in the house",
  checked_out: "checked out",
  cancelled: "cancelled",
  blocked: "a room block",
};

/** Why a stay can't move from where it is to `to`, or null when it can. */
export function moveRefused(from: string, to: string): string | null {
  if (NEXT[from]?.includes(to)) return null;
  if (from === to) return `That stay is already ${STATUS_WORDS[from] ?? from}.`;
  if (from === "blocked") return "A room block is only removed (cancelled).";
  if (from === "cancelled") return "A cancelled stay is cancelled for good.";
  return `A stay that is ${STATUS_WORDS[from] ?? from} can't be moved to ${STATUS_WORDS[to] ?? to}.`;
}

/** A stay's room-nights, as the charge form counts them for a room head. */
export const roomNights = (rooms: { from_date: string; to_date: string }[]) =>
  rooms.reduce(
    (sum, room) =>
      sum + Math.round((Date.parse(room.to_date) - Date.parse(room.from_date)) / 864e5),
    0,
  );

/** Rooms as staff name them: "R1, r3" → ["R1", "R3"]. */
export const roomCodes = (value: Value | undefined) => [
  ...new Set(
    String(value ?? "")
      .split(/[\s,]+/)
      .map((code) => code.trim().toUpperCase())
      .filter(Boolean),
  ),
];

const isMonth = (value: Value | undefined) =>
  typeof value === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
const filled = (values: Record<string, Value>, key: string) =>
  typeof values[key] === "string" && values[key] !== "";
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

// Birdwing's checkboxes send the browser's own "on".
const STAYS = { file: "lib/birdwing/actions.ts", ticked: "on" } as const;
const SETTINGS = { file: "lib/birdwing/settings-actions.ts", ticked: "on" } as const;

const stay: Field = {
  key: "stay_id",
  label: "Stay",
  kind: "id",
  table: "birdwing_stays",
  record: true,
};
const centre: Field = {
  key: "cost_centre_id",
  label: "Cost centre",
  kind: "id",
  table: "birdwing_cost_centres",
  optional: true,
};
const date = (key: string, label: string): Field => ({ key, label, kind: "date", optional: true });
const words = (key: string, label: string, max: number): Field => ({
  key,
  label,
  kind: "text",
  optional: true,
  max,
});
const count = (key: string, label: string, start?: string): Field => ({
  key,
  label,
  kind: "whole",
  optional: true,
  ...(start === undefined ? {} : { start }),
});
const reason: Field = { key: "reason", label: "Why", kind: "text", max: 200 };
const month = (key: string, label: string): Field => ({ ...words(key, label, 7), keep: true });
const monthRefused = (values: Record<string, Value>, key: string) =>
  key in values && !isMonth(values[key])
    ? "A month is written 2026-10, the year and the month."
    : undefined;

export const BIRDWING = defineEntries([
  {
    key: "bw_stay_new",
    tool: "/birdwing",
    title: "A stay",
    description:
      "Books a stay at Birdwing. A returning guest is given by guest_id alone (look in birdwing_guests first, by name and phone); otherwise guest_name, with phone, email and city if known, makes a new guest. rooms: the room codes, comma-separated (R1, R3), each free on those nights; left out, no room is named yet (a day visit has none: departure the same day as arrival). use: who it is for — guest (a paying guest, if left out) or one of Goodearth's own (client, prospect, team, architect, director, vendor), which may carry the cost centre that pays for it (an active one from birdwing_cost_centres). channel: how it was booked (direct if left out). status: confirmed if left out, or enquiry. Adults 2, children and pets 0 if left out.",
    adds: true,
    fields: [
      { key: "arrival", label: "Arrival", kind: "date" },
      { key: "departure", label: "Departure", kind: "date" },
      words("rooms", "Rooms", 40),
      { key: "guest_id", label: "Guest", kind: "id", table: "birdwing_guests", optional: true },
      words("guest_name", "New guest", 120),
      words("guest_phone", "Phone", 30),
      words("guest_email", "Email", 120),
      words("guest_city", "City", 80),
      { key: "use", label: "For", kind: "choice", choices: USES, optional: true, start: "guest" },
      centre,
      {
        key: "channel",
        label: "Booked through",
        kind: "choice",
        choices: CHANNELS,
        optional: true,
        start: "direct",
      },
      words("referred_by", "Referred by", 120),
      {
        key: "status",
        label: "Status",
        kind: "choice",
        choices: ["confirmed", "enquiry"],
        optional: true,
        start: "confirmed",
      },
      count("adults", "Adults", "2"),
      count("children", "Children", "0"),
      count("pets", "Pets", "0"),
      words("notes", "Notes", 1000),
    ],
    check: (values) => {
      const newGuest = ["guest_name", "guest_phone", "guest_email", "guest_city"].some((key) =>
        filled(values, key),
      );
      if (filled(values, "guest_id") && newGuest)
        return "A returning guest is given by guest_id alone; their details change with bw_checkin.";
      if (!filled(values, "guest_id") && !filled(values, "guest_name"))
        return "Give the returning guest's guest_id, or the new guest's name.";
      if (filled(values, "guest_email") && !EMAIL.test(String(values.guest_email)))
        return `"${values.guest_email}" is not an email address.`;
      if (filled(values, "cost_centre_id") && values.use === "guest")
        return "A paying guest's stay has no cost centre.";
      return undefined;
    },
  },
  {
    key: "bw_block_new",
    tool: "/birdwing",
    title: "Rooms blocked",
    description:
      "Blocks rooms on the calendar for nights nobody stays (painting, repairs): rooms as codes, comma-separated (R1, R3), from the first night to the day the block ends, and why.",
    adds: true,
    fields: [
      { key: "from", label: "From", kind: "date" },
      { key: "to", label: "Until", kind: "date" },
      { key: "rooms", label: "Rooms", kind: "text", max: 40 },
      { key: "note", label: "Why", kind: "text", max: 200 },
    ],
  },
  {
    key: "bw_stay_change",
    tool: "/birdwing",
    title: "A stay, changed",
    description:
      "Changes a stay's details: dates (its rooms' nights must still fit inside them — move a room with bw_room_remove and bw_room_add first), who it is for, the cost centre (only on a Goodearth stay; an active one, or the one it has), channel, referred by, adults, children, pets, OTA commission and discount in rupees, the month it counts in (accounting_month, written 2026-10) and notes. Not on a cancelled stay or a room block. Each left out stays as it is.",
    form: { ...STAYS, reader: "updateStay" },
    fields: [
      stay,
      { ...date("arrival", "Arrival"), keep: true },
      { ...date("departure", "Departure"), keep: true },
      { key: "use", label: "For", kind: "choice", choices: USES, optional: true, keep: true },
      centre,
      {
        key: "channel",
        label: "Booked through",
        kind: "choice",
        choices: CHANNELS,
        optional: true,
        keep: true,
      },
      words("referred_by", "Referred by", 120),
      count("adults", "Adults"),
      count("children", "Children"),
      count("pets", "Pets"),
      { key: "ota_commission", label: "OTA commission ₹", kind: "amount", optional: true },
      { key: "discount", label: "Discount ₹", kind: "amount", optional: true },
      month("accounting_month", "Counts in"),
      words("notes", "Notes", 1000),
    ],
    check: (values) => monthRefused(values, "accounting_month"),
  },
  {
    key: "bw_stay_move",
    tool: "/birdwing",
    title: "A stay, moved on",
    description:
      "Moves a stay along: enquiry → confirmed → checked_in → checked_out. checked_in back to confirmed undoes a check-in, checked_out back to checked_in undoes a check-out. An enquiry or confirmed stay is cancelled with the reason, for good, and its rooms are freed; a room block is removed the same way (cancelled).",
    fields: [
      stay,
      {
        key: "to",
        label: "Move to",
        kind: "choice",
        choices: ["confirmed", "checked_in", "checked_out", "cancelled"],
        labels: { checked_in: "in the house", checked_out: "checked out" },
      },
      { ...reason, optional: true },
    ],
    check: (values) => {
      if (values.to === "cancelled" && !filled(values, "reason")) return "Say why it is cancelled.";
      if (values.to !== "cancelled" && filled(values, "reason"))
        return "A reason goes only with a cancellation.";
      return undefined;
    },
  },
  {
    key: "bw_checkin",
    tool: "/birdwing",
    form: { ...STAYS, reader: "saveCheckinDetails" },
    title: "Check-in details",
    description:
      "The guest's details at check-in: their name, phone, email and city; the kind of ID and only its last four letters or digits (never the whole number); everyone staying (guest_names), food preferences, allergies and requirements; and id_verified, true once the ID has been seen. Not on a cancelled stay or a room block. Each left out stays as it is.",
    fields: [
      stay,
      { ...words("guest_name", "Guest", 120), keep: true },
      words("phone", "Phone", 30),
      words("email", "Email", 120),
      words("city", "City", 80),
      { key: "id_type", label: "ID", kind: "choice", choices: ID_TYPES, optional: true },
      words("id_last4", "ID last four", 4),
      words("guest_names", "Everyone staying", 1000),
      words("food_preferences", "Food", 1000),
      words("allergies", "Allergies", 1000),
      words("requirements", "Requirements", 1000),
      { key: "id_verified", label: "ID seen", kind: "yesno", optional: true },
    ],
    check: (values) => {
      if (filled(values, "id_last4") && !/^[A-Za-z0-9]{1,4}$/.test(String(values.id_last4)))
        return "Keep only the last four letters or digits of the ID — never the whole number.";
      if (filled(values, "email") && !EMAIL.test(String(values.email)))
        return `"${values.email}" is not an email address.`;
      return undefined;
    },
  },
  {
    key: "bw_room_add",
    tool: "/birdwing",
    title: "A room on a stay",
    description:
      "Puts a room (its code, R1) on a stay or room block, for the stay's nights or some of them (from the first night to the day they leave that room; the stay's own dates if left out), with extra beds (0 if left out). The room must be free those nights. Not on a cancelled or checked-out stay.",
    adds: true,
    fields: [
      stay,
      { key: "room", label: "Room", kind: "text", max: 12 },
      date("from", "From"),
      date("to", "Until"),
      count("extra_beds", "Extra beds", "0"),
    ],
  },
  {
    key: "bw_room_remove",
    tool: "/birdwing",
    title: "A room taken off a stay",
    description:
      "Takes a room off a stay or block (birdwing_stay_rooms.id, one not released), freeing its nights. Not on a cancelled or checked-out stay.",
    fields: [
      {
        key: "stay_room_id",
        label: "Room",
        kind: "id",
        table: "birdwing_stay_rooms",
        record: true,
      },
    ],
  },
  {
    key: "bw_charge_add",
    tool: "/birdwing",
    form: { ...STAYS, reader: "addCharge" },
    title: "A charge on a stay",
    description:
      "Adds a charge to a stay. From the rate card (rate_card_id, an active head of birdwing_rate_card): it takes the head's name, kind, GST and SAC; the rate is the card's own if left out, and the quantity the stay's room-nights for a room head (1 for anything else). Something not on the card: head (its name), rate, kind (other if left out), gst_pct (0 if left out) and SAC. Rates are before GST unless rate_includes_gst is true (an OTA's payout). Not once the stay's invoice is issued.",
    adds: true,
    fields: [
      stay,
      {
        key: "rate_card_id",
        label: "From the rate card",
        kind: "id",
        table: "birdwing_rate_card",
        optional: true,
      },
      words("head", "Charge", 80),
      { key: "kind", label: "Kind", kind: "choice", choices: KINDS, optional: true },
      { key: "gst_pct", label: "GST %", kind: "amount", optional: true },
      words("sac", "SAC", 12),
      { key: "qty", label: "Quantity", kind: "amount", optional: true },
      { key: "rate", label: "Rate ₹", kind: "amount", optional: true },
      {
        key: "rate_includes_gst",
        label: "Rate includes GST",
        kind: "yesno",
        optional: true,
        start: false,
      },
      words("description", "Description", 160),
    ],
    check: (values) => {
      const own = ["head", "kind", "gst_pct", "sac"].filter((key) => filled(values, key));
      if (filled(values, "rate_card_id") && own.length > 0)
        return "A rate card charge takes its name, kind, GST and SAC from the card; leave those out.";
      if (!filled(values, "rate_card_id")) {
        if (!filled(values, "head")) return "Pick a head from the rate card, or name the charge.";
        if (!filled(values, "rate")) return "Give the rate of a charge not on the rate card.";
      }
      return undefined;
    },
  },
  {
    key: "bw_charge_delete",
    tool: "/birdwing",
    title: "A charge, removed",
    description:
      "Removes a charge from a stay (birdwing_stay_charges.id). Not once the stay's invoice is issued.",
    fields: [
      {
        key: "charge_id",
        label: "Charge",
        kind: "id",
        table: "birdwing_stay_charges",
        record: true,
      },
    ],
  },
  {
    key: "bw_invoice_issue",
    tool: "/birdwing",
    form: { ...STAYS, reader: "issueInvoice" },
    title: "An invoice, issued",
    description:
      "Issues a stay's invoice from its charges: the next MEF/GH number, the charges frozen from then on. Made out to bill_to_name (the guest's name if left out), with a GSTIN (15 letters and digits) and address if the guest wants them on it.",
    fields: [
      stay,
      words("bill_to_name", "Made out to", 160),
      words("bill_to_gstin", "GSTIN", 15),
      words("bill_to_address", "Address", 400),
    ],
    check: (values) =>
      filled(values, "bill_to_gstin") && !/^[0-9A-Z]{15}$/i.test(String(values.bill_to_gstin))
        ? "A GSTIN is 15 letters and digits — check it, or leave it out."
        : undefined,
  },
  {
    key: "bw_invoice_cancel",
    tool: "/birdwing",
    title: "An invoice, cancelled",
    description:
      "Cancels a stay's issued invoice (birdwing_invoices.id, not one from the old sheet), with the reason: it stays on record, its number is never used again, and the charges open up to be corrected and issued again.",
    fields: [
      {
        key: "invoice_id",
        label: "Invoice",
        kind: "id",
        table: "birdwing_invoices",
        record: true,
      },
      reason,
    ],
  },
  {
    key: "bw_receipt",
    tool: "/birdwing",
    form: { ...STAYS, reader: "addReceipt" },
    title: "Money received for a stay",
    description:
      "Records money a guest paid for a stay: the amount, the day it came (today if left out, never later), how (upi if left out; bank, cash, cheque, ota for an OTA's payout, other), the reference and a note. A receipt is never changed; a wrong one is cancelled.",
    adds: true,
    fields: [
      stay,
      { key: "amount", label: "Amount ₹", kind: "amount" },
      date("received_on", "Received on"),
      { key: "mode", label: "How", kind: "choice", choices: MODES, optional: true, start: "upi" },
      words("reference", "Reference", 80),
      words("note", "Note", 200),
    ],
  },
  {
    key: "bw_receipt_cancel",
    tool: "/birdwing",
    title: "A receipt, cancelled",
    description:
      "Cancels a stay's receipt entered by mistake (birdwing_receipts.id), with the reason; it stays listed, struck through, and counts in no total.",
    fields: [
      {
        key: "receipt_id",
        label: "Receipt",
        kind: "id",
        table: "birdwing_receipts",
        record: true,
      },
      reason,
    ],
  },
  {
    key: "bw_settle",
    tool: "/birdwing",
    form: { ...STAYS, reader: "addSettlement" },
    title: "A stay's balance, closed",
    description:
      "Closes what is pending on a stay: a cross_charge to the cost centre that carries a Goodearth stay (the stay's own if left out; an active one), or a write_off with the reason, for a balance that will never be paid. Left out, a Goodearth stay is cross-charged and a guest's written off. The amount is what is pending if left out, never more; the month it counts in (written 2026-10) is the stay's own if left out.",
    adds: true,
    fields: [
      stay,
      {
        key: "kind",
        label: "How",
        kind: "choice",
        choices: ["cross_charge", "write_off"],
        labels: { cross_charge: "charge to a cost centre", write_off: "write off" },
        optional: true,
      },
      centre,
      { key: "amount", label: "Amount ₹", kind: "amount", optional: true },
      words("month", "Counts in", 7),
      words("note", "Note", 200),
    ],
    check: (values) => monthRefused(values, "month"),
  },
  {
    key: "bw_settle_cancel",
    tool: "/birdwing",
    title: "A cross-charge or write-off, cancelled",
    description:
      "Cancels a stay's cross-charge or write-off (birdwing_cross_charges.id), with the reason; the amount goes back to pending and it stays listed, struck through.",
    fields: [
      {
        key: "settlement_id",
        label: "Cross-charge or write-off",
        kind: "id",
        table: "birdwing_cross_charges",
        record: true,
      },
      reason,
    ],
  },
  {
    key: "bw_reviewed",
    tool: "/birdwing",
    title: "An imported stay, reviewed",
    description:
      "Marks a stay brought in from the old sheet as reviewed, as Birdwing → Review does, once its figures have been checked.",
    fields: [stay],
  },
  {
    key: "bw_rate_new",
    tool: "/birdwing",
    title: "A rate card head",
    description:
      "Adds a head to Birdwing's rate card (an admin's, in Birdwing → Settings): its name, kind (food if left out), rate before GST, GST % (5 if left out), SAC, order on the list (200 if left out) and whether it is switched on (true if left out). A new rate never changes a charge already made.",
    adds: true,
    form: { ...SETTINGS, reader: "saveRateCardItem" },
    fields: [
      { key: "head", label: "Charge", kind: "text", max: 80 },
      { key: "kind", label: "Kind", kind: "choice", choices: KINDS, optional: true, start: "food" },
      { key: "default_rate", label: "Rate ₹", kind: "amount", optional: true },
      { key: "gst_pct", label: "GST %", kind: "amount", optional: true, start: "5" },
      words("sac", "SAC", 12),
      count("sort_order", "Order", "200"),
      { key: "is_active", label: "Switched on", kind: "yesno", optional: true, start: true },
    ],
  },
  {
    key: "bw_rate_change",
    tool: "/birdwing",
    title: "A rate card head, changed",
    description:
      "Changes a rate card head (birdwing_rate_card.id): its name, kind, rate before GST, GST %, SAC, order, or switches it on or off (is_active). A new rate never changes a charge already made. Each left out stays as it is.",
    form: { ...SETTINGS, reader: "saveRateCardItem" },
    fields: [
      {
        key: "rate_card_id",
        label: "Head",
        kind: "id",
        table: "birdwing_rate_card",
        record: true,
      },
      { key: "head", label: "Charge", kind: "text", optional: true, keep: true, max: 80 },
      { key: "kind", label: "Kind", kind: "choice", choices: KINDS, optional: true, keep: true },
      { key: "default_rate", label: "Rate ₹", kind: "amount", optional: true },
      { key: "gst_pct", label: "GST %", kind: "amount", optional: true },
      words("sac", "SAC", 12),
      count("sort_order", "Order"),
      { key: "is_active", label: "Switched on", kind: "yesno", optional: true },
    ],
  },
  {
    key: "bw_cost_centre_new",
    tool: "/birdwing",
    title: "A cost centre",
    description:
      "Adds a cost centre that carries Goodearth's own stays (an admin's, in Birdwing → Settings): its name, order on the list (100 if left out) and whether it is in use (true if left out).",
    adds: true,
    form: { ...SETTINGS, reader: "saveCostCentre" },
    fields: [
      { key: "name", label: "Name", kind: "text", max: 60 },
      count("sort_order", "Order", "100"),
      { key: "is_active", label: "In use", kind: "yesno", optional: true, start: true },
    ],
  },
  {
    key: "bw_cost_centre_change",
    tool: "/birdwing",
    title: "A cost centre, changed",
    description:
      "Renames a cost centre (birdwing_cost_centres.id), moves it on the list, or takes it out of use (is_active false) or back. Each left out stays as it is.",
    form: { ...SETTINGS, reader: "saveCostCentre" },
    fields: [
      {
        key: "cost_centre_id",
        label: "Cost centre",
        kind: "id",
        table: "birdwing_cost_centres",
        record: true,
      },
      { key: "name", label: "Name", kind: "text", optional: true, keep: true, max: 60 },
      count("sort_order", "Order"),
      { key: "is_active", label: "In use", kind: "yesno", optional: true },
    ],
  },
]);
