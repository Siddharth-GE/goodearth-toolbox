// The database's CHECK lists and their labels, written once. Import-free: "use server" modules and client components import it.

export const GRANT = "/birdwing";

export const STAY_USES = [
  "guest",
  "client",
  "prospect",
  "team",
  "architect",
  "director",
  "vendor",
] as const;
export type StayUse = (typeof STAY_USES)[number];

export const USE_LABELS: Record<StayUse, string> = {
  guest: "Paying guest",
  client: "Goodearth client",
  prospect: "Goodearth prospect",
  team: "Goodearth team",
  architect: "Architect",
  director: "Goodearth director",
  vendor: "Vendor",
};

/** A paying guest owes; every other use is Goodearth's own, closed by a cross-charge. */
export function isInternalUse(use: StayUse | null): boolean {
  return use !== null && use !== "guest";
}

export const CHANNELS = ["direct", "airbnb", "booking", "mmt", "other"] as const;
export type Channel = (typeof CHANNELS)[number];

export const CHANNEL_LABELS: Record<Channel, string> = {
  direct: "Direct",
  airbnb: "Airbnb",
  booking: "Booking.com",
  mmt: "MakeMyTrip",
  other: "Other",
};

export const STAY_STATUSES = [
  "enquiry",
  "confirmed",
  "checked_in",
  "checked_out",
  "cancelled",
  "blocked",
] as const;
export type StayStatus = (typeof STAY_STATUSES)[number];

export const STATUS_LABELS: Record<StayStatus, string> = {
  enquiry: "Enquiry",
  confirmed: "Confirmed",
  checked_in: "In the house",
  checked_out: "Checked out",
  cancelled: "Cancelled",
  blocked: "Room block",
};

export const RECEIPT_MODES = ["upi", "bank", "cash", "cheque", "ota", "other"] as const;
export type ReceiptMode = (typeof RECEIPT_MODES)[number];

export const MODE_LABELS: Record<ReceiptMode, string> = {
  upi: "UPI",
  bank: "Bank transfer",
  cash: "Cash",
  cheque: "Cheque",
  ota: "Paid out by the OTA",
  other: "Other",
};

export const CHARGE_KINDS = ["room", "food", "experience", "addon", "other"] as const;
export type ChargeKind = (typeof CHARGE_KINDS)[number];

export const KIND_LABELS: Record<ChargeKind, string> = {
  room: "Room",
  food: "Food",
  experience: "Experience",
  addon: "Add-on",
  other: "Other",
};

export const ID_TYPES = ["aadhaar", "passport", "driving_licence", "voter_id", "other"] as const;
export type IdType = (typeof ID_TYPES)[number];

export const ID_TYPE_LABELS: Record<IdType, string> = {
  aadhaar: "Aadhaar",
  passport: "Passport",
  driving_licence: "Driving licence",
  voter_id: "Voter ID",
  other: "Other",
};

export const FILE_KINDS = ["id", "booking", "other"] as const;
export type FileKind = (typeof FILE_KINDS)[number];

export const FILE_KIND_LABELS: Record<FileKind, string> = {
  id: "Guest ID",
  booking: "Booking confirmation",
  other: "Other",
};

export const SETTLEMENT_KINDS = ["cross_charge", "write_off"] as const;
export type SettlementKind = (typeof SETTLEMENT_KINDS)[number];

export function oneOf<T extends string>(list: readonly T[], value: unknown): T | null {
  return typeof value === "string" && (list as readonly string[]).includes(value)
    ? (value as T)
    : null;
}
