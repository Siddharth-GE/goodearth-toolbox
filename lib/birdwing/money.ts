// line = qty × rate (+ GST unless inclusive); billed = lines − OTA commission − discount; pending = billed − collected − settled.
// `chargeAmount` mirrors birdwing_stay_charges.amount (0115): change both. Full paisa precision; round only on screen.

// EPSILON nudges 1.005-style floats the way Postgres' exact numeric rounds them.
const round2 = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

export type ChargeInput = {
  qty: number;
  rate: number;
  gstPct: number;
  rateIncludesGst: boolean;
};

export function chargeAmount(line: ChargeInput): number {
  const gross = line.qty * line.rate;
  return round2(line.rateIncludesGst ? gross : gross * (1 + line.gstPct / 100));
}

export function taxableOf(amount: number, gstPct: number): number {
  return round2(amount / (1 + gstPct / 100));
}

export type StayMoney = {
  charged: number;
  billed: number;
  collected: number;
  settled: number;
  pending: number;
};

export function stayMoney(input: {
  chargeAmounts: number[];
  otaCommission: number;
  discount: number;
  receipts: number[];
  settlements: number[];
}): StayMoney {
  const sum = (values: number[]) => round2(values.reduce((total, value) => total + value, 0));
  const charged = sum(input.chargeAmounts);
  const billed = round2(charged - input.otaCommission - input.discount);
  const collected = sum(input.receipts);
  const settled = sum(input.settlements);
  return { charged, billed, collected, settled, pending: round2(billed - collected - settled) };
}

/** Within a rupee of zero is settled: the sheet is full of ₹0.50 roundings. */
export function isSettled(pending: number): boolean {
  return Math.abs(pending) < 1;
}

export type GstRow = {
  gstPct: number;
  taxable: number;
  cgst: number;
  sgst: number;
  amount: number;
};

/** Per-rate tax summary. CGST takes the rounded half and SGST the rest, so the halves add up to the GST (the database's rule). */
export function gstBreakdown(lines: { amount: number; gstPct: number }[]): GstRow[] {
  const byRate = new Map<number, { amount: number; taxable: number }>();
  for (const line of lines) {
    const row = byRate.get(line.gstPct) ?? { amount: 0, taxable: 0 };
    row.amount += line.amount;
    row.taxable += taxableOf(line.amount, line.gstPct);
    byRate.set(line.gstPct, row);
  }
  return [...byRate.entries()]
    .sort(([a], [b]) => a - b)
    .map(([gstPct, row]) => {
      const amount = round2(row.amount);
      const taxable = round2(row.taxable);
      const gst = round2(amount - taxable);
      const cgst = round2(gst / 2);
      return { gstPct, taxable, cgst, sgst: round2(gst - cgst), amount };
    });
}

export function nightsBetween(arrival: string, departure: string): number {
  const day = 86_400_000;
  return Math.max(0, Math.round((Date.parse(departure) - Date.parse(arrival)) / day));
}
