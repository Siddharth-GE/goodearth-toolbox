import "server-only";

import { approveBill, deleteBill, sendBackBill } from "@/lib/bills/actions";
import { sendLabourToBill } from "@/lib/bills/labour-actions";
import {
  createBillWithLines,
  saveBillLines,
  setBillTotalOverride,
  updateBillCharges,
  updateBillDetails,
} from "@/lib/bills/line-actions";
import { roundPaise } from "@/lib/line-money";
import { listActiveUomNames } from "@/lib/masters/uoms";
import { fetchAll } from "@/lib/supabase/fetch-all";
import { createClient } from "@/lib/supabase/server";

import { lineKindOfNmr, numberOf, type BILLS } from "../entries/bills";
import { idFrom } from "../redirects";
import {
  failed,
  given,
  gstRefused,
  recordNow,
  retired,
  saving,
  siteOf,
  unlessStatus,
  type RunResult,
  type Runners,
  type Values,
} from "./kit";

type Key = (typeof BILLS)[number]["key"];
type Refusal = { error: string } | null;

/** A bill line as Bills' own editor sends it (Bills' shape, which Turing may not import). */
type Draft = {
  kind: "material" | "nmr" | "pw_qty" | "pw_lump" | "other";
  poLineId: string | null;
  itemId: string | null;
  labourLogId: string | null;
  labourContractLineId: string | null;
  workItemId: string | null;
  description: string;
  uom: string | null;
  quantity: number | null;
  rate: number | null;
  gstPct: number;
  discountAmount: number | null;
  otherCharges: number | null;
  note: string | null;
};

const text = (values: Values, key: string) =>
  typeof values[key] === "string" && values[key] ? String(values[key]) : null;

/** A row's money, as the paper bill gives it. */
const money = (row: Values) => ({
  quantity: numberOf(row, "quantity"),
  rate: numberOf(row, "rate"),
  gstPct: numberOf(row, "gst_pct") ?? 0,
  discountAmount: numberOf(row, "discount_amount"),
  otherCharges: numberOf(row, "other_charges"),
  note: text(row, "line_note"),
});

const twice = (ids: string[], what: string): Refusal =>
  new Set(ids).size < ids.length ? { error: `One ${what} is named twice; give it one row.` } : null;

/** Bills' record form: the bill is minted and opened; its number is what Turing says. */
async function recorded(call: () => ReturnType<typeof createBillWithLines>): Promise<RunResult> {
  const done = await saving(call, "/bills/");
  if ("error" in done) return done;
  const id = idFrom(done.path, "/bills/");
  if (!id) return undefined;
  const made = await recordNow("bills", { column: "id", id }, ["reference"], null);
  return "row" in made && made.row.reference ? { saved: String(made.row.reference) } : undefined;
}

/** The record form offers Masters' active units for an "other" line. */
async function unitRefused(units: (string | null)[]): Promise<Refusal> {
  const asked = units.filter((unit): unit is string => Boolean(unit));
  if (asked.length === 0) return null;
  let active: string[];
  try {
    active = await listActiveUomNames();
  } catch (error) {
    return failed("uoms", error);
  }
  const off = asked.find((unit) => !active.includes(unit));
  return off ? { error: `"${off}" is not a unit in Masters.` } : null;
}

type LineRow = {
  id: string;
  line_kind: string;
  po_line_id: string | null;
  item_id: string | null;
  labour_log_id: string | null;
  labour_contract_line_id: string | null;
  work_item_id: string | null;
  description: string;
  uom: string | null;
  quantity: number | null;
  rate: number;
  gst_pct: number;
  discount_amount: number | null;
  other_charges: number | null;
  note: string | null;
};
const LINE_COLUMNS =
  "id, line_kind, po_line_id, item_id, labour_log_id, labour_contract_line_id, work_item_id, description, uom, quantity, rate, gst_pct, discount_amount, other_charges, note";

const draftOf = (line: LineRow): Draft & { id: string } => ({
  id: line.id,
  // bill_lines' CHECK holds it to the five kinds.
  kind: line.line_kind as Draft["kind"],
  poLineId: line.po_line_id,
  itemId: line.item_id,
  labourLogId: line.labour_log_id,
  labourContractLineId: line.labour_contract_line_id,
  workItemId: line.work_item_id,
  description: line.description,
  uom: line.uom,
  quantity: line.quantity,
  rate: line.rate,
  gstPct: line.gst_pct,
  discountAmount: line.discount_amount,
  otherCharges: line.other_charges,
  note: line.note,
});

export const BILL_RUNNERS: Runners<Key> = {
  bill_po: {
    lines: async (header, rows) => {
      const poId = String(header.po_id);
      const ids = rows.map((row) => String(row.po_line_id));
      const po = await recordNow(
        "purchase_orders",
        { column: "id", id: poId },
        ["status"],
        "That PO is gone.",
      );
      if ("error" in po) return po;
      if (po.row.status !== "issued" && po.row.status !== "completed") {
        return { error: "Bills are recorded only against an issued or completed PO." };
      }
      const twiceRefused = twice(ids, "PO line");
      if (twiceRefused) return twiceRefused;
      const supabase = await createClient();
      const [{ data: poLines, error }, { data: facts, error: factsError }] = await Promise.all([
        supabase
          .from("purchase_order_lines")
          .select("id, item_id, uom, gst_pct, items(name, code)")
          .eq("po_id", poId)
          .in("id", ids),
        supabase
          .from("po_line_billing_facts")
          .select("po_line_id, received_quantity, billed_quantity")
          .eq("po_id", poId)
          .in("po_line_id", ids),
      ]);
      if (error || factsError) return failed("purchase_order_lines", error ?? factsError);
      const byId = new Map(poLines.map((line) => [line.id, line]));
      if (ids.some((id) => !byId.has(id))) return { error: "A line is not on that PO." };
      // The form offers only a line with something received and not yet billed.
      const left = new Map(
        facts.map((fact) => [
          fact.po_line_id,
          Math.round(((fact.received_quantity ?? 0) - (fact.billed_quantity ?? 0)) * 1e6) / 1e6,
        ]),
      );
      if (ids.some((id) => !((left.get(id) ?? 0) > 0))) {
        return { error: "A PO line has nothing received and not yet billed." };
      }
      const refused = await gstRefused(
        rows.map((row) => offList(numberOf(row, "gst_pct"))),
        rows.map((row) => byId.get(String(row.po_line_id))?.gst_pct),
      );
      if (refused) return refused;
      return recorded(() =>
        createBillWithLines({
          kind: "po",
          poId,
          labourContractId: null,
          vendorId: null,
          projectId: null,
          plotId: null,
          unitId: null,
          invoiceNo: String(header.invoice_no),
          invoiceDate: String(header.invoice_date),
          note: text(header, "note"),
          lines: rows.map((row) => {
            const line = byId.get(String(row.po_line_id))!;
            const item = line.items as { name: string; code: string | null } | null;
            return {
              kind: "material",
              poLineId: line.id,
              itemId: line.item_id,
              labourLogId: null,
              labourContractLineId: null,
              workItemId: null,
              // As the record form names it.
              description: item?.code
                ? `${item.name} (${item.code})`
                : (item?.name ?? "A material"),
              uom: line.uom,
              ...money(row),
            };
          }),
        }),
      );
    },
  },
  bill_work_order: {
    lines: async (header, rows) => {
      const orderId = String(header.work_order_id);
      const ids = rows.map((row) => String(row.work_order_line_id));
      const order = await recordNow(
        "labour_contracts",
        { column: "id", id: orderId },
        ["status", "is_active"],
        "That work order is gone.",
      );
      if ("error" in order) return order;
      if (order.row.status !== "approved" || order.row.is_active !== true) {
        return { error: "Bills are recorded only against an approved work order that is on." };
      }
      const refused =
        twice(ids, "work") ??
        (await gstRefused(rows.map((row) => offList(numberOf(row, "gst_pct")))));
      if (refused) return refused;
      const supabase = await createClient();
      const { data: works, error } = await supabase
        .from("labour_contract_lines")
        .select("id, work_item_id, description, is_lump_sum, quantity, uom, rate")
        .eq("contract_id", orderId)
        .in("id", ids);
      if (error) return failed("labour_contract_lines", error);
      const byId = new Map(works.map((one) => [one.id, one]));
      if (ids.some((id) => !byId.has(id))) return { error: "A work is not on that work order." };
      const done = await fullyBilled(orderId, works);
      if ("error" in done) return done;
      if (ids.some((id) => done.has(id))) {
        return { error: "A work on that order is already fully billed." };
      }
      for (const row of rows) {
        const lump = byId.get(String(row.work_order_line_id))!.is_lump_sum;
        if (lump && numberOf(row, "quantity") !== null) {
          return { error: "A lump-sum work takes no quantity: its rate is the amount billed." };
        }
        if (!lump && numberOf(row, "quantity") === null) {
          return { error: "Give the quantity billed for each work that isn't a lump sum." };
        }
      }
      return recorded(() =>
        createBillWithLines({
          kind: "contract",
          poId: null,
          labourContractId: orderId,
          vendorId: null,
          projectId: null,
          plotId: null,
          unitId: null,
          invoiceNo: String(header.invoice_no),
          invoiceDate: String(header.invoice_date),
          note: text(header, "note"),
          lines: rows.map((row) => {
            const one = byId.get(String(row.work_order_line_id))!;
            return {
              kind: one.is_lump_sum ? "pw_lump" : "pw_qty",
              poLineId: null,
              itemId: null,
              labourLogId: null,
              labourContractLineId: one.id,
              workItemId: one.work_item_id,
              description: one.description,
              uom: one.is_lump_sum ? null : one.uom,
              ...money(row),
              quantity: one.is_lump_sum ? null : numberOf(row, "quantity"),
            };
          }),
        }),
      );
    },
  },
  bill_nmr: {
    lines: async (header, rows) => {
      const projectId = String(header.project_id);
      const site = await siteOf(projectId, text(header, "plot_id"));
      if ("error" in site) return site;
      const lines: Draft[] = rows.map((row) => {
        const kind = lineKindOfNmr(String(row.description));
        return {
          kind,
          poLineId: null,
          itemId: null,
          labourLogId: null,
          labourContractLineId: null,
          workItemId: null,
          description: String(row.description).trim(),
          uom: kind === "other" ? text(row, "uom") : null,
          ...money(row),
        };
      });
      // A trade's man-days carry no unit on screen, so one given would be dropped unsaid.
      if (
        rows.some((row) => lineKindOfNmr(String(row.description)) === "nmr" && text(row, "uom"))
      ) {
        return { error: "A trade's man-days take no unit." };
      }
      const refused =
        (await retired("vendors", text(header, "vendor_id"))) ??
        (await gstRefused(lines.map((line) => offList(line.gstPct)))) ??
        (await unitRefused(lines.map((line) => line.uom)));
      if (refused) return refused;
      return recorded(() =>
        createBillWithLines({
          kind: "nmr",
          poId: null,
          labourContractId: null,
          vendorId: text(header, "vendor_id"),
          projectId,
          ...site,
          invoiceNo: String(header.invoice_no),
          invoiceDate: String(header.invoice_date),
          note: text(header, "note"),
          lines,
        }),
      );
    },
  },
  bill_details: async (v) => {
    const now = await recordNow(
      "bills",
      { column: "id", id: String(v.bill_id) },
      ["invoice_no", "invoice_date", "note"],
      "That bill is gone.",
    );
    if ("error" in now) return now;
    const row = now.row as { invoice_no: string; invoice_date: string; note: string | null };
    return updateBillDetails(String(v.bill_id), {
      invoiceNo: given(v, "invoice_no", row.invoice_no),
      invoiceDate: given(v, "invoice_date", row.invoice_date),
      note: given(v, "note", row.note) || null,
    });
  },
  // saveBillLines takes the whole list, so all of one bill's rows go in one save.
  bill_lines_change: {
    lines: async (header, rows) => {
      const billId = String(header.bill_id);
      const ids = rows.map((row) => String(row.bill_line_id));
      const refused = twice(ids, "line");
      if (refused) return refused;
      const supabase = await createClient();
      let lines: LineRow[];
      try {
        lines = await fetchAll((from, to) =>
          supabase
            .from("bill_lines")
            .select(LINE_COLUMNS)
            .eq("bill_id", billId)
            .order("sort_order")
            .order("id")
            .range(from, to),
        );
      } catch (error) {
        return failed("bill_lines", error);
      }
      const byId = new Map(rows.map((row) => [String(row.bill_line_id), row]));
      if (ids.some((id) => !lines.some((line) => line.id === id))) {
        return {
          error: "A line is not on that bill as it stands now. Ask Turing to read it again.",
        };
      }
      const next = lines.flatMap((line) => {
        const row = byId.get(line.id);
        const draft = draftOf(line);
        if (!row) return [draft];
        if (row.remove === true) return [];
        return [
          {
            ...draft,
            description: given(row, "description", draft.description),
            quantity:
              draft.kind === "pw_lump" ? null : Number(given(row, "quantity", draft.quantity)),
            rate: Number(given(row, "rate", draft.rate)),
            gstPct: Number(given(row, "gst_pct", draft.gstPct)),
            discountAmount: numberOrNull(given(row, "discount_amount", draft.discountAmount)),
            otherCharges: numberOrNull(given(row, "other_charges", draft.otherCharges)),
            note: given(row, "line_note", draft.note) || null,
          },
        ];
      });
      const lineOf = (row: Values) => lines.find((one) => one.id === String(row.bill_line_id));
      if (
        rows.some(
          (row) => lineOf(row)?.line_kind === "pw_lump" && numberOf(row, "quantity") !== null,
        )
      ) {
        return { error: "A lump-sum line takes no quantity: its rate is the amount." };
      }
      // The editor never edits a material's description, nor any on a bill made from labour entries.
      const { count: fromLabour, error: labourError } = await supabase
        .from("labour_logs")
        .select("id", { count: "exact", head: true })
        .eq("bill_id", billId);
      if (labourError) return failed("labour_logs", labourError);
      if (
        rows.some(
          (row) =>
            "description" in row &&
            (lineOf(row)?.line_kind === "material" || (fromLabour ?? 0) > 0),
        )
      ) {
        return {
          error:
            "A material's description, and every one on a bill made from labour entries, comes from them and stays.",
        };
      }
      if (next.length === 0) return { error: "A bill keeps at least one line." };
      const gstRefusal = await gstRefused(
        rows.map((row) => offList(numberOf(row, "gst_pct"))),
        rows.map((row) => lines.find((one) => one.id === String(row.bill_line_id))?.gst_pct),
      );
      return gstRefusal ?? saveBillLines(billId, next);
    },
  },
  bill_charges: async (v) => {
    const now = await recordNow(
      "bills",
      { column: "id", id: String(v.bill_id) },
      ["charges_amount", "charges_gst_pct", "charges_note"],
      "That bill is gone.",
    );
    if ("error" in now) return now;
    const row = now.row as {
      charges_amount: number | null;
      charges_gst_pct: number | null;
      charges_note: string | null;
    };
    const lines = await lineCount(String(v.bill_id));
    if (typeof lines !== "number") return lines;
    if (lines === 0) return { error: "Charges go on a bill with lines; this one has none." };
    const charges = numberOrNull(given(v, "amount", row.charges_amount));
    // No amount is no charges: its GST and note go with it, so either given would be dropped.
    if (charges === null) {
      if (text(v, "gst_pct") || text(v, "note")) {
        return {
          error:
            "amount" in v
              ? "Removing the charges takes no GST % or note."
              : "That bill has no charges yet. Give their amount too.",
        };
      }
      return updateBillCharges(String(v.bill_id), { amount: null, gst_pct: null, note: null });
    }
    const refused = await gstRefused([offList(numberOf(v, "gst_pct"))], [row.charges_gst_pct]);
    if (refused) return refused;
    return updateBillCharges(String(v.bill_id), {
      amount: charges,
      // New charges start at 18%, as the screen's box does.
      gst_pct: numberOrNull(given(v, "gst_pct", row.charges_gst_pct ?? 18)),
      note: given(v, "note", row.charges_note) || null,
    });
  },
  bill_total: async (v) => {
    const now = await recordNow(
      "bills",
      { column: "id", id: String(v.bill_id) },
      ["total_amount", "total_override_note"],
      "That bill is gone.",
    );
    if ("error" in now) return now;
    const lines = await lineCount(String(v.bill_id));
    if (typeof lines !== "number") return lines;
    if (lines === 0)
      return { error: "A total by hand goes on a bill with lines; this one has none." };
    const row = now.row as { total_amount: number; total_override_note: string | null };
    // Given empty, the total goes back to the lines' sum and the reason with it.
    if ("total" in v && numberOf(v, "total") === null) {
      return text(v, "reason")
        ? { error: "Going back to the lines' sum takes no reason." }
        : setBillTotalOverride(String(v.bill_id), { total: null, note: null });
    }
    // Left out, a total by hand already there stays, as the screen shows it filled in.
    const total =
      "total" in v ? numberOf(v, "total") : row.total_override_note ? row.total_amount : null;
    if (total === null) return { error: "Give the total the muster roll shows." };
    return setBillTotalOverride(String(v.bill_id), {
      total,
      note: given(v, "reason", row.total_override_note) || null,
    });
  },
  bill_delete: async (v) => {
    const done = await saving(() => deleteBill(String(v.bill_id)), "/bills/list");
    return "error" in done ? done : undefined;
  },
  // The screen offers Approve only while recorded and Send back only while approved.
  bill_approve: async (v) =>
    (await billUnless(String(v.bill_id), "recorded", "That bill is already approved.")) ??
    approveBill(String(v.bill_id)),
  bill_send_back: async (v) =>
    (await billUnless(String(v.bill_id), "approved", "Only an approved bill can be sent back.")) ??
    sendBackBill(String(v.bill_id), String(v.note)),
  labour_to_bill: {
    lines: async (header, rows) => {
      const ids = rows.map((row) => String(row.labour_log_id));
      const refused = twice(ids, "labour log");
      if (refused) return refused;
      const supabase = await createClient();
      const { data: logs, error } = await supabase
        .from("labour_logs")
        .select("id, kind")
        .in("id", ids);
      if (error) return failed("labour_logs", error);
      if (logs.length < ids.length) return { error: "A labour log is gone." };
      const daily = logs.every((log) => log.kind === "nmr");
      if (!daily && logs.some((log) => log.kind === "nmr")) {
        return { error: "One bill is daily wages or piece-work, not both." };
      }
      // What the other kind's screen hides would be dropped unsaid, so it is refused.
      if (daily && (text(header, "work_order_id") || rows.some((row) => text(row, "piece_rate")))) {
        return { error: "Daily wages take day rates per trade, not a work order or piece rates." };
      }
      if (
        !daily &&
        ["mason_rate", "helper_rate", "other_rate", "total_override", "override_note"].some((key) =>
          text(header, key),
        )
      ) {
        return { error: "Piece-work takes each log's rate, not day rates or a total by hand." };
      }
      if (text(header, "override_note") && !text(header, "total_override")) {
        return { error: "A reason goes with a total by hand; give the total too." };
      }
      if (!daily && rows.some((row) => numberOf(row, "piece_rate") === null)) {
        return { error: "Give each piece-work log its rate." };
      }
      const gstPct = numberOf(header, "gst_pct") ?? 0;
      const gstRefusal = await gstRefused([gstPct], [0]);
      if (gstRefusal) return gstRefusal;
      return recorded(() =>
        sendLabourToBill({
          logIds: ids,
          kind: daily ? "nmr" : "pw",
          labourContractId: daily ? null : text(header, "work_order_id"),
          billReference: String(header.bill_reference),
          billDate: String(header.bill_date),
          dayRates: daily
            ? {
                mason: numberOf(header, "mason_rate"),
                helper: numberOf(header, "helper_rate"),
                other: numberOf(header, "other_rate"),
              }
            : null,
          pieceRates: daily
            ? null
            : Object.fromEntries(
                rows.map((row) => [String(row.labour_log_id), numberOf(row, "piece_rate")]),
              ),
          gstPct,
          totalOverride: daily ? numberOf(header, "total_override") : null,
          overrideNote: daily ? text(header, "override_note") : null,
          note: text(header, "note"),
        }),
      );
    },
  },
};

const billUnless = (billId: string, status: string, refusal: string) =>
  unlessStatus("bills", billId, status, refusal, "That bill is gone.");

const numberOrNull = (value: string) => (value === "" ? null : Number(value));

/** Every Bills screen offers 0% beside the GST list, so 0 is never checked against it. */
const offList = (pct: number | null) => (pct === 0 ? null : pct);

async function lineCount(billId: string): Promise<number | { error: string }> {
  const supabase = await createClient();
  const { count, error } = await supabase
    .from("bill_lines")
    .select("id", { count: "exact", head: true })
    .eq("bill_id", billId);
  return error ? failed("bill_lines", error) : (count ?? 0);
}

/**
 * The works of an order already billed in full, which the record form leaves out — none when a
 * bill on the order names no work, since then what each has billed is unknown.
 */
async function fullyBilled(
  orderId: string,
  works: { id: string; is_lump_sum: boolean; quantity: number | null; rate: number }[],
): Promise<Set<string> | { error: string }> {
  const supabase = await createClient();
  const { data: bills, error } = await supabase
    .from("bills")
    .select("id")
    .eq("labour_contract_id", orderId);
  if (error) return failed("bills", error);
  if (bills.length === 0) return new Set();
  const [{ count: untagged, error: untaggedError }, { data: billed, error: billedError }] =
    await Promise.all([
      supabase
        .from("bill_lines")
        .select("id", { count: "exact", head: true })
        .in(
          "bill_id",
          bills.map((one) => one.id),
        )
        .is("labour_contract_line_id", null),
      supabase
        .from("work_order_line_billing_facts")
        .select("labour_contract_line_id, billed_value")
        .eq("contract_id", orderId),
    ]);
  if (untaggedError || billedError) return failed("bill_lines", untaggedError ?? billedError);
  if ((untagged ?? 0) > 0) return new Set();
  const billedOf = new Map(
    billed.map((row) => [row.labour_contract_line_id ?? "", row.billed_value ?? 0]),
  );
  return new Set(
    works
      .filter(
        (work) =>
          roundPaise(
            roundPaise((work.is_lump_sum ? 1 : (work.quantity ?? 0)) * work.rate) -
              (billedOf.get(work.id) ?? 0),
          ) <= 0,
      )
      .map((work) => work.id),
  );
}
