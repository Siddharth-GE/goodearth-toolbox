// An issued or cancelled invoice reads from the snapshot the database took at issue (0115), so a reprint matches the original;
// a DRAFT uses the current charges and settings. Pure: the route reads, this shapes, invoice-document.tsx draws.
import type { LetterheadCompany } from "@/lib/pdf/document";
import { gstBreakdown, taxableOf, type GstRow } from "./money";
import { roundPaise } from "@/lib/line-money";

export type InvoiceLine = {
  head: string;
  description: string | null;
  sac: string | null;
  qty: number;
  rate: number;
  rateIncludesGst: boolean;
  gstPct: number;
  taxable: number;
  amount: number;
};

export type InvoicePrint = {
  mode: "draft" | "issued" | "cancelled";
  number: string | null;
  issuedOn: string | null;
  cancelReason: string | null;
  billTo: { name: string; gstin: string | null; address: string | null };
  company: LetterheadCompany | null;
  placeOfSupply: string | null;
  stay: {
    ref: string;
    arrival: string;
    departure: string;
    guests: number;
    guestName: string | null;
    guestPhone: string | null;
  };
  lines: InvoiceLine[];
  taxSummary: GstRow[];
  taxable: number;
  cgst: number;
  sgst: number;
  total: number;
  discount: number;
  payable: number;
  bankDetails: string | null;
  upiId: string | null;
  terms: string | null;
};

const num = (value: unknown): number => (typeof value === "number" ? value : Number(value ?? 0));
const str = (value: unknown): string | null =>
  typeof value === "string" && value.trim() !== "" ? value : null;

function totalsOf(lines: InvoiceLine[], discount: number) {
  const taxSummary = gstBreakdown(
    lines.map((line) => ({ amount: line.amount, gstPct: line.gstPct })),
  );
  const sum = (pick: (row: GstRow) => number) =>
    roundPaise(taxSummary.reduce((total, row) => total + pick(row), 0));
  const total = sum((row) => row.amount);
  return {
    taxSummary,
    taxable: sum((row) => row.taxable),
    cgst: sum((row) => row.cgst),
    sgst: sum((row) => row.sgst),
    total,
    discount,
    payable: roundPaise(total - discount),
  };
}

export function printFromSnapshot(row: {
  number: string;
  status: string;
  issued_on: string;
  cancel_reason: string | null;
  bill_to_name: string;
  bill_to_gstin: string | null;
  bill_to_address: string | null;
  discount: number | string;
  snapshot: unknown;
}): InvoicePrint {
  const snapshot = (row.snapshot ?? {}) as Record<string, unknown>;
  const stay = (snapshot.stay ?? {}) as Record<string, unknown>;
  const company = snapshot.company as Record<string, unknown> | null | undefined;
  const lines: InvoiceLine[] = (Array.isArray(snapshot.lines) ? snapshot.lines : []).map(
    (raw: Record<string, unknown>) => {
      const amount = num(raw.amount);
      const gstPct = num(raw.gst_pct);
      return {
        head: str(raw.head) ?? "Charge",
        description: str(raw.description),
        sac: str(raw.sac),
        qty: num(raw.qty) || 1,
        rate: num(raw.rate),
        rateIncludesGst: raw.rate_includes_gst === true,
        gstPct,
        taxable: raw.taxable === undefined ? taxableOf(amount, gstPct) : num(raw.taxable),
        amount,
      };
    },
  );

  return {
    mode: row.status === "cancelled" ? "cancelled" : "issued",
    number: row.number,
    issuedOn: row.issued_on,
    cancelReason: row.cancel_reason,
    billTo: { name: row.bill_to_name, gstin: row.bill_to_gstin, address: row.bill_to_address },
    company: company
      ? {
          name: str(company.name) ?? "",
          legal_name: str(company.legal_name),
          address: str(company.address),
          gstin: str(company.gstin),
          phone: str(company.phone),
          email: str(company.email),
        }
      : null,
    placeOfSupply: str(snapshot.place_of_supply),
    stay: {
      ref: str(stay.ref) ?? "",
      arrival: str(stay.arrival) ?? "",
      departure: str(stay.departure) ?? "",
      guests: num(stay.guests),
      guestName: str(stay.guest_name),
      guestPhone: str(stay.guest_phone),
    },
    lines,
    ...totalsOf(lines, num(row.discount)),
    bankDetails: str(snapshot.bank_details),
    upiId: str(snapshot.upi_id),
    terms: str(snapshot.terms),
  };
}

const UPI_ID = /^[a-zA-Z0-9._-]+@[a-zA-Z0-9]+$/;

/** The scan-to-pay link behind the invoice's QR. No amount: an advance is usually paid already, so the guest types what is left.
 * Only an issued invoice gets one; nobody should pay against a draft or a cancelled number. */
export function upiPayLink(invoice: InvoicePrint): string | null {
  const upiId = invoice.upiId?.trim();
  if (invoice.mode !== "issued" || !invoice.number || !upiId || !UPI_ID.test(upiId)) return null;
  const params = [`pa=${upiId}`];
  const payee = invoice.company?.legal_name || invoice.company?.name;
  if (payee) params.push(`pn=${encodeURIComponent(payee)}`);
  params.push(`tn=${encodeURIComponent(`Invoice ${invoice.number}`)}`, "cu=INR");
  return `upi://pay?${params.join("&")}`;
}

export function printDraft(input: {
  company: LetterheadCompany | null;
  placeOfSupply: string | null;
  bankDetails: string | null;
  upiId: string | null;
  terms: string | null;
  stay: InvoicePrint["stay"];
  discount: number;
  charges: {
    head: string;
    description: string | null;
    sac: string | null;
    qty: number;
    rate: number;
    rateIncludesGst: boolean;
    gstPct: number;
    amount: number;
  }[];
}): InvoicePrint {
  const lines = input.charges.map((charge) => ({
    ...charge,
    taxable: taxableOf(charge.amount, charge.gstPct),
  }));
  return {
    mode: "draft",
    number: null,
    issuedOn: null,
    cancelReason: null,
    billTo: { name: input.stay.guestName ?? "", gstin: null, address: null },
    company: input.company,
    placeOfSupply: input.placeOfSupply,
    stay: input.stay,
    lines,
    ...totalsOf(lines, input.discount),
    bankDetails: input.bankDetails,
    upiId: input.upiId,
    terms: input.terms,
  };
}
