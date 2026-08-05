import "server-only";

import { requireTool } from "@/lib/auth/access";
import { fetchAll } from "@/lib/supabase/fetch-all";
import { createClient } from "@/lib/supabase/server";

import {
  INVENTORY_LIST_LIMIT,
  itemsById,
  labelsById,
  namesById,
  poReferencesById,
  type Client,
} from "./queries";

/**
 * Stock reads — the balance at every location, and how it got there.
 * The boundaries that shape everything here are documented in
 * ./queries.ts.
 */

/**
 * A store or a plot — the two kinds of place material sits. A unit and
 * its plot are the same place since 0029 (plot ↔ unit is 1:1), so the
 * stock view folds deliveries at a unit into its plot and 'unit' is no
 * longer a location kind; stale /unit/ URLs fall out here as 404s.
 */
export type LocationKind = "store" | "plot";

export function isLocationKind(value: string): value is LocationKind {
  return value === "store" || value === "plot";
}

const LOCATION_TABLE: Record<LocationKind, "stores" | "plots"> = {
  store: "stores",
  plot: "plots",
};

export type StockRow = {
  location_kind: LocationKind;
  location_id: string;
  location_name: string;
  item_id: string;
  item_name: string;
  item_code: string | null;
  item_brand: string | null;
  item_thumb_url: string | null;
  uom: string;
  quantity: number;
};

export type LocationOption = { kind: LocationKind; id: string; name: string };

export type StockPage = {
  rows: StockRow[];
  total: number;
  page: number;
  pageCount: number;
  pageSize: number;
  locations: LocationOption[];
};

/**
 * Where the material is, across all three kinds of location.
 *
 * A store row is a live balance that goes up and down. A plot row is a
 * running total of what has landed there — direct deliveries (at the
 * plot or its unit, same place since 0029) plus everything carried out
 * from a store — because nothing leaves a site through this system; it
 * is consumed by the build. Migration 0024 explains why those two
 * answers share one view but not one meaning.
 *
 * Zero-quantity store rows are kept: "had some, has none left" is a
 * different answer from "never held it", and the history behind it is
 * still worth reaching.
 */
export async function listStockByLocation({
  page = 1,
  kind,
  locationId,
}: { page?: number; kind?: LocationKind; locationId?: string } = {}): Promise<StockPage> {
  await requireTool("/inventory");
  const supabase = await createClient();

  const pageSize = INVENTORY_LIST_LIMIT;
  const currentPage = Math.max(1, page);

  let query = supabase
    .from("stock_by_location")
    .select("location_kind, location_id, item_id, quantity", { count: "exact" })
    .order("location_kind")
    .order("location_id")
    .order("item_id")
    .range((currentPage - 1) * pageSize, currentPage * pageSize - 1);
  if (kind) query = query.eq("location_kind", kind);
  if (locationId) query = query.eq("location_id", locationId);

  const [{ data, count, error }, locations] = await Promise.all([
    query,
    listStockLocations(supabase),
  ]);

  if (error) {
    console.error("listStockByLocation failed:", error);
    return { rows: [], total: 0, page: currentPage, pageCount: 1, pageSize, locations };
  }

  // View columns are all typed nullable — normalise once (see above).
  const rows = data
    .map((row) => ({
      location_kind: (row.location_kind ?? "store") as LocationKind,
      location_id: row.location_id ?? "",
      item_id: row.item_id ?? "",
      quantity: row.quantity ?? 0,
    }))
    .filter((row) => isLocationKind(row.location_kind));

  const [items, stores, plots] = await Promise.all([
    itemsById(
      supabase,
      rows.map((row) => row.item_id),
    ),
    labelsById(
      supabase,
      "stores",
      rows.filter((r) => r.location_kind === "store").map((r) => r.location_id),
    ),
    labelsById(
      supabase,
      "plots",
      rows.filter((r) => r.location_kind === "plot").map((r) => r.location_id),
    ),
  ]);
  const nameFor = (row: { location_kind: LocationKind; location_id: string }) =>
    (row.location_kind === "store" ? stores.get(row.location_id) : plots.get(row.location_id)) ??
    "—";

  const total = count ?? 0;
  return {
    // The database pages this by (kind, location, item) so pagination
    // stays stable, but uuid order reads as random on screen — so the
    // page in hand is sorted by name before it is rendered.
    rows: rows
      .map((row) => {
        const item = items.get(row.item_id);
        return {
          location_kind: row.location_kind,
          location_id: row.location_id,
          location_name: nameFor(row),
          item_id: row.item_id,
          item_name: item?.name ?? "—",
          item_code: item?.code ?? null,
          item_brand: item?.brand ?? null,
          item_thumb_url: item?.thumb_url ?? null,
          uom: item?.default_uom ?? "each",
          quantity: row.quantity,
        };
      })
      .sort(
        (a, b) =>
          a.location_name.localeCompare(b.location_name) || a.item_name.localeCompare(b.item_name),
      ),
    total,
    page: currentPage,
    pageCount: Math.max(1, Math.ceil(total / pageSize)),
    pageSize,
    locations,
  };
}

/**
 * The filter list: only places that actually hold something, so the
 * dropdown doesn't offer every plot in the company when two of them
 * have material on the ground. Read to completion — a location missing
 * here cannot be filtered to.
 */
async function listStockLocations(supabase: Client): Promise<LocationOption[]> {
  const data = await fetchAll((from, to) =>
    supabase
      .from("stock_by_location")
      .select("location_kind, location_id")
      .order("location_kind")
      .order("location_id")
      .range(from, to),
  );

  const seen = new Map<string, { kind: LocationKind; id: string }>();
  for (const row of data) {
    const kind = row.location_kind ?? "";
    const id = row.location_id ?? "";
    if (!isLocationKind(kind) || !id) continue;
    seen.set(`${kind}:${id}`, { kind, id });
  }
  const wanted = [...seen.values()];

  const [stores, plots] = await Promise.all([
    labelsById(
      supabase,
      "stores",
      wanted.filter((l) => l.kind === "store").map((l) => l.id),
    ),
    labelsById(
      supabase,
      "plots",
      wanted.filter((l) => l.kind === "plot").map((l) => l.id),
    ),
  ]);

  return wanted
    .map((location) => ({
      ...location,
      name: (location.kind === "store" ? stores.get(location.id) : plots.get(location.id)) ?? "—",
    }))
    .sort((a, b) => a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name));
}

export type MovementRow = {
  id: string;
  kind: "receipt" | "issue" | "transfer_in" | "adjustment";
  /** What it did to this store's holding: signed. */
  quantity: number;
  uom: string;
  at: string;
  reference: string;
  /** Where it came from or went, in words. */
  counterparty: string;
  note: string | null;
  actor_name: string | null;
  /** Where the row lives, for the "open it" link. */
  href: string | null;
};

export type ItemMovements = {
  location_kind: LocationKind;
  location_id: string;
  location_name: string;
  item_id: string;
  item_name: string;
  item_code: string | null;
  item_thumb_url: string | null;
  balance: number;
  movements: MovementRow[];
};

/**
 * Every movement of one item at one location, newest first — the answer
 * to "why does it say 40?". The sources are read separately and merged
 * here rather than in SQL, because each carries a different counterparty
 * (a PO, a destination, a reason).
 *
 * A store sees all four kinds. A plot only ever sees things arriving —
 * direct deliveries and material carried out from a store — because
 * nothing leaves a site through this system (migration 0024).
 */
export async function getItemMovements(
  kind: LocationKind,
  locationId: string,
  itemId: string,
): Promise<ItemMovements | null> {
  await requireTool("/inventory");
  const supabase = await createClient();

  const [locationNames, items] = await Promise.all([
    labelsById(supabase, LOCATION_TABLE[kind], [locationId]),
    itemsById(supabase, [itemId]),
  ]);
  const locationName = locationNames.get(locationId);
  if (!locationName) return null;
  const item = items.get(itemId);
  const isStore = kind === "store";

  // A delivery to a unit landed at its plot (1:1 since 0029), so a
  // plot's history must match receipts recorded against either id.
  const { data: plotUnit } = isStore
    ? { data: null }
    : await supabase.from("units").select("id").eq("plot_id", locationId).maybeSingle();
  const unitId = plotUnit?.id ?? null;

  // Each source read to completion — a movement list that silently
  // stops short would not add up to the balance shown above it. The
  // location predicate is pushed into the query via the !inner join:
  // un-filtered, a common material held at ten sites paid for ten
  // locations' history to show one.
  const [receiptLines, issueLines, adjustments] = await Promise.all([
    fetchAll((from, to) => {
      let query = supabase
        .from("goods_receipt_lines")
        .select(
          "id, quantity, uom, note, created_at, created_by, receipt_id, goods_receipts!inner(id, reference, store_id, to_site, plot_id, unit_id, received_at, po_id)",
        )
        .eq("item_id", itemId);
      query = isStore
        ? query.eq("goods_receipts.store_id", locationId)
        : query
            .eq("goods_receipts.to_site", true)
            .or(
              unitId ? `plot_id.eq.${locationId},unit_id.eq.${unitId}` : `plot_id.eq.${locationId}`,
              { referencedTable: "goods_receipts" },
            );
      return query.order("id").range(from, to);
    }),
    fetchAll((from, to) =>
      supabase
        .from("stock_issue_lines")
        .select(
          "id, quantity, uom, note, created_at, created_by, issue_id, stock_issues!inner(id, reference, store_id, to_store_id, plot_id, issued_at)",
        )
        .eq("item_id", itemId)
        .or(
          isStore
            ? `store_id.eq.${locationId},to_store_id.eq.${locationId}`
            : `plot_id.eq.${locationId}`,
          { referencedTable: "stock_issues" },
        )
        .order("id")
        .range(from, to),
    ),
    // Adjustments only ever apply to a store — a site has no balance to
    // correct, so this read is skipped entirely for a plot.
    isStore
      ? fetchAll((from, to) =>
          supabase
            .from("stock_adjustments")
            .select("id, quantity, uom, reason, adjusted_at, created_at, created_by")
            .eq("item_id", itemId)
            .eq("store_id", locationId)
            .order("id")
            .range(from, to),
        )
      : Promise.resolve([] as never[]),
  ]);

  type ReceiptParent = {
    id: string;
    reference: string;
    store_id: string | null;
    to_site: boolean;
    plot_id: string | null;
    unit_id: string | null;
    received_at: string;
    po_id: string;
  };
  type IssueParent = {
    id: string;
    reference: string;
    store_id: string;
    to_store_id: string | null;
    plot_id: string | null;
    issued_at: string;
  };

  /** Did this delivery land at the location being looked at? A receipt
   * recorded against the plot's unit is the same place. */
  const receivedHere = (parent: ReceiptParent | null) => {
    if (!parent) return false;
    if (isStore) return parent.store_id === locationId;
    if (!parent.to_site) return false;
    return parent.plot_id === locationId || (unitId !== null && parent.unit_id === unitId);
  };

  const receipts = receiptLines.filter((line) =>
    receivedHere(line.goods_receipts as ReceiptParent | null),
  );
  const issuesOut = isStore
    ? issueLines.filter(
        (line) => (line.stock_issues as IssueParent | null)?.store_id === locationId,
      )
    : [];
  // Arriving: a transfer into this store, or — for a plot — material
  // carried out to it from a store (an issue goes to a store or a
  // plot, 0023 §3).
  const transfersIn = issueLines.filter((line) => {
    const parent = line.stock_issues as IssueParent | null;
    if (!parent) return false;
    return isStore ? parent.to_store_id === locationId : parent.plot_id === locationId;
  });

  const [poRefs, otherStores, plots, nameOf] = await Promise.all([
    poReferencesById(
      supabase,
      receipts.map((line) => (line.goods_receipts as ReceiptParent).po_id),
    ),
    labelsById(supabase, "stores", [
      ...issuesOut.map((line) => (line.stock_issues as IssueParent).to_store_id),
      ...transfersIn.map((line) => (line.stock_issues as IssueParent).store_id),
    ]),
    labelsById(supabase, "plots", [
      ...issuesOut.map((line) => (line.stock_issues as IssueParent).plot_id),
    ]),
    namesById(supabase, [
      ...receipts.map((l) => l.created_by),
      ...issuesOut.map((l) => l.created_by),
      ...transfersIn.map((l) => l.created_by),
      ...adjustments.map((a) => a.created_by),
    ]),
  ]);

  const movements: MovementRow[] = [
    ...receipts.map((line): MovementRow => {
      const parent = line.goods_receipts as ReceiptParent;
      return {
        id: line.id,
        kind: "receipt",
        quantity: line.quantity,
        uom: line.uom,
        at: parent.received_at,
        reference: parent.reference,
        counterparty: poRefs.get(parent.po_id) ?? "a purchase order",
        note: line.note,
        actor_name: nameOf(line.created_by),
        href: `/inventory/receipts/${parent.id}`,
      };
    }),
    ...issuesOut.map((line): MovementRow => {
      const parent = line.stock_issues as IssueParent;
      return {
        id: line.id,
        kind: "issue",
        quantity: -line.quantity,
        uom: line.uom,
        at: parent.issued_at,
        reference: parent.reference,
        counterparty: parent.to_store_id
          ? `${otherStores.get(parent.to_store_id) ?? "another store"} (transfer)`
          : (plots.get(parent.plot_id ?? "") ?? "site"),
        note: line.note,
        actor_name: nameOf(line.created_by),
        href: `/inventory/issues/${parent.id}`,
      };
    }),
    ...transfersIn.map((line): MovementRow => {
      const parent = line.stock_issues as IssueParent;
      return {
        id: line.id,
        kind: "transfer_in",
        quantity: line.quantity,
        uom: line.uom,
        at: parent.issued_at,
        reference: parent.reference,
        counterparty: `${otherStores.get(parent.store_id) ?? "another store"}${isStore ? " (transfer)" : ""}`,
        note: line.note,
        actor_name: nameOf(line.created_by),
        href: `/inventory/issues/${parent.id}`,
      };
    }),
    ...adjustments.map((row): MovementRow => {
      return {
        id: row.id,
        kind: "adjustment",
        quantity: row.quantity,
        uom: row.uom,
        at: row.adjusted_at,
        reference: "Adjustment",
        counterparty: row.reason,
        note: null,
        actor_name: nameOf(row.created_by),
        href: null,
      };
    }),
  ].sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));

  return {
    location_kind: kind,
    location_id: locationId,
    location_name: locationName,
    item_id: itemId,
    item_name: item?.name ?? "—",
    item_code: item?.code ?? null,
    item_thumb_url: item?.thumb_url ?? null,
    balance: movements.reduce((total, movement) => total + movement.quantity, 0),
    movements,
  };
}

/**
 * What a store holds, for the issue form's picker. Reads stock_on_hand,
 * NOT stock_by_location: only a store has a balance that can be drawn
 * down, and this list is what the negative-stock guard will be checked
 * against.
 */
export type StoreHolding = {
  store_id: string;
  store_name: string;
  item_id: string;
  item_name: string;
  item_code: string | null;
  item_brand: string | null;
  item_thumb_url: string | null;
  uom: string;
  quantity: number;
};

export async function listStoreHoldings(storeId: string): Promise<StoreHolding[]> {
  await requireTool("/inventory");
  const supabase = await createClient();

  // Completeness-critical: an item missing here cannot be issued.
  const data = await fetchAll((from, to) =>
    supabase
      .from("stock_on_hand")
      .select("store_id, item_id, quantity")
      .eq("store_id", storeId)
      .order("item_id")
      .range(from, to),
  );

  const rows = data.filter((row) => (row.quantity ?? 0) > 0);
  const [items, storeNames] = await Promise.all([
    itemsById(
      supabase,
      rows.map((row) => row.item_id ?? ""),
    ),
    labelsById(supabase, "stores", [storeId]),
  ]);

  return rows
    .map((row) => {
      const item = items.get(row.item_id ?? "");
      return {
        store_id: storeId,
        store_name: storeNames.get(storeId) ?? "—",
        item_id: row.item_id ?? "",
        item_name: item?.name ?? "—",
        item_code: item?.code ?? null,
        item_brand: item?.brand ?? null,
        item_thumb_url: item?.thumb_url ?? null,
        uom: item?.default_uom ?? "each",
        quantity: row.quantity ?? 0,
      };
    })
    .sort((a, b) => a.item_name.localeCompare(b.item_name));
}
