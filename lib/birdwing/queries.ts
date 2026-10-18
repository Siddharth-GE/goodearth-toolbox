import "server-only";

import { requireTool } from "@/lib/auth/access";
import { todayInIndia } from "@/lib/format";
import { profileNames } from "@/lib/masters/names";
import { fetchAll } from "@/lib/supabase/fetch-all";
import { readFailed } from "@/lib/supabase/read-failed";
import { createClient } from "@/lib/supabase/server";
import type { UnplacedStay } from "./calendar";
import { printDraft, printFromSnapshot, type InvoicePrint } from "./invoice";
import { isSettled, nightsBetween, stayMoney, type StayMoney } from "./money";
import {
  CHANNELS,
  CHARGE_KINDS,
  FILE_KINDS,
  GRANT,
  ID_TYPES,
  isInternalUse,
  oneOf,
  RECEIPT_MODES,
  SETTLEMENT_KINDS,
  STAY_STATUSES,
  STAY_USES,
  type Channel,
  type ChargeKind,
  type FileKind,
  type IdType,
  type ReceiptMode,
  type SettlementKind,
  type StayStatus,
  type StayUse,
} from "./shared";

// Every read opens with requireTool(GRANT): the 0115 policies gate SELECT, so an ungranted person would see an empty list, not be turned away.
// birdwing_stays has three FKs to profiles, so names merge through a Map (BUGCATCHER #2). Money is summed here, never stored (money.ts).

const fail = (context: string, error: { message: string }): never =>
  readFailed("birdwing", context, error);

type Client = Awaited<ReturnType<typeof createClient>>;

export type RoomRow = {
  id: string;
  code: string;
  name: string;
  maxGuests: number | null;
  sortOrder: number;
  isActive: boolean;
};

export async function listRooms(): Promise<RoomRow[]> {
  await requireTool(GRANT);
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("birdwing_rooms")
    .select("id, code, name, max_guests, sort_order, is_active")
    .order("sort_order")
    .order("code");
  if (error) fail("the rooms", error);
  return (data ?? []).map((room) => ({
    id: room.id,
    code: room.code,
    name: room.name,
    maxGuests: room.max_guests,
    sortOrder: room.sort_order,
    isActive: room.is_active,
  }));
}

export type RateCardRow = {
  id: string;
  head: string;
  kind: ChargeKind;
  defaultRate: number;
  gstPct: number;
  sac: string | null;
  sortOrder: number;
  isActive: boolean;
};

export async function listRateCard(): Promise<RateCardRow[]> {
  await requireTool(GRANT);
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("birdwing_rate_card")
    .select("id, head, kind, default_rate, gst_pct, sac, sort_order, is_active")
    .order("sort_order")
    .order("head");
  if (error) fail("the rate card", error);
  return (data ?? []).map((row) => ({
    id: row.id,
    head: row.head,
    kind: oneOf(CHARGE_KINDS, row.kind) ?? "other",
    defaultRate: Number(row.default_rate),
    gstPct: Number(row.gst_pct),
    sac: row.sac,
    sortOrder: row.sort_order,
    isActive: row.is_active,
  }));
}

export type CostCentreRow = { id: string; name: string; sortOrder: number; isActive: boolean };

export async function listCostCentres(): Promise<CostCentreRow[]> {
  await requireTool(GRANT);
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("birdwing_cost_centres")
    .select("id, name, sort_order, is_active")
    .order("sort_order")
    .order("name");
  if (error) fail("the cost centres", error);
  return (data ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    sortOrder: row.sort_order,
    isActive: row.is_active,
  }));
}

export type InvoiceCompany = {
  id: string;
  name: string;
  legal_name: string | null;
  address: string | null;
  gstin: string | null;
  state: string;
  phone: string | null;
  email: string | null;
};

export type BirdwingSettings = {
  companyId: string | null;
  company: InvoiceCompany | null;
  placeOfSupply: string | null;
  bankDetails: string | null;
  upiId: string | null;
  invoiceTerms: string | null;
  checkinTime: string | null;
  checkoutTime: string | null;
};

export async function getSettings(): Promise<BirdwingSettings> {
  await requireTool(GRANT);
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("birdwing_settings")
    .select(
      "company_id, place_of_supply, bank_details, upi_id, invoice_terms, checkin_time, checkout_time",
    )
    .maybeSingle();
  if (error) fail("the Birdwing settings", error);

  let company: InvoiceCompany | null = null;
  if (data?.company_id) {
    const { data: row, error: companyError } = await supabase
      .from("companies")
      .select("id, name, legal_name, address, gstin, state, phone, email")
      .eq("id", data.company_id)
      .maybeSingle();
    if (companyError) fail("the invoicing company", companyError);
    company = row ?? null;
  }

  return {
    companyId: data?.company_id ?? null,
    company,
    placeOfSupply: data?.place_of_supply ?? null,
    bankDetails: data?.bank_details ?? null,
    upiId: data?.upi_id ?? null,
    invoiceTerms: data?.invoice_terms ?? null,
    checkinTime: data?.checkin_time ?? null,
    checkoutTime: data?.checkout_time ?? null,
  };
}

export async function listCompanyOptions(): Promise<{ id: string; name: string }[]> {
  await requireTool(GRANT);
  const supabase = await createClient();
  const data = await fetchAll((from, to) =>
    supabase
      .from("companies")
      .select("id, name, is_active")
      .order("name")
      .order("id")
      .range(from, to),
  );
  return data.filter((company) => company.is_active).map(({ id, name }) => ({ id, name }));
}

export type GuestOption = { id: string; name: string; phone: string | null; city: string | null };

export async function listGuestOptions(): Promise<GuestOption[]> {
  await requireTool(GRANT);
  const supabase = await createClient();
  const data = await fetchAll((from, to) =>
    supabase
      .from("birdwing_guests")
      .select("id, name, phone, city")
      .order("name")
      .order("id")
      .range(from, to),
  );
  return data;
}

type MoneyParts = {
  charges: Map<string, number[]>;
  receipts: Map<string, number[]>;
  settlements: Map<string, number[]>;
  issued: Map<string, string>;
};

/** A short id list is filtered by id; a long one reads the tables whole (a URL of a thousand ids is too long). */
async function moneyParts(supabase: Client, stayIds: string[]): Promise<MoneyParts> {
  const parts: MoneyParts = {
    charges: new Map(),
    receipts: new Map(),
    settlements: new Map(),
    issued: new Map(),
  };
  if (stayIds.length === 0) return parts;
  const byId = stayIds.length <= 100;
  const wanted = new Set(stayIds);

  const [charges, receipts, settlements, invoices] = await Promise.all([
    fetchAll((from, to) => {
      const query = supabase.from("birdwing_stay_charges").select("id, stay_id, amount");
      return (byId ? query.in("stay_id", stayIds) : query).order("id").range(from, to);
    }),
    fetchAll((from, to) => {
      const query = supabase.from("birdwing_receipts").select("id, stay_id, amount");
      return (byId ? query.in("stay_id", stayIds) : query).order("id").range(from, to);
    }),
    fetchAll((from, to) => {
      const query = supabase.from("birdwing_cross_charges").select("id, stay_id, amount");
      return (byId ? query.in("stay_id", stayIds) : query).order("id").range(from, to);
    }),
    fetchAll((from, to) => {
      const query = supabase
        .from("birdwing_invoices")
        .select("id, stay_id, number")
        .eq("status", "issued");
      return (byId ? query.in("stay_id", stayIds) : query).order("id").range(from, to);
    }),
  ]);

  const push = (map: Map<string, number[]>, stayId: string, amount: number) => {
    if (!wanted.has(stayId)) return;
    const list = map.get(stayId) ?? [];
    list.push(amount);
    map.set(stayId, list);
  };
  for (const row of charges) push(parts.charges, row.stay_id, Number(row.amount));
  for (const row of receipts) push(parts.receipts, row.stay_id, Number(row.amount));
  for (const row of settlements) push(parts.settlements, row.stay_id, Number(row.amount));
  for (const row of invoices)
    if (wanted.has(row.stay_id)) parts.issued.set(row.stay_id, row.number);
  return parts;
}

function moneyOf(
  parts: MoneyParts,
  stay: { id: string; ota_commission: number | string; discount: number | string },
): StayMoney {
  return stayMoney({
    chargeAmounts: parts.charges.get(stay.id) ?? [],
    otaCommission: Number(stay.ota_commission),
    discount: Number(stay.discount),
    receipts: parts.receipts.get(stay.id) ?? [],
    settlements: parts.settlements.get(stay.id) ?? [],
  });
}

export async function getWelcomeCounts(): Promise<{
  arrivingToday: number;
  leavingToday: number;
  inHouse: number;
  enquiries: number;
  toInvoice: number;
  toReview: number;
}> {
  await requireTool(GRANT);
  const supabase = await createClient();
  const today = todayInIndia();
  const head = { count: "exact" as const, head: true };

  const [arriving, leaving, inHouse, enquiries, toReview, checkedOut] = await Promise.all([
    supabase
      .from("birdwing_stays")
      .select("id", head)
      .eq("status", "confirmed")
      .eq("arrival", today),
    supabase
      .from("birdwing_stays")
      .select("id", head)
      .eq("status", "checked_in")
      .lte("departure", today),
    supabase.from("birdwing_stays").select("id", head).eq("status", "checked_in"),
    supabase
      .from("birdwing_stays")
      .select("id", head)
      .eq("status", "enquiry")
      .gte("departure", today),
    supabase
      .from("birdwing_stays")
      .select("id", head)
      .filter("review_flags", "neq", "{}")
      .is("reviewed_at", null),
    // Stays made in this tool that have ended with no invoice issued.
    fetchAll((from, to) =>
      supabase
        .from("birdwing_stays")
        .select("id")
        .eq("status", "checked_out")
        .eq("use", "guest")
        .is("source_key", null)
        .order("id")
        .range(from, to),
    ),
  ]);
  for (const result of [arriving, leaving, inHouse, enquiries, toReview]) {
    if (result.error) fail("the welcome counts", result.error);
  }

  // A hundred ids to a request keeps each URL short; every one is checked.
  const ids = checkedOut.map((stay) => stay.id);
  const invoiced = new Set<string>();
  for (let index = 0; index < ids.length; index += 100) {
    const chunk = ids.slice(index, index + 100);
    const issued = await fetchAll((from, to) =>
      supabase
        .from("birdwing_invoices")
        .select("id, stay_id")
        .eq("status", "issued")
        .in("stay_id", chunk)
        .order("id")
        .range(from, to),
    );
    for (const invoice of issued) invoiced.add(invoice.stay_id);
  }
  const toInvoice = ids.filter((id) => !invoiced.has(id)).length;

  return {
    arrivingToday: arriving.count ?? 0,
    leavingToday: leaving.count ?? 0,
    inHouse: inHouse.count ?? 0,
    enquiries: enquiries.count ?? 0,
    toInvoice,
    toReview: toReview.count ?? 0,
  };
}

export const STAY_TABS = ["upcoming", "in-house", "past", "cancelled"] as const;
export type StayTab = (typeof STAY_TABS)[number];

export type StayListRow = {
  id: string;
  ref: string;
  isBlock: boolean;
  guestName: string | null;
  use: StayUse | null;
  channel: Channel;
  status: StayStatus;
  arrival: string;
  departure: string;
  nights: number;
  guests: number;
  roomCodes: string[];
  costCentreName: string | null;
  invoiceNumber: string | null;
  money: StayMoney;
  flagged: boolean;
};

export type StayFilters = {
  tab: StayTab;
  use?: StayUse;
  channel?: Channel;
  month?: string;
  q?: string;
  page: number;
};

export const STAYS_PAGE_SIZE = 50;

export async function listStays(
  filters: StayFilters,
): Promise<{ rows: StayListRow[]; total: number }> {
  await requireTool(GRANT);
  const supabase = await createClient();
  const today = todayInIndia();

  let guestIds: string[] | null = null;
  if (filters.q) {
    const guests = await fetchAll((from, to) =>
      supabase
        .from("birdwing_guests")
        .select("id")
        .or(`name.ilike.%${filters.q}%,phone.ilike.%${filters.q}%`)
        .order("id")
        .range(from, to),
    );
    guestIds = guests.slice(0, 200).map((guest) => guest.id);
  }

  let query = supabase
    .from("birdwing_stays")
    .select(
      "id, ref, is_block, guest_id, use, channel, status, arrival, departure, adults, children, cost_centre_id, ota_commission, discount, review_flags, reviewed_at",
      { count: "exact" },
    );

  if (filters.tab === "upcoming") {
    query = query.in("status", ["enquiry", "confirmed", "blocked"]).gte("departure", today);
  } else if (filters.tab === "in-house") {
    query = query.eq("status", "checked_in");
  } else if (filters.tab === "past") {
    query = query.or(
      `status.eq.checked_out,and(status.in.(enquiry,confirmed,blocked),departure.lt.${today})`,
    );
  } else {
    query = query.eq("status", "cancelled");
  }
  if (filters.use) query = query.eq("use", filters.use);
  if (filters.channel) query = query.eq("channel", filters.channel);
  if (filters.month) query = query.eq("accounting_month", `${filters.month}-01`);
  if (filters.q) {
    const ids = guestIds && guestIds.length > 0 ? `,guest_id.in.(${guestIds.join(",")})` : "";
    query = query.or(`ref.ilike.%${filters.q}%${ids}`);
  }

  const ascending = filters.tab === "upcoming" || filters.tab === "in-house";
  const start = (filters.page - 1) * STAYS_PAGE_SIZE;
  const { data, error, count } = await query
    .order(filters.tab === "in-house" ? "departure" : "arrival", { ascending })
    .order("ref", { ascending })
    .range(start, start + STAYS_PAGE_SIZE - 1);
  if (error) fail("the stays", error);
  const stays = data ?? [];

  const rows = await decorateStays(supabase, stays);
  return { rows, total: count ?? 0 };
}

type StayCore = {
  id: string;
  ref: string;
  is_block: boolean;
  guest_id: string | null;
  use: string | null;
  channel: string;
  status: string;
  arrival: string;
  departure: string;
  adults: number;
  children: number;
  cost_centre_id: string | null;
  ota_commission: number | string;
  discount: number | string;
  review_flags: string[];
  reviewed_at: string | null;
};

async function decorateStays(supabase: Client, stays: StayCore[]): Promise<StayListRow[]> {
  if (stays.length === 0) return [];
  const ids = stays.map((stay) => stay.id);
  const guestIds = [...new Set(stays.map((stay) => stay.guest_id).filter((id) => id !== null))];

  const [parts, guests, rooms, centres] = await Promise.all([
    moneyParts(supabase, ids),
    guestIds.length
      ? fetchAll((from, to) =>
          supabase
            .from("birdwing_guests")
            .select("id, name")
            .in("id", guestIds)
            .order("id")
            .range(from, to),
        )
      : Promise.resolve([] as { id: string; name: string }[]),
    fetchAll((from, to) =>
      supabase
        .from("birdwing_stay_rooms")
        .select("id, stay_id, released_at, birdwing_rooms(code)")
        .in("stay_id", ids)
        .order("id")
        .range(from, to),
    ),
    supabase.from("birdwing_cost_centres").select("id, name"),
  ]);
  if (centres.error) fail("the cost centres", centres.error);

  const guestName = new Map(guests.map((guest) => [guest.id, guest.name]));
  const centreName = new Map((centres.data ?? []).map((centre) => [centre.id, centre.name]));
  const roomCodes = new Map<string, string[]>();
  for (const room of rooms) {
    const stayStatus = stays.find((stay) => stay.id === room.stay_id)?.status;
    // A cancelled stay's released rooms still say what it held.
    if (room.released_at && stayStatus !== "cancelled") continue;
    const code = room.birdwing_rooms?.code;
    if (!code) continue;
    const list = roomCodes.get(room.stay_id) ?? [];
    if (!list.includes(code)) list.push(code);
    roomCodes.set(room.stay_id, list);
  }

  return stays.map((stay) => ({
    id: stay.id,
    ref: stay.ref,
    isBlock: stay.is_block,
    guestName: stay.guest_id ? (guestName.get(stay.guest_id) ?? null) : null,
    use: oneOf(STAY_USES, stay.use),
    channel: oneOf(CHANNELS, stay.channel) ?? "other",
    status: oneOf(STAY_STATUSES, stay.status) ?? "confirmed",
    arrival: stay.arrival,
    departure: stay.departure,
    nights: nightsBetween(stay.arrival, stay.departure),
    guests: stay.adults + stay.children,
    roomCodes: (roomCodes.get(stay.id) ?? []).sort(),
    costCentreName: stay.cost_centre_id ? (centreName.get(stay.cost_centre_id) ?? null) : null,
    invoiceNumber: parts.issued.get(stay.id) ?? null,
    money: moneyOf(parts, stay),
    flagged: stay.review_flags.length > 0 && stay.reviewed_at === null,
  }));
}

export type StayGuest = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  city: string | null;
  idType: IdType | null;
  idLast4: string | null;
  notes: string | null;
};

export type StayRoomLine = {
  id: string;
  roomId: string;
  roomCode: string;
  roomName: string;
  from: string;
  to: string;
  nights: number;
  extraBeds: number;
  released: boolean;
};

export type StayCharge = {
  id: string;
  rateCardId: string | null;
  head: string;
  kind: ChargeKind;
  description: string | null;
  qty: number;
  rate: number;
  gstPct: number;
  rateIncludesGst: boolean;
  sac: string | null;
  amount: number;
  sortOrder: number;
};

export type StayInvoice = {
  id: string;
  number: string;
  historic: boolean;
  status: "issued" | "cancelled";
  issuedOn: string;
  billToName: string;
  total: number;
  payable: number;
  cancelReason: string | null;
  issuedByName: string | null;
};

export type StayReceipt = {
  id: string;
  amount: number;
  receivedOn: string;
  mode: ReceiptMode;
  reference: string | null;
  note: string | null;
  invoiceNumber: string | null;
  byName: string | null;
  imported: boolean;
};

export type StaySettlement = {
  id: string;
  kind: SettlementKind;
  costCentreName: string | null;
  amount: number;
  month: string;
  note: string | null;
  byName: string | null;
};

export type StayFile = {
  id: string;
  kind: FileKind;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  createdAt: string;
  byName: string | null;
};

export type StayDetail = {
  id: string;
  ref: string;
  isBlock: boolean;
  guest: StayGuest | null;
  use: StayUse | null;
  internal: boolean;
  channel: Channel;
  costCentreId: string | null;
  costCentreName: string | null;
  referredBy: string | null;
  status: StayStatus;
  arrival: string;
  departure: string;
  nights: number;
  adults: number;
  children: number;
  pets: number;
  accountingMonth: string;
  otaCommission: number;
  discount: number;
  notes: string | null;
  guestNames: string | null;
  foodPreferences: string | null;
  allergies: string | null;
  requirements: string | null;
  idVerified: boolean;
  checkinAt: string | null;
  checkoutAt: string | null;
  cancelledAt: string | null;
  cancelReason: string | null;
  legacyRoomCount: number | null;
  reviewFlags: string[];
  reviewedAt: string | null;
  imported: boolean;
  createdAt: string;
  createdByName: string | null;
  rooms: StayRoomLine[];
  charges: StayCharge[];
  invoices: StayInvoice[];
  issuedInvoice: StayInvoice | null;
  receipts: StayReceipt[];
  settlements: StaySettlement[];
  files: StayFile[];
  money: StayMoney;
  settled: boolean;
};

export async function getStay(stayId: string): Promise<StayDetail | null> {
  await requireTool(GRANT);
  const supabase = await createClient();

  const { data: stay, error } = await supabase
    .from("birdwing_stays")
    .select("*")
    .eq("id", stayId)
    .maybeSingle();
  if (error) fail("the stay", error);
  if (!stay) return null;

  const [guest, centre, rooms, charges, invoices, receipts, settlements, files] = await Promise.all(
    [
      stay.guest_id
        ? supabase.from("birdwing_guests").select("*").eq("id", stay.guest_id).maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      stay.cost_centre_id
        ? supabase
            .from("birdwing_cost_centres")
            .select("name")
            .eq("id", stay.cost_centre_id)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      supabase
        .from("birdwing_stay_rooms")
        .select(
          "id, room_id, from_date, to_date, extra_beds, released_at, birdwing_rooms(code, name)",
        )
        .eq("stay_id", stayId)
        .order("from_date")
        .order("id"),
      supabase
        .from("birdwing_stay_charges")
        .select(
          "id, rate_card_id, head, kind, description, qty, rate, gst_pct, rate_includes_gst, sac, amount, sort_order",
        )
        .eq("stay_id", stayId)
        .order("sort_order")
        .order("created_at"),
      supabase
        .from("birdwing_invoices")
        .select(
          "id, number, historic, status, issued_on, bill_to_name, total, payable, cancel_reason, issued_by",
        )
        .eq("stay_id", stayId)
        .order("created_at"),
      supabase
        .from("birdwing_receipts")
        .select(
          "id, amount, received_on, mode, reference, note, invoice_id, created_by, source_key",
        )
        .eq("stay_id", stayId)
        .order("received_on")
        .order("created_at"),
      supabase
        .from("birdwing_cross_charges")
        .select("id, kind, cost_centre_id, amount, charged_month, note, created_by")
        .eq("stay_id", stayId)
        .order("created_at"),
      supabase
        .from("birdwing_stay_files")
        .select("id, kind, file_name, content_type, size_bytes, created_at, created_by")
        .eq("stay_id", stayId)
        .order("created_at"),
    ],
  );
  for (const [context, result] of [
    ["the guest", guest],
    ["the cost centre", centre],
    ["the stay's rooms", rooms],
    ["the charges", charges],
    ["the invoices", invoices],
    ["the receipts", receipts],
    ["the settlements", settlements],
    ["the documents", files],
  ] as const) {
    if (result.error) fail(context, result.error);
  }

  const centreIds = [
    ...new Set((settlements.data ?? []).map((row) => row.cost_centre_id).filter((id) => id)),
  ] as string[];
  const { data: centreRows, error: centreError } = centreIds.length
    ? await supabase.from("birdwing_cost_centres").select("id, name").in("id", centreIds)
    : { data: [] as { id: string; name: string }[], error: null };
  if (centreError) fail("the cost centres", centreError);
  const centreName = new Map((centreRows ?? []).map((row) => [row.id, row.name]));

  const names = await profileNames(supabase, [
    stay.created_by,
    ...(invoices.data ?? []).map((row) => row.issued_by),
    ...(receipts.data ?? []).map((row) => row.created_by),
    ...(settlements.data ?? []).map((row) => row.created_by),
    ...(files.data ?? []).map((row) => row.created_by),
  ]);
  const nameOf = (id: string | null) => (id ? (names.get(id) ?? null) : null);

  const invoiceList: StayInvoice[] = (invoices.data ?? []).map((row) => ({
    id: row.id,
    number: row.number,
    historic: row.historic,
    status: row.status === "cancelled" ? "cancelled" : "issued",
    issuedOn: row.issued_on,
    billToName: row.bill_to_name,
    total: Number(row.total),
    payable: Number(row.payable),
    cancelReason: row.cancel_reason,
    issuedByName: nameOf(row.issued_by),
  }));
  const invoiceNumber = new Map(invoiceList.map((invoice) => [invoice.id, invoice.number]));

  const chargeList: StayCharge[] = (charges.data ?? []).map((row) => ({
    id: row.id,
    rateCardId: row.rate_card_id,
    head: row.head,
    kind: oneOf(CHARGE_KINDS, row.kind) ?? "other",
    description: row.description,
    qty: Number(row.qty),
    rate: Number(row.rate),
    gstPct: Number(row.gst_pct),
    rateIncludesGst: row.rate_includes_gst,
    sac: row.sac,
    amount: Number(row.amount),
    sortOrder: row.sort_order,
  }));
  const receiptList: StayReceipt[] = (receipts.data ?? []).map((row) => ({
    id: row.id,
    amount: Number(row.amount),
    receivedOn: row.received_on,
    mode: oneOf(RECEIPT_MODES, row.mode) ?? "other",
    reference: row.reference,
    note: row.note,
    invoiceNumber: row.invoice_id ? (invoiceNumber.get(row.invoice_id) ?? null) : null,
    byName: nameOf(row.created_by),
    imported: row.source_key !== null,
  }));
  const settlementList: StaySettlement[] = (settlements.data ?? []).map((row) => ({
    id: row.id,
    kind: oneOf(SETTLEMENT_KINDS, row.kind) ?? "write_off",
    costCentreName: row.cost_centre_id ? (centreName.get(row.cost_centre_id) ?? null) : null,
    amount: Number(row.amount),
    month: row.charged_month,
    note: row.note,
    byName: nameOf(row.created_by),
  }));

  const money = stayMoney({
    chargeAmounts: chargeList.map((charge) => charge.amount),
    otaCommission: Number(stay.ota_commission),
    discount: Number(stay.discount),
    receipts: receiptList.map((receipt) => receipt.amount),
    settlements: settlementList.map((settlement) => settlement.amount),
  });
  const use = oneOf(STAY_USES, stay.use);
  const g = guest.data;

  return {
    id: stay.id,
    ref: stay.ref,
    isBlock: stay.is_block,
    guest: g
      ? {
          id: g.id,
          name: g.name,
          phone: g.phone,
          email: g.email,
          city: g.city,
          idType: oneOf(ID_TYPES, g.id_type),
          idLast4: g.id_last4,
          notes: g.notes,
        }
      : null,
    use,
    internal: isInternalUse(use),
    channel: oneOf(CHANNELS, stay.channel) ?? "other",
    costCentreId: stay.cost_centre_id,
    costCentreName: centre.data?.name ?? null,
    referredBy: stay.referred_by,
    status: oneOf(STAY_STATUSES, stay.status) ?? "confirmed",
    arrival: stay.arrival,
    departure: stay.departure,
    nights: nightsBetween(stay.arrival, stay.departure),
    adults: stay.adults,
    children: stay.children,
    pets: stay.pets,
    accountingMonth: stay.accounting_month,
    otaCommission: Number(stay.ota_commission),
    discount: Number(stay.discount),
    notes: stay.notes,
    guestNames: stay.guest_names,
    foodPreferences: stay.food_preferences,
    allergies: stay.allergies,
    requirements: stay.requirements,
    idVerified: stay.id_verified,
    checkinAt: stay.checkin_at,
    checkoutAt: stay.checkout_at,
    cancelledAt: stay.cancelled_at,
    cancelReason: stay.cancel_reason,
    legacyRoomCount: stay.legacy_room_count === null ? null : Number(stay.legacy_room_count),
    reviewFlags: stay.review_flags,
    reviewedAt: stay.reviewed_at,
    imported: stay.source_key !== null,
    createdAt: stay.created_at,
    createdByName: nameOf(stay.created_by),
    rooms: (rooms.data ?? []).map((row) => ({
      id: row.id,
      roomId: row.room_id,
      roomCode: row.birdwing_rooms?.code ?? "?",
      roomName: row.birdwing_rooms?.name ?? "",
      from: row.from_date,
      to: row.to_date,
      nights: nightsBetween(row.from_date, row.to_date),
      extraBeds: row.extra_beds,
      released: row.released_at !== null,
    })),
    charges: chargeList,
    invoices: invoiceList,
    issuedInvoice: invoiceList.find((invoice) => invoice.status === "issued") ?? null,
    receipts: receiptList,
    settlements: settlementList,
    files: (files.data ?? []).map((row) => ({
      id: row.id,
      kind: oneOf(FILE_KINDS, row.kind) ?? "other",
      fileName: row.file_name,
      contentType: row.content_type,
      sizeBytes: row.size_bytes,
      createdAt: row.created_at,
      byName: nameOf(row.created_by),
    })),
    money,
    settled: isSettled(money.pending),
  };
}

export type CalendarBookingRow = {
  stayId: string;
  ref: string;
  roomId: string;
  from: string;
  to: string;
  isBlock: boolean;
  status: StayStatus;
  label: string;
};

export async function listBookings(from: string, to: string): Promise<CalendarBookingRow[]> {
  await requireTool(GRANT);
  const supabase = await createClient();
  const rows = await fetchAll((start, end) =>
    supabase
      .from("birdwing_stay_rooms")
      .select(
        "stay_id, room_id, from_date, to_date, birdwing_stays(ref, is_block, status, notes, guest_id)",
      )
      .is("released_at", null)
      .lt("from_date", to)
      .gt("to_date", from)
      .order("id")
      .range(start, end),
  );

  const guestIds = [
    ...new Set(rows.map((row) => row.birdwing_stays?.guest_id).filter((id) => id)),
  ] as string[];
  const guests = guestIds.length
    ? await fetchAll((start, end) =>
        supabase
          .from("birdwing_guests")
          .select("id, name")
          .in("id", guestIds)
          .order("id")
          .range(start, end),
      )
    : [];
  const guestName = new Map(guests.map((guest) => [guest.id, guest.name]));

  return rows.map((row) => {
    const stay = row.birdwing_stays;
    const isBlock = stay?.is_block ?? false;
    return {
      stayId: row.stay_id,
      ref: stay?.ref ?? "",
      roomId: row.room_id,
      from: row.from_date,
      to: row.to_date,
      isBlock,
      status: oneOf(STAY_STATUSES, stay?.status) ?? "confirmed",
      label: isBlock
        ? stay?.notes || "Blocked"
        : (stay?.guest_id && guestName.get(stay.guest_id)) || stay?.ref || "",
    };
  });
}

/** Worked out on the server: the bulk close never takes an amount from the browser. */
export async function pendingByStay(stayIds: string[]): Promise<Map<string, number>> {
  await requireTool(GRANT);
  const supabase = await createClient();
  if (stayIds.length === 0) return new Map();
  const { data, error } = await supabase
    .from("birdwing_stays")
    .select("id, ota_commission, discount")
    .in("id", stayIds.slice(0, 200));
  if (error) fail("the stays", error);
  const parts = await moneyParts(
    supabase,
    (data ?? []).map((stay) => stay.id),
  );
  return new Map((data ?? []).map((stay) => [stay.id, moneyOf(parts, stay).pending]));
}

/** Stays touching [from, to) with no room (the old sheet's, or booked before a room was given); drawn below the rooms. */
export async function listUnplacedStays(from: string, to: string): Promise<UnplacedStay[]> {
  await requireTool(GRANT);
  const supabase = await createClient();
  const stays = await fetchAll((start, end) =>
    supabase
      .from("birdwing_stays")
      .select("id, ref, guest_id, status, arrival, departure, legacy_room_count")
      .eq("is_block", false)
      .neq("status", "cancelled")
      .lt("arrival", to)
      .gte("departure", from)
      .order("arrival")
      .order("id")
      .range(start, end),
  );
  if (stays.length === 0) return [];

  const ids = stays.map((stay) => stay.id);
  const placed = new Set<string>();
  for (let index = 0; index < ids.length; index += 100) {
    const chunk = ids.slice(index, index + 100);
    const rows = await fetchAll((start, end) =>
      supabase
        .from("birdwing_stay_rooms")
        .select("id, stay_id")
        .in("stay_id", chunk)
        .is("released_at", null)
        .order("id")
        .range(start, end),
    );
    for (const row of rows) placed.add(row.stay_id);
  }
  const unplaced = stays.filter((stay) => !placed.has(stay.id));

  const guestIds = [
    ...new Set(unplaced.map((stay) => stay.guest_id).filter((id) => id)),
  ] as string[];
  const guestName = new Map<string, string>();
  for (let index = 0; index < guestIds.length; index += 100) {
    const chunk = guestIds.slice(index, index + 100);
    const rows = await fetchAll((start, end) =>
      supabase
        .from("birdwing_guests")
        .select("id, name")
        .in("id", chunk)
        .order("id")
        .range(start, end),
    );
    for (const row of rows) guestName.set(row.id, row.name);
  }

  return unplaced.map((stay) => ({
    stayId: stay.id,
    label: (stay.guest_id && guestName.get(stay.guest_id)) || stay.ref,
    from: stay.arrival,
    to: stay.departure,
    roomCount: stay.legacy_room_count === null ? null : Number(stay.legacy_room_count),
    status: oneOf(STAY_STATUSES, stay.status) ?? "confirmed",
  }));
}

/** The invoice asked for, else the live issued one, else a DRAFT. Null when the stay is not this person's to see. */
export async function getInvoicePrint(
  stayId: string,
  invoiceId?: string,
): Promise<InvoicePrint | null> {
  await requireTool(GRANT);
  const supabase = await createClient();

  let query = supabase
    .from("birdwing_invoices")
    .select(
      "number, status, issued_on, cancel_reason, bill_to_name, bill_to_gstin, bill_to_address, discount, snapshot",
    )
    .eq("stay_id", stayId);
  query = invoiceId ? query.eq("id", invoiceId) : query.eq("status", "issued");
  const { data: invoice, error } = await query.maybeSingle();
  if (error) fail("the invoice", error);
  if (invoice) return printFromSnapshot(invoice);
  if (invoiceId) return null;

  const [stay, settings] = await Promise.all([getStay(stayId), getSettings()]);
  if (!stay || stay.isBlock) return null;
  return printDraft({
    company: settings.company,
    placeOfSupply: settings.placeOfSupply,
    bankDetails: settings.bankDetails,
    upiId: settings.upiId,
    terms: settings.invoiceTerms,
    stay: {
      ref: stay.ref,
      arrival: stay.arrival,
      departure: stay.departure,
      guests: stay.adults + stay.children,
      guestName: stay.guest?.name ?? null,
      guestPhone: stay.guest?.phone ?? null,
    },
    discount: stay.discount,
    charges: stay.charges,
  });
}

export type ReviewRow = {
  id: string;
  ref: string;
  guestName: string | null;
  use: StayUse | null;
  arrival: string;
  status: StayStatus;
  flags: string[];
  costCentreName: string | null;
  billed: number;
  pending: number;
};

/** Stays the import flagged and nobody reviewed, plus Goodearth's own stays still carrying a pending balance. */
export async function listReviewQueue(): Promise<ReviewRow[]> {
  await requireTool(GRANT);
  const supabase = await createClient();
  const stays = await fetchAll((from, to) =>
    supabase
      .from("birdwing_stays")
      .select(
        "id, ref, is_block, guest_id, use, channel, status, arrival, departure, adults, children, cost_centre_id, ota_commission, discount, review_flags, reviewed_at",
      )
      .eq("is_block", false)
      .neq("status", "cancelled")
      .or("use.neq.guest,and(reviewed_at.is.null,review_flags.neq.{})")
      .order("arrival")
      .order("id")
      .range(from, to),
  );
  const rows = await decorateStays(supabase, stays);
  const flagsOf = new Map(
    stays.map((stay) => [stay.id, stay.reviewed_at ? [] : stay.review_flags]),
  );
  return rows
    .filter((row) => row.flagged || (row.use !== "guest" && !isSettled(row.money.pending)))
    .map((row) => ({
      id: row.id,
      ref: row.ref,
      guestName: row.guestName,
      use: row.use,
      arrival: row.arrival,
      status: row.status,
      flags: flagsOf.get(row.id) ?? [],
      costCentreName: row.costCentreName,
      billed: row.money.billed,
      pending: row.money.pending,
    }));
}
