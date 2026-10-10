/**
 * A PO from an indent (plan.md, B3) — the pure rules, no database.
 *
 * The founder's chain: you don't make a PO, you pick an approved indent
 * and go. Its remaining lines appear, each gets a vendor (the last one
 * that item was bought from suggested, with that vendor's last rate),
 * and Create makes one draft PO per vendor.
 */

/** A PO line pointing at an indent line, with its PO's status. */
export type OrderedRow = { indent_line_id: string | null; quantity: number; status: string };

/** Ordered so far per indent line, across every PO that is not cancelled. */
export function orderedByIndentLine(rows: OrderedRow[]): Map<string, number> {
  const ordered = new Map<string, number>();
  for (const row of rows) {
    if (row.indent_line_id == null || row.status === "cancelled") continue;
    ordered.set(row.indent_line_id, (ordered.get(row.indent_line_id) ?? 0) + row.quantity);
  }
  return ordered;
}

/** Approved minus ordered, never below zero — the indents' stillToBuy rounding. */
export function leftToBuy(approved: number, ordered: number): number {
  return Math.max(0, Math.round((approved - ordered) * 1e6) / 1e6);
}

/** One past purchase of an item: which vendor, at what price, when. */
export type PurchaseRow = {
  item_id: string;
  vendor_id: string;
  rate: number | null;
  gst_pct: number | null;
  /** When the PO was issued (or made, if never issued). */
  at: string;
  status: string;
};

export type PriceSuggestion = { rate: number | null; gstPct: number | null };
export type VendorSuggestion = PriceSuggestion & { vendorId: string };

/** The key of one vendor's price for one item. */
export const priceKey = (itemId: string, vendorId: string) => `${itemId}|${vendorId}`;

/** POs that went to a vendor: a draft was never a purchase, a cancelled one was undone. */
const BOUGHT = new Set(["issued", "deletion_requested", "completed"]);

/**
 * What was last paid: per item, the vendor it was last bought from with
 * that rate and GST; and per item and vendor, that vendor's last price —
 * so picking another vendor suggests their rate. Only issued POs count,
 * and only lines that carried a rate.
 */
export function purchaseHistory(rows: PurchaseRow[]): {
  lastVendor: Map<string, VendorSuggestion>;
  lastPrice: Map<string, PriceSuggestion>;
} {
  const lastVendor = new Map<string, VendorSuggestion>();
  const lastPrice = new Map<string, PriceSuggestion>();
  const newestFirst = rows
    .filter((row) => BOUGHT.has(row.status) && row.rate !== null)
    .sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
  for (const row of newestFirst) {
    const price = { rate: row.rate, gstPct: row.gst_pct };
    if (!lastVendor.has(row.item_id)) {
      lastVendor.set(row.item_id, { vendorId: row.vendor_id, ...price });
    }
    const key = priceKey(row.item_id, row.vendor_id);
    if (!lastPrice.has(key)) lastPrice.set(key, price);
  }
  return { lastVendor, lastPrice };
}

/** One ticked line on the from-indent screen. */
export type IndentPick = {
  indentLineId: string;
  quantity: number;
  vendorId: string;
  rate: number | null;
  gstPct: number | null;
};

/** What stops Create, in words — or undefined. `left` is per indent line. */
export function picksProblem(picks: IndentPick[], left: Map<string, number>): string | undefined {
  if (picks.length === 0) return "Tick at least one line to order.";
  const seen = new Set<string>();
  for (const pick of picks) {
    if (seen.has(pick.indentLineId)) return "A line is ticked twice.";
    seen.add(pick.indentLineId);
    if (!left.has(pick.indentLineId)) return "A ticked line is no longer on this indent.";
    if (!pick.vendorId) return "Every ticked line needs a vendor.";
    if (!(Number.isFinite(pick.quantity) && pick.quantity > 0)) {
      return "Quantities must be more than 0.";
    }
    if (pick.quantity > (left.get(pick.indentLineId) ?? 0) + 1e-9) {
      return "A quantity is more than is left to buy on its line.";
    }
    if (pick.rate !== null && !(Number.isFinite(pick.rate) && pick.rate >= 0)) {
      return "A rate can't be negative.";
    }
    if (pick.gstPct !== null && !(Number.isFinite(pick.gstPct) && pick.gstPct >= 0)) {
      return "Pick a GST rate from the list.";
    }
  }
  return undefined;
}

/** The picks as one draft PO per vendor, vendors in the order they first appear. */
export function splitByVendor(picks: IndentPick[]): { vendorId: string; lines: IndentPick[] }[] {
  const groups = new Map<string, IndentPick[]>();
  for (const pick of picks) {
    const group = groups.get(pick.vendorId) ?? [];
    group.push(pick);
    groups.set(pick.vendorId, group);
  }
  return [...groups.entries()].map(([vendorId, lines]) => ({ vendorId, lines }));
}
