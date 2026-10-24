import "server-only";

import { getDefaultTerms } from "@/lib/masters/terms";
import {
  addPoolLines,
  createPosFromIndent,
  createPurchaseOrder,
  deleteDraftPo,
  issuePo,
  removePoLine,
  requestPoDeletion,
  updatePoCharges,
  updatePoHeader,
  updatePoLine,
  withdrawPoDeletion,
} from "@/lib/purchase-orders/actions";
import { fetchAll } from "@/lib/supabase/fetch-all";
import { createClient } from "@/lib/supabase/server";

import type { PURCHASE_ORDERS } from "../entries/purchase-orders";
import { idFrom } from "../redirects";
import { given, recordNow, saving, siteOf, type RunResult, type Runners, type Values } from "./kit";

type Key = (typeof PURCHASE_ORDERS)[number]["key"];

const text = (values: Values, key: string) =>
  typeof values[key] === "string" && values[key] ? String(values[key]) : null;
/** A number given, or null for one left out or emptied: "not priced" is never ₹0. */
const amount = (values: Values, key: string) =>
  values[key] === undefined || values[key] === "" ? null : Number(values[key]);
const orNull = (value: string) => (value === "" ? null : Number(value));

/** Each PO's number, in order, for the result line. */
async function referencesOf(ids: string[]): Promise<string> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("purchase_orders")
    .select("id, reference")
    .in("id", ids);
  if (error || !data) return ids.length === 1 ? "the PO" : `${ids.length} POs`;
  const byId = new Map(data.map((row) => [row.id, row.reference]));
  return ids.map((id) => byId.get(id) ?? "a PO").join(", ");
}

type LineNow = {
  id: string;
  indent_line_id: string | null;
  quantity: number;
  rate: number | null;
  gst_pct: number | null;
  discount_pct: number | null;
  discount_amount: number | null;
  other_charges: number | null;
  note: string | null;
};
const LINE_COLUMNS =
  "id, indent_line_id, quantity, rate, gst_pct, discount_pct, discount_amount, other_charges, note";

/** A line's save with every field it is not given kept as it stands. */
function lineSave(now: LineNow, v: Values) {
  return updatePoLine(now.id, {
    quantity: Number(given(v, "quantity", now.quantity)),
    rate: orNull(given(v, "rate", now.rate)),
    gstPct: orNull(given(v, "gst_pct", now.gst_pct)),
    discountPct: orNull(given(v, "discount_pct", now.discount_pct)),
    discountAmount: orNull(given(v, "discount_amount", now.discount_amount)),
    otherCharges: orNull(given(v, "other_charges", now.other_charges)),
    note: given(v, "note", now.note) || null,
  });
}

export const PO_RUNNERS: Runners<Key> = {
  po_from_indent: {
    lines: async (header, lines) => {
      // The screen's own "order from this indent": one draft PO per vendor, all or nothing past the first refusal.
      const done = await saving(
        () =>
          createPosFromIndent(
            String(header.indent_id),
            lines.map((line) => ({
              indentLineId: String(line.indent_line_id),
              vendorId: String(line.vendor_id),
              quantity: Number(line.quantity),
              rate: amount(line, "rate"),
              gstPct: amount(line, "gst_pct"),
            })),
          ),
        "/purchase-orders/",
      );
      if ("error" in done) return done;
      const made = new URL(done.path ?? "/", "http://toolbox").searchParams.get("made");
      const ids = (made ?? "").split(",").filter(Boolean);
      return ids.length > 0 ? { saved: await referencesOf(ids) } : undefined;
    },
  },
  po_general: {
    lines: async (header, lines): Promise<RunResult> => {
      const projectId = String(header.project_id);
      const site = await siteOf(projectId, text(header, "plot_id"));
      if ("error" in site) return site;
      let terms: string | null;
      try {
        terms = await getDefaultTerms("po");
      } catch {
        return { error: "Could not read the default terms. Try again." };
      }
      const made = await saving(
        () =>
          createPurchaseOrder({
            projectId,
            ...site,
            vendorId: String(header.vendor_id),
            deliverStoreId: text(header, "deliver_store_id"),
            deliverNote: text(header, "deliver_note"),
            expectedBy: text(header, "expected_by"),
            terms,
            note: text(header, "note"),
          }),
        "/purchase-orders/",
      );
      if ("error" in made) return made;
      const poId = idFrom(made.path, "/purchase-orders/");
      if (!poId) {
        return {
          error:
            "The PO may have been made, but Turing could not find it. Look in Purchase Orders before asking again.",
        };
      }
      const reference = await referencesOf([poId]);

      // The same indent line twice is one line, its quantities added.
      const totals = new Map<string, number>();
      for (const line of lines) {
        const id = String(line.indent_line_id);
        totals.set(id, (totals.get(id) ?? 0) + Number(line.quantity));
      }
      const added = await addPoolLines(
        poId,
        [...totals].map(([indentLineId, quantity]) => ({ indentLineId, quantity })),
      );
      if (added?.error) return { error: `${reference} was made as a draft, but: ${added.error}` };

      // The pool add takes no price, so a rate or GST % given goes on through the line's own save.
      const priced = lines.filter(
        (line) => amount(line, "rate") !== null || amount(line, "gst_pct") !== null,
      );
      if (priced.length > 0) {
        const supabase = await createClient();
        let rows: LineNow[];
        try {
          rows = await fetchAll((from, to) =>
            supabase
              .from("purchase_order_lines")
              .select(LINE_COLUMNS)
              .eq("po_id", poId)
              .order("id")
              .range(from, to),
          );
        } catch {
          return {
            error: `${reference} was made with its lines, but not their prices. Add them on the PO.`,
          };
        }
        for (const line of priced) {
          const row = rows.find(
            (candidate) => candidate.indent_line_id === String(line.indent_line_id),
          );
          if (!row) continue;
          const pricing: Values = {};
          if ("rate" in line) pricing.rate = line.rate;
          if ("gst_pct" in line) pricing.gst_pct = line.gst_pct;
          const saved = await lineSave(row, pricing);
          if (saved?.error)
            return {
              error: `${reference} was made with its lines, but a price was refused: ${saved.error}`,
            };
        }
      }
      return { saved: reference };
    },
  },
  po_change: async (v) => {
    const now = await recordNow(
      "purchase_orders",
      { column: "id", id: String(v.po_id) },
      ["vendor_id", "deliver_store_id", "deliver_note", "expected_by", "terms", "note"],
      "That PO is gone.",
    );
    if ("error" in now) return now;
    const row = now.row as Record<string, string | null>;
    return updatePoHeader(String(v.po_id), {
      vendorId: given(v, "vendor_id", row.vendor_id),
      deliverStoreId: given(v, "deliver_store_id", row.deliver_store_id) || null,
      deliverNote: given(v, "deliver_note", row.deliver_note) || null,
      expectedBy: given(v, "expected_by", row.expected_by) || null,
      terms: given(v, "terms", row.terms) || null,
      note: given(v, "note", row.note) || null,
    });
  },
  po_charges: async (v) => {
    const now = await recordNow(
      "purchase_orders",
      { column: "id", id: String(v.po_id) },
      ["charges_amount", "charges_gst_pct", "charges_note"],
      "That PO is gone.",
    );
    if ("error" in now) return now;
    const row = now.row as {
      charges_amount: number | null;
      charges_gst_pct: number | null;
      charges_note: string | null;
    };
    return updatePoCharges(String(v.po_id), {
      amount: orNull(given(v, "amount", row.charges_amount)),
      gst_pct: orNull(given(v, "gst_pct", row.charges_gst_pct)),
      note: given(v, "note", row.charges_note) || null,
    });
  },
  po_line_change: async (v) => {
    const now = await recordNow(
      "purchase_order_lines",
      { column: "id", id: String(v.line_id) },
      LINE_COLUMNS.split(", "),
      "That line is no longer on the PO.",
    );
    if ("error" in now) return now;
    return lineSave(now.row as unknown as LineNow, v);
  },
  po_line_remove: async (v) => {
    // The remove says nothing when no line matched, so a line already gone is said here.
    const now = await recordNow(
      "purchase_order_lines",
      { column: "id", id: String(v.line_id) },
      ["po_id"],
      "That line is no longer on the PO.",
    );
    if ("error" in now) return now;
    return removePoLine(String(now.row.po_id), String(v.line_id));
  },
  po_issue: (v) => issuePo(String(v.po_id)),
  po_delete: async (v) => {
    const done = await saving(() => deleteDraftPo(String(v.po_id)), "/purchase-orders/list");
    return "error" in done ? done : undefined;
  },
  // The screen offers each only in its state; the withdraw would otherwise set any PO back to issued.
  po_cancel_request: async (v) => {
    const refused = await unlessStatus(
      String(v.po_id),
      "issued",
      "Only an issued PO can be asked to be cancelled.",
    );
    return refused ?? requestPoDeletion(String(v.po_id), String(v.reason));
  },
  po_cancel_withdraw: async (v) => {
    const refused = await unlessStatus(
      String(v.po_id),
      "deletion_requested",
      "That PO has no cancellation asked for.",
    );
    return refused ?? withdrawPoDeletion(String(v.po_id));
  },
};

/** A refusal unless the PO is in `status` now. */
async function unlessStatus(
  poId: string,
  status: string,
  refusal: string,
): Promise<RunResult | null> {
  const now = await recordNow(
    "purchase_orders",
    { column: "id", id: poId },
    ["status"],
    "That PO is gone.",
  );
  if ("error" in now) return now;
  return now.row.status === status ? null : { error: refusal };
}
