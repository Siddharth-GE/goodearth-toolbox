// The database mints this on a contractor's bill (0164); Masters mirrors it to show the next number. Change both together.

export type BillWorkType = "PW" | "NMR";

/** "RAJU-PW-ED-08": the contractor's code, piece-work or daily wages, the company's code, the count in that company. */
export function contractorBillReference(
  contractorCode: string,
  work: BillWorkType,
  companyCode: string,
  billNo: number,
): string {
  return `${contractorCode}-${work}-${companyCode}-${String(billNo).padStart(2, "0")}`;
}

/** " raj u " → "RAJU"; blank → null, which the database fills from the name. */
export function cleanContractorCode(raw: string): string | null {
  return raw.toUpperCase().replace(/\s+/g, "") || null;
}

export const isContractorCode = (code: string) => /^[A-Z0-9]{4}$/.test(code);
