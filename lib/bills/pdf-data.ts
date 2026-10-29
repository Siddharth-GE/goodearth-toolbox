import "server-only";

import { getProjectCompany, listCompanies } from "@/lib/masters/companies";

import type { BillPdfData } from "./bill-document";
import { getBillLines } from "./line-queries";
import { getBillSettlement } from "./payment-queries";
import { getBill, getBillVillas } from "./queries";
import type { SheetPdfData } from "./sheet-document";
import { getSheet } from "./sheet-queries";
import { getBillSignatureBoxes } from "./signature-queries";

// What a bill's or a sheet's print needs, read under the /bills grant: one bill's route and the bundle share them.

export async function loadBillPdfData(billId: string): Promise<BillPdfData | null> {
  const bill = await getBill(billId);
  if (!bill) return null;
  const [lines, settlement, company, villas, signatures] = await Promise.all([
    getBillLines(billId),
    getBillSettlement(billId, bill.total_amount),
    getProjectCompany(bill.project_id),
    getBillVillas(bill),
    getBillSignatureBoxes(bill),
  ]);
  return { bill, lines, settlement, company, villas, signatures };
}

export async function loadSheetPdfData(sheetId: string): Promise<SheetPdfData | null> {
  const sheet = await getSheet(sheetId);
  if (!sheet) return null;
  const [companies, signatures] = await Promise.all([
    listCompanies(),
    getBillSignatureBoxes({
      status: sheet.status === "approved" ? "approved" : "recorded",
      approved_by: sheet.approved_by,
    }),
  ]);
  return {
    sheet,
    company: companies.find((company) => company.id === sheet.company_id) ?? null,
    signatures,
  };
}
