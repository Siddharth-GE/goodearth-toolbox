import "server-only";

import { listActiveGstRates } from "@/lib/masters/gst-rates";
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

import { poolPicks, withDiscountSwitch, type PURCHASE_ORDERS } from "../entries/purchase-orders";
import { idFrom } from "../redirects";
import {
  failed,
  given,
  recordNow,
  saving,
  siteOf,
  type RunResult,
  type Runners,
  type Values,
} from "./kit";

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

/** A GST % given must be on the active list, as every screen's picker offers only those. */
async function gstRefused(pcts: (number | null)[]): Promise<{ error: string } | null> {
  const asked = pcts.filter((pct): pct is number => pct !== null);
  if (asked.length === 0) return null;
  let rates: number[];
  try {
    rates = (await listActiveGstRates()).map((row) => Number(row.rate));
  } catch (error) {
    return failed("gst_rates", error);
  }
  const off = asked.find((pct) => !rates.includes(pct));
  return off === undefined
    ? null
    : { error: `${off}% is not on the GST list. Pick one of ${rates.join(", ")}.` };
}

/** A vendor or store retired in Masters is never offered on the screens. */
async function retired(
  table: "vendors" | "stores",
  id: string | null,
): Promise<{ error: string } | null> {
  if (!id) return null;
  const what = table === "vendors" ? "vendor" : "store";
  const now = await recordNow(table, { column: "id", id }, ["is_active"], `That ${what} is gone.`);
  if ("error" in now) return now;
  return now.row.is_active === false ? { error: `That ${what} is retired in Masters.` } : null;
}

/** Every indent line must be in the PO's pool: an approved indent of its project, of its villa when it has one. */
async function outsidePool(
  ids: string[],
  projectId: string,
  site: { plotId: string | null; unitId: string | null },
): Promise<{ error: string } | null> {
  const supabase = await createClient();
  let rows;
  try {
    rows = await fetchAll((from, to) =>
      supabase
        .from("indent_lines")
        .select("id, indents(status, project_id, plot_id, unit_id)")
        .in("id", ids)
        .order("id")
        .range(from, to),
    );
  } catch (error) {
    return failed("indent_lines", error);
  }
  if (rows.length < new Set(ids).size) return { error: "An indent line is gone." };
  for (const row of rows) {
    const indent = row.indents as {
      status: string;
      project_id: string;
      plot_id: string | null;
      unit_id: string | null;
    } | null;
    if (!indent || indent.status !== "approved") {
      return { error: "Only an approved indent's lines can be ordered." };
    }
    if (indent.project_id !== projectId) {
      return { error: "An indent line is from another project." };
    }
    if (
      (site.unitId && indent.unit_id !== site.unitId) ||
      (site.plotId && indent.plot_id !== site.plotId)
    ) {
      return { error: "An indent line is from another villa; a villa's PO takes only its own." };
    }
  }
  return null;
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
      const refused =
        (await gstRefused(lines.map((line) => amount(line, "gst_pct")))) ??
        (await firstRefusal(
          [...new Set(lines.map((line) => String(line.vendor_id)))].map((id) =>
            retired("vendors", id),
          ),
        ));
      if (refused) return refused;

      // A GST % left out is the item's own from Masters, as the screen prefills it.
      const supabase = await createClient();
      const { data: items, error } = await supabase
        .from("indent_lines")
        .select("id, items(gst_pct)")
        .in(
          "id",
          lines.map((line) => String(line.indent_line_id)),
        );
      if (error) return failed("indent_lines", error);
      const mastersGst = new Map(
        items.map((row) => [row.id, (row.items as { gst_pct: number | null } | null)?.gst_pct]),
      );

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
              gstPct:
                amount(line, "gst_pct") ?? mastersGst.get(String(line.indent_line_id)) ?? null,
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
      const chosen = poolPicks(lines);
      if ("error" in chosen) return chosen;
      const picks = chosen.picks;
      const projectId = String(header.project_id);
      const site = await siteOf(projectId, text(header, "plot_id"));
      if ("error" in site) return site;
      const refused =
        (await gstRefused(picks.map((pick) => pick.gstPct))) ??
        (await retired("vendors", String(header.vendor_id))) ??
        (await retired("stores", text(header, "deliver_store_id"))) ??
        (await outsidePool(
          picks.map((pick) => pick.indentLineId),
          projectId,
          site,
        ));
      if (refused) return refused;
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

      // The pool add takes no rate, so a rate or GST % given goes on through each line's own save, once.
      const priced = picks.filter((pick) => pick.rate !== null || pick.gstPct !== null);
      const added = await addPoolLines(
        poId,
        picks.map(({ indentLineId, quantity }) => ({ indentLineId, quantity })),
      );
      if (added?.error) {
        const unpriced =
          priced.length > 0 ? " Its lines have no prices yet; add them on the PO." : "";
        return { error: `${reference} was made as a draft, but: ${added.error}${unpriced}` };
      }
      if (priced.length === 0) return { saved: reference };

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
      let firstError: string | null = null;
      let refusals = 0;
      for (const pick of priced) {
        const row = rows.find((candidate) => candidate.indent_line_id === pick.indentLineId);
        const pricing: Values = {};
        if (pick.rate !== null) pricing.rate = String(pick.rate);
        if (pick.gstPct !== null) pricing.gst_pct = String(pick.gstPct);
        const saved = row
          ? await lineSave(row, pricing)
          : { error: "a line was not found on the PO." };
        if (saved?.error) {
          refusals += 1;
          firstError ??= saved.error;
        }
      }
      if (refusals > 0) {
        return {
          error: `${reference} was made with its lines, but ${refusals} of ${priced.length} prices were refused, the first: ${firstError}`,
        };
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
    const vendorId = given(v, "vendor_id", row.vendor_id);
    const storeId = given(v, "deliver_store_id", row.deliver_store_id) || null;
    // Only a vendor or store being switched to is checked; one already on the PO stays.
    const refused =
      (vendorId !== row.vendor_id ? await retired("vendors", vendorId) : null) ??
      (storeId !== row.deliver_store_id ? await retired("stores", storeId) : null);
    if (refused) return refused;
    return updatePoHeader(String(v.po_id), {
      vendorId,
      deliverStoreId: storeId,
      deliverNote: given(v, "deliver_note", row.deliver_note) || null,
      expectedBy: given(v, "expected_by", row.expected_by) || null,
      terms: given(v, "terms", row.terms) || null,
      note: given(v, "note", row.note) || null,
    });
  },
  po_charges: async (v) => {
    const refused = await gstRefused([amount(v, "gst_pct")]);
    if (refused) return refused;
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
    const charges = orNull(given(v, "amount", row.charges_amount));
    // No amount is no charges: its GST and note go with it.
    if (charges === null) {
      if (!("amount" in v) && (text(v, "gst_pct") || text(v, "note"))) {
        return { error: "That PO has no charges yet. Give their amount too." };
      }
      return updatePoCharges(String(v.po_id), { amount: null, gst_pct: null, note: null });
    }
    return updatePoCharges(String(v.po_id), {
      amount: charges,
      gst_pct: orNull(given(v, "gst_pct", row.charges_gst_pct)),
      note: given(v, "note", row.charges_note) || null,
    });
  },
  po_line_change: async (v) => {
    const switched = withDiscountSwitch(v);
    if ("error" in switched) return switched;
    const refused = await gstRefused([amount(v, "gst_pct")]);
    if (refused) return refused;
    const now = await recordNow(
      "purchase_order_lines",
      { column: "id", id: String(v.line_id) },
      LINE_COLUMNS.split(", "),
      "That line is no longer on the PO.",
    );
    if ("error" in now) return now;
    return lineSave(now.row as unknown as LineNow, switched.values);
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

/** The first refusal of checks run side by side, or null. */
async function firstRefusal(
  checks: Promise<{ error: string } | null>[],
): Promise<{ error: string } | null> {
  return (await Promise.all(checks)).find((refusal) => refusal !== null) ?? null;
}

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
