import "server-only";

import { requireTool } from "@/lib/auth/access";
import { labelsById, profileNames } from "@/lib/masters/names";
import { fetchAll } from "@/lib/supabase/fetch-all";
import { createClient } from "@/lib/supabase/server";

import type { Batch } from "./batches";
import {
  batchFactsById,
  INVENTORY_LIST_LIMIT,
  itemsById,
  matchingItemIds,
  poReferencesById,
  type Client,
} from "./queries";

/** A store or a plot. A unit is its plot (0029), so 'unit' is not a kind; stale /unit/ URLs 404. */
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
  searchCapped: boolean;
};

// A store row is a live balance; a plot row is a running total of what landed (nothing leaves a site, 0024).
// Zero-quantity store rows stay: "had some, has none" differs from "never held it".
export async function listStockByLocation({
  page = 1,
  kind,
  locationId,
  q,
}: {
  page?: number;
  kind?: LocationKind;
  locationId?: string;
  q?: string;
} = {}): Promise<StockPage> {
  await requireTool("/inventory");
  const supabase = await createClient();

  const pageSize = INVENTORY_LIST_LIMIT;
  const currentPage = Math.max(1, page);

  const found = q ? await matchingItemIds(supabase, q, ["name", "code"]) : null;
  if (found && found.ids.length === 0) {
    const locations = await listStockLocations(supabase);
    return {
      rows: [],
      total: 0,
      page: currentPage,
      pageCount: 1,
      pageSize,
      locations,
      searchCapped: false,
    };
  }

  let query = supabase
    .from("stock_by_location")
    .select("location_kind, location_id, item_id, quantity", { count: "exact" });
  if (kind) query = query.eq("location_kind", kind);
  if (locationId) query = query.eq("location_id", locationId);
  if (found) query = query.in("item_id", found.ids);

  const [{ data, count, error }, locations] = await Promise.all([
    query
      .order("location_kind")
      .order("location_id")
      .order("item_id")
      .range((currentPage - 1) * pageSize, currentPage * pageSize - 1),
    listStockLocations(supabase),
  ]);

  if (error) {
    console.error("listStockByLocation failed:", error);
    throw new Error("Could not read the stock.", { cause: error });
  }

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
    // Paged by (kind, location, item) for stability, then sorted by name for the screen.
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
    searchCapped: found?.capped ?? false,
  };
}

/** Only places that hold something, read to completion so none is unfilterable. */
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
  quantity: number;
  uom: string;
  at: string;
  reference: string;
  counterparty: string;
  note: string | null;
  actor_name: string | null;
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

// Every movement of one item at one location, newest first. Sources are read separately and merged
// here (each has a different counterparty). A plot only sees arrivals (0024).
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

  // A unit's delivery landed at its plot (0029): match receipts against either id.
  const { data: plotUnit } = isStore
    ? { data: null }
    : await supabase.from("units").select("id").eq("plot_id", locationId).maybeSingle();
  const unitId = plotUnit?.id ?? null;

  // Each source read to completion so the list adds up to the balance; the !inner join pushes the location filter into the query.
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
    // Adjustments only apply to a store; skipped for a plot.
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
  // Arriving: a transfer into this store, or for a plot, material carried out to it (0023 §3).
  const transfersIn = issueLines.filter((line) => {
    const parent = line.stock_issues as IssueParent | null;
    if (!parent) return false;
    return isStore ? parent.to_store_id === locationId : parent.plot_id === locationId;
  });

  const [poRefs, otherStores, plots, names] = await Promise.all([
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
    profileNames(supabase, [
      ...receipts.map((l) => l.created_by),
      ...issuesOut.map((l) => l.created_by),
      ...transfersIn.map((l) => l.created_by),
      ...adjustments.map((a) => a.created_by),
    ]),
  ]);
  const nameOf = (id: string | null | undefined) => (id ? (names.get(id) ?? null) : null);

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

/** A store's holdings for the issue picker, from stock_on_hand (only stores can be drawn down). */
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

/** A store's batches per item, oldest first (the issue's draw order), from batch_on_hand; pre-batch stock has no row. */
export async function listStoreBatches(
  storeId: string,
  itemId?: string,
): Promise<Record<string, Batch[]>> {
  await requireTool("/inventory");
  const supabase = await createClient();

  // Completeness: a missing batch would preview as stock with no rate.
  const data = await fetchAll((from, to) => {
    let query = supabase
      .from("batch_on_hand")
      .select("receipt_line_id, item_id, quantity")
      .eq("store_id", storeId)
      .gt("quantity", 0);
    if (itemId) query = query.eq("item_id", itemId);
    return query.order("receipt_line_id").range(from, to);
  });
  const rows = data.filter(
    (row): row is { receipt_line_id: string; item_id: string; quantity: number } =>
      row.receipt_line_id != null && row.item_id != null && row.quantity != null,
  );
  const facts = await batchFactsById(
    supabase,
    rows.map((row) => row.receipt_line_id),
  );

  const byItem: Record<string, Batch[]> = {};
  for (const row of rows) {
    const batch = facts.get(row.receipt_line_id);
    (byItem[row.item_id] ??= []).push({
      receiptLineId: row.receipt_line_id,
      label: batch?.label ?? "Batch",
      receivedAt: batch?.receivedAt ?? "",
      quantity: row.quantity,
      rate: batch?.rate ?? null,
    });
  }
  for (const batches of Object.values(byItem)) {
    batches.sort(
      (a, b) =>
        a.receivedAt.localeCompare(b.receivedAt) || a.receiptLineId.localeCompare(b.receiptLineId),
    );
  }
  return byItem;
}

export async function listStoreHoldings(storeId: string): Promise<StoreHolding[]> {
  await requireTool("/inventory");
  const supabase = await createClient();

  // Completeness: an item missing here cannot be issued.
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
