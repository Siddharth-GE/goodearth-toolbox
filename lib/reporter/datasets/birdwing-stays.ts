// ---------------------------------------------------------------------
// birdwing_stays — the guest house, stay by stay (0117)
// ---------------------------------------------------------------------
// One row per stay at Birdwing Farmstay, from 0117's flat owner view:
// no embeds, a guest's NAME and never a phone, email or ID. Money is
// worked out as Stays works it — billed is the charges less the OTA's
// commission and the discount; pending is billed less what was collected,
// charged to a Goodearth cost centre, or written off. A stay is one row,
// so a sum never fans out.

import type { DatasetDef } from "./types";

const BIRDWING_STAYS_SELECT =
  "stay_id, ref, month, guest_name, use, segment, channel, status, cost_centre, arrival, departure, " +
  "nights, room_nights, room_nights_estimated, guests, room_revenue, charged, ota_commission, " +
  "discount, billed, collected, cross_charged, written_off, pending, invoice_number, imported";

const BIRDWING_STAYS_OPTIONS_SELECT = "guest_name, use, segment, channel, status, cost_centre";

const money = (label: string, path: string) => ({
  label,
  type: "money" as const,
  path,
  filterColumn: path,
  sortColumn: path,
  groupable: false,
  aggregates: ["sum" as const, "avg" as const, "min" as const, "max" as const],
});

const category = (label: string, path: string) => ({
  label,
  type: "text" as const,
  path,
  filterColumn: path,
  sortColumn: path,
  groupable: true,
  aggregates: [],
  filterOptions: "distinct" as const,
});

export const birdwingStays: DatasetDef = {
  label: "Birdwing stays",
  description: "One row per stay at Birdwing Farmstay: who it was for, the nights, and its money.",
  source: "birdwing_stay_facts",
  select: BIRDWING_STAYS_SELECT,
  optionsSelect: BIRDWING_STAYS_OPTIONS_SELECT,
  projectField: null,
  pageOrder: ["stay_id"],
  dateFields: ["arrival", "month"],
  money: true,
  defaultColumns: ["ref", "guest", "use", "arrival", "nights", "billed", "collected", "pending"], // prettier-ignore
  defaultSort: [{ field: "arrival", dir: "desc" }],
  fields: {
    ref: {
      label: "Stay",
      type: "text",
      path: "ref",
      identityPath: "stay_id",
      sortColumn: "ref",
      groupable: false,
      aggregates: ["count_distinct"],
    },
    guest: {
      label: "Guest",
      type: "text",
      path: "guest_name",
      filterColumn: "guest_name",
      sortColumn: "guest_name",
      groupable: true,
      aggregates: [],
      filterOptions: "distinct",
    },
    month: {
      label: "Counted in",
      type: "date",
      path: "month",
      filterColumn: "month",
      sortColumn: "month",
      groupable: true,
      aggregates: [],
    },
    use: category("Who for", "use"),
    segment: category("Paying or Goodearth", "segment"),
    channel: category("Booked through", "channel"),
    status: category("Status", "status"),
    cost_centre: category("Cost centre", "cost_centre"),
    arrival: {
      label: "Arrival",
      type: "date",
      path: "arrival",
      filterColumn: "arrival",
      sortColumn: "arrival",
      groupable: false,
      aggregates: [],
    },
    departure: {
      label: "Departure",
      type: "date",
      path: "departure",
      filterColumn: "departure",
      sortColumn: "departure",
      groupable: false,
      aggregates: [],
    },
    nights: {
      label: "Nights",
      type: "number",
      path: "nights",
      filterColumn: "nights",
      sortColumn: "nights",
      groupable: false,
      aggregates: ["sum", "avg", "min", "max"],
    },
    room_nights: {
      label: "Room-nights",
      type: "number",
      path: "room_nights",
      filterColumn: "room_nights",
      sortColumn: "room_nights",
      groupable: false,
      aggregates: ["sum", "avg"],
    },
    // The old sheet counted rooms and never named them: its room-nights
    // are room count × nights, and this says which rows those are.
    room_nights_estimated: {
      label: "Room-nights estimated",
      type: "bool",
      path: "room_nights_estimated",
      filterColumn: "room_nights_estimated",
      groupable: true,
      aggregates: [],
    },
    guests: {
      label: "Guests",
      type: "number",
      path: "guests",
      filterColumn: "guests",
      sortColumn: "guests",
      groupable: false,
      aggregates: ["sum", "avg", "max"],
    },
    room_revenue: money("Room revenue", "room_revenue"),
    charged: money("Charged", "charged"),
    ota_commission: money("OTA commission", "ota_commission"),
    discount: money("Discount", "discount"),
    billed: money("Billed", "billed"),
    collected: money("Collected", "collected"),
    cross_charged: money("Charged to Goodearth", "cross_charged"),
    written_off: money("Written off", "written_off"),
    pending: money("Pending", "pending"),
    invoice: {
      label: "Invoice",
      type: "text",
      path: "invoice_number",
      sortColumn: "invoice_number",
      groupable: false,
      aggregates: [],
    },
    imported: {
      label: "From the old sheet",
      type: "bool",
      path: "imported",
      filterColumn: "imported",
      groupable: true,
      aggregates: [],
    },
  },
};
