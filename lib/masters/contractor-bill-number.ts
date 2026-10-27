// The database mints this on a contractor's bill (0164); Masters and Bills mirror it to show the next number. Change both together.

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

/** What bills_contractor_reference() numbers from. */
export type ContractorNumbering = {
  /** By vendor id, contractors only: a vendor missing here keeps BILL/… numbering. */
  codes: Record<string, string | null>;
  /** By project id; null when the project has no company. */
  companies: Record<string, { id: string; name: string; code: string | null } | null>;
  /** By "<vendor id>/<company id>". */
  lastNo: Record<string, number>;
};

/** The number a contractor's next bill takes, or why the database will refuse it; null when not a contractor. */
export function nextContractorBill(
  numbering: ContractorNumbering,
  vendorId: string,
  projectId: string,
  work: BillWorkType,
): { reference: string } | { problem: string } | null {
  if (!Object.hasOwn(numbering.codes, vendorId)) return null;
  const company = numbering.companies[projectId];
  if (!company) {
    return {
      problem:
        "This project has no company yet — pick one in Masters → Projects before billing a contractor.",
    };
  }
  if (!company.code) {
    return {
      problem: `${company.name} has no bill code yet — type one in Masters → Companies before billing a contractor.`,
    };
  }
  const code = numbering.codes[vendorId];
  if (!code)
    return { problem: "This contractor has no bill code yet — type one in Masters → Vendors." };
  const last = numbering.lastNo[`${vendorId}/${company.id}`] ?? 0;
  return { reference: contractorBillReference(code, work, company.code, last + 1) };
}

/** " raj u " → "RAJU"; blank → null, which the database fills from the name. */
export function cleanContractorCode(raw: string): string | null {
  return raw.toUpperCase().replace(/\s+/g, "") || null;
}

export const isContractorCode = (code: string) => /^[A-Z0-9]{4}$/.test(code);
