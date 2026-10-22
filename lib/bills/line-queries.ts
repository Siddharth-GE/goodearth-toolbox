import "server-only";

import { requireTool } from "@/lib/auth/access";
import { listWorkItems } from "@/lib/masters/works";
import { fetchAll } from "@/lib/supabase/fetch-all";
import { createClient } from "@/lib/supabase/server";

import type { BillLineKind, DayRates, PoLineForBill, WorkOrderLineForBill } from "./lines";
import { dayRatesFromLines } from "./lines";

// The PO side comes only through po_line_billing_facts (money window gated to /purchase-orders or /bills); the billing team cannot read the PO tables (Bills PLAN).

export type BillLineRow = {
  id: string;
  kind: BillLineKind;
  po_line_id: string | null;
  item_id: string | null;
  labour_log_id: string | null;
  work_item_id: string | null;
  work_label: string | null;
  description: string;
  uom: string | null;
  quantity: number | null;
  rate: number;
  gst_pct: number;
  discount_amount: number | null;
  other_charges: number | null;
  note: string | null;
};

export async function getBillLines(billId: string): Promise<BillLineRow[]> {
  await requireTool("/bills");
  const supabase = await createClient();
  const [lines, works] = await Promise.all([
    fetchAll((from, to) =>
      supabase
        .from("bill_lines")
        .select(
          "id, line_kind, po_line_id, item_id, labour_log_id, work_item_id, description, uom, quantity, rate, gst_pct, discount_amount, other_charges, note",
        )
        .eq("bill_id", billId)
        .order("sort_order")
        .order("created_at")
        .order("id")
        .range(from, to),
    ),
    listWorkItems(),
  ]);
  const workLabel = new Map(works.map((work) => [work.id, `${work.code} · ${work.name}`]));
  return lines.map((line) => ({
    id: line.id,
    kind: line.line_kind as BillLineKind,
    po_line_id: line.po_line_id,
    item_id: line.item_id,
    labour_log_id: line.labour_log_id,
    work_item_id: line.work_item_id,
    work_label: line.work_item_id ? (workLabel.get(line.work_item_id) ?? null) : null,
    description: line.description,
    uom: line.uom,
    quantity: line.quantity,
    rate: line.rate,
    gst_pct: line.gst_pct,
    discount_amount: line.discount_amount,
    other_charges: line.other_charges,
    note: line.note,
  }));
}

/** Through po_line_billing_facts (0106), with each material's name from the open items table. */
export async function getPoLinesForBill(poId: string): Promise<PoLineForBill[]> {
  await requireTool("/bills");
  const supabase = await createClient();
  const facts = await fetchAll((from, to) =>
    supabase
      .from("po_line_billing_facts")
      .select(
        "po_line_id, item_id, uom, ordered_quantity, received_quantity, billed_quantity, rate, gst_pct, discount_pct, discount_amount, other_charges",
      )
      .eq("po_id", poId)
      .order("po_line_id")
      .range(from, to),
  );
  const itemIds = [...new Set(facts.flatMap((fact) => (fact.item_id ? [fact.item_id] : [])))];
  const { data: items, error } = itemIds.length
    ? await supabase.from("items").select("id, name, code").in("id", itemIds)
    : { data: [], error: null };
  if (error) {
    console.error("getPoLinesForBill items failed:", error);
    throw new Error("Could not read the PO's materials.", { cause: error });
  }
  const itemById = new Map((items ?? []).map((item) => [item.id, item]));

  return facts
    .filter((fact) => fact.po_line_id && fact.item_id)
    .map((fact) => ({
      po_line_id: fact.po_line_id as string,
      item_id: fact.item_id as string,
      item_name: itemById.get(fact.item_id as string)?.name ?? "A material",
      item_code: itemById.get(fact.item_id as string)?.code ?? null,
      uom: fact.uom ?? "",
      ordered: fact.ordered_quantity ?? 0,
      received: fact.received_quantity ?? 0,
      billed: fact.billed_quantity ?? 0,
      rate: fact.rate,
      gst_pct: fact.gst_pct,
      discount_pct: fact.discount_pct,
      discount_amount: fact.discount_amount,
      other_charges: fact.other_charges,
    }))
    .sort((a, b) => a.item_name.localeCompare(b.item_name));
}

export async function getWorkOrderLinesForBill(
  contractId: string,
): Promise<WorkOrderLineForBill[]> {
  await requireTool("/bills");
  const supabase = await createClient();
  const lines = await fetchAll((from, to) =>
    supabase
      .from("labour_contract_lines")
      .select("work_item_id, description, is_lump_sum, uom, rate")
      .eq("contract_id", contractId)
      .order("sort_order")
      .order("created_at")
      .order("id")
      .range(from, to),
  );
  return lines;
}

/** From the contractor's latest daily-wages bill that has lines; what Send to Bill suggests next. */
export async function getLastDayRates(vendorId: string): Promise<DayRates> {
  await requireTool("/bills");
  const supabase = await createClient();
  const { data: bills, error } = await supabase
    .from("bills")
    .select("id, bill_lines!inner(description, rate, line_kind)")
    .eq("vendor_id", vendorId)
    .eq("kind", "nmr")
    .eq("bill_lines.line_kind", "nmr")
    .order("created_at", { ascending: false })
    .limit(1);
  if (error) {
    console.error("getLastDayRates failed:", error);
    throw new Error("Could not read the contractor's last day rates.", { cause: error });
  }
  const lines = (bills?.[0]?.bill_lines ?? []) as { description: string; rate: number }[];
  return dayRatesFromLines(lines);
}

export async function countLabourEntriesOnBill(billId: string): Promise<number> {
  await requireTool("/bills");
  const supabase = await createClient();
  const { count, error } = await supabase
    .from("labour_logs")
    .select("id", { count: "exact", head: true })
    .eq("bill_id", billId);
  if (error) {
    console.error("countLabourEntriesOnBill failed:", error);
    throw new Error("Could not read the bill's labour entries.", { cause: error });
  }
  return count ?? 0;
}

export type DeliveryInvoice = { invoiceNo: string; invoiceDate: string | null; grn: string };

/** The supplier's invoices this PO's deliveries carried (0132), less any already on one of its bills. Read from the open stock table. */
export async function getPoInvoicesForBill(poId: string): Promise<DeliveryInvoice[]> {
  await requireTool("/bills");
  const supabase = await createClient();
  const [receipts, billed] = await Promise.all([
    fetchAll((from, to) =>
      supabase
        .from("goods_receipts")
        .select("id, reference, invoice_no, invoice_date")
        .eq("po_id", poId)
        .not("invoice_no", "is", null)
        .order("received_at")
        .order("id")
        .range(from, to),
    ),
    fetchAll((from, to) =>
      supabase.from("bills").select("id, invoice_no").eq("po_id", poId).order("id").range(from, to),
    ),
  ]);
  const used = new Set(billed.map((bill) => bill.invoice_no.trim().toLowerCase()));
  const seen = new Set<string>();
  const invoices: DeliveryInvoice[] = [];
  for (const receipt of receipts) {
    const invoiceNo = (receipt.invoice_no ?? "").trim();
    const key = invoiceNo.toLowerCase();
    if (!invoiceNo || used.has(key) || seen.has(key)) continue;
    seen.add(key);
    invoices.push({ invoiceNo, invoiceDate: receipt.invoice_date, grn: receipt.reference ?? "—" });
  }
  return invoices;
}
