import "server-only";

import { cache } from "react";

import { requireTool } from "@/lib/auth/access";
import { labelsById, profileNames } from "@/lib/masters/names";
import { fetchAll } from "@/lib/supabase/fetch-all";
import { createClient } from "@/lib/supabase/server";
import { findOverIssues, type OverIssueRow } from "./over-issue";

import { INVENTORY_LIST_LIMIT, itemsById, listActiveStores } from "./queries";

/**
 * Issues and adjustments reads — material leaving a store (to a site or
 * another store) and balance corrections. The boundaries that shape
 * everything here are documented in ./queries.ts.
 */

export type IssueSummary = {
  id: string;
  reference: string;
  store_name: string;
  destination: string;
  /** The work a plot issue served (0080); null for transfers and history. */
  work_name: string | null;
  issued_at: string;
  line_count: number;
  issued_by_name: string | null;
};

export type IssuePage = {
  issues: IssueSummary[];
  total: number;
  page: number;
  pageCount: number;
  pageSize: number;
};

export async function listStockIssues({ page = 1 }: { page?: number } = {}): Promise<IssuePage> {
  await requireTool("/inventory");
  const supabase = await createClient();

  const pageSize = INVENTORY_LIST_LIMIT;
  const currentPage = Math.max(1, page);

  const { data, count, error } = await supabase
    .from("stock_issues")
    .select(
      "id, reference, store_id, to_store_id, plot_id, work_item_id, issued_at, created_by, stock_issue_lines(count), work_items(name)",
      { count: "exact" },
    )
    .order("issued_at", { ascending: false })
    .order("id")
    .range((currentPage - 1) * pageSize, currentPage * pageSize - 1);

  if (error) {
    console.error("listStockIssues failed:", error);
    return { issues: [], total: 0, page: currentPage, pageCount: 1, pageSize };
  }

  const rows = data ?? [];
  const [stores, plots, names] = await Promise.all([
    labelsById(supabase, "stores", [
      ...rows.map((r) => r.store_id),
      ...rows.map((r) => r.to_store_id),
    ]),
    labelsById(
      supabase,
      "plots",
      rows.map((r) => r.plot_id),
    ),
    profileNames(
      supabase,
      rows.map((r) => r.created_by),
    ),
  ]);
  const nameOf = (id: string | null | undefined) => (id ? (names.get(id) ?? null) : null);

  const total = count ?? 0;
  return {
    issues: rows.map((row) => ({
      id: row.id,
      reference: row.reference ?? "—",
      store_name: stores.get(row.store_id) ?? "—",
      destination: row.to_store_id
        ? `${stores.get(row.to_store_id) ?? "another store"} (transfer)`
        : (plots.get(row.plot_id ?? "") ?? "—"),
      work_name: (row.work_items as { name: string } | null)?.name ?? null,
      issued_at: row.issued_at,
      line_count: (row.stock_issue_lines as { count: number }[] | null)?.[0]?.count ?? 0,
      issued_by_name: nameOf(row.created_by),
    })),
    total,
    page: currentPage,
    pageCount: Math.max(1, Math.ceil(total / pageSize)),
    pageSize,
  };
}

export type IssueDetail = {
  id: string;
  reference: string;
  store_name: string;
  destination: string;
  is_transfer: boolean;
  plot_id: string | null;
  /** The work a plot issue served (0080), with its category as the stage. */
  work_item_id: string | null;
  work_name: string | null;
  work_category: string | null;
  issued_at: string;
  note: string | null;
  issued_by_name: string | null;
  lines: {
    id: string;
    item_name: string;
    item_code: string | null;
    item_brand: string | null;
    item_thumb_url: string | null;
    quantity: number;
    uom: string;
    note: string | null;
    recorded_by_name: string | null;
  }[];
};

export const getStockIssue = cache(async (issueId: string): Promise<IssueDetail | null> => {
  await requireTool("/inventory");
  const supabase = await createClient();

  const { data: issue } = await supabase
    .from("stock_issues")
    .select(
      "id, reference, store_id, to_store_id, plot_id, work_item_id, issued_at, note, created_by, work_items(name, work_categories(name))",
    )
    .eq("id", issueId)
    .maybeSingle();
  if (!issue) return null;

  const lines = await fetchAll((from, to) =>
    supabase
      .from("stock_issue_lines")
      .select("id, item_id, quantity, uom, note, created_by, updated_by")
      .eq("issue_id", issueId)
      .order("created_at")
      .order("id")
      .range(from, to),
  );

  const [items, stores, plots, names] = await Promise.all([
    itemsById(
      supabase,
      lines.map((line) => line.item_id),
    ),
    labelsById(supabase, "stores", [issue.store_id, issue.to_store_id]),
    labelsById(supabase, "plots", [issue.plot_id]),
    profileNames(supabase, [
      issue.created_by,
      ...lines.map((line) => line.updated_by ?? line.created_by),
    ]),
  ]);
  const nameOf = (id: string | null | undefined) => (id ? (names.get(id) ?? null) : null);

  return {
    id: issue.id,
    reference: issue.reference ?? "—",
    store_name: stores.get(issue.store_id) ?? "—",
    destination: issue.to_store_id
      ? (stores.get(issue.to_store_id) ?? "another store")
      : (plots.get(issue.plot_id ?? "") ?? "—"),
    is_transfer: issue.to_store_id != null,
    plot_id: issue.plot_id,
    work_item_id: issue.work_item_id,
    work_name:
      (issue.work_items as { name: string; work_categories: { name: string } | null } | null)
        ?.name ?? null,
    work_category:
      (issue.work_items as { name: string; work_categories: { name: string } | null } | null)
        ?.work_categories?.name ?? null,
    issued_at: issue.issued_at,
    note: issue.note,
    issued_by_name: nameOf(issue.created_by),
    lines: lines.map((line) => {
      const item = items.get(line.item_id);
      return {
        id: line.id,
        item_name: item?.name ?? "—",
        item_code: item?.code ?? null,
        item_brand: item?.brand ?? null,
        item_thumb_url: item?.thumb_url ?? null,
        quantity: line.quantity,
        uom: line.uom,
        note: line.note,
        recorded_by_name: nameOf(line.updated_by ?? line.created_by),
      };
    }),
  };
});

export type IssueFormOptions = {
  stores: { id: string; name: string; project_id: string | null }[];
  plots: { id: string; name: string; project_name: string }[];
  projects: { id: string; name: string }[];
};

/** Everything the issue form needs, in one gated call. */
export async function getIssueFormOptions(): Promise<IssueFormOptions> {
  await requireTool("/inventory");
  const supabase = await createClient();

  const [stores, plots, projects] = await Promise.all([
    fetchAll((from, to) =>
      supabase
        .from("stores")
        .select("id, name, project_id")
        .eq("is_active", true)
        .order("name")
        .order("id")
        .range(from, to),
    ),
    fetchAll((from, to) =>
      supabase
        .from("plots")
        .select("id, name, projects(name)")
        .order("name")
        .order("id")
        .range(from, to),
    ),
    fetchAll((from, to) =>
      supabase.from("projects").select("id, name").order("name").order("id").range(from, to),
    ),
  ]);

  return {
    stores: stores.map(({ id, name, project_id }) => ({ id, name, project_id })),
    plots: plots.map((plot) => ({
      id: plot.id,
      name: plot.name,
      project_name: (plot.projects as { name: string } | null)?.name ?? "—",
    })),
    projects: projects.map(({ id, name }) => ({ id, name })),
  };
}

export type AdjustmentRow = {
  id: string;
  store_name: string;
  item_name: string;
  item_code: string | null;
  item_thumb_url: string | null;
  quantity: number;
  uom: string;
  reason: string;
  adjusted_at: string;
  adjusted_by_name: string | null;
};

export type AdjustmentPage = {
  adjustments: AdjustmentRow[];
  total: number;
  page: number;
  pageCount: number;
  pageSize: number;
  stores: { id: string; name: string }[];
};

export async function listStockAdjustments({
  page = 1,
}: { page?: number } = {}): Promise<AdjustmentPage> {
  await requireTool("/inventory");
  const supabase = await createClient();

  const pageSize = INVENTORY_LIST_LIMIT;
  const currentPage = Math.max(1, page);

  const [{ data, count, error }, stores] = await Promise.all([
    supabase
      .from("stock_adjustments")
      .select("id, store_id, item_id, quantity, uom, reason, adjusted_at, created_by", {
        count: "exact",
      })
      .order("adjusted_at", { ascending: false })
      .order("id")
      .range((currentPage - 1) * pageSize, currentPage * pageSize - 1),
    listActiveStores(supabase),
  ]);

  if (error) {
    console.error("listStockAdjustments failed:", error);
    return { adjustments: [], total: 0, page: currentPage, pageCount: 1, pageSize, stores };
  }

  const rows = data ?? [];
  const [items, storeNames, names] = await Promise.all([
    itemsById(
      supabase,
      rows.map((row) => row.item_id),
    ),
    labelsById(
      supabase,
      "stores",
      rows.map((row) => row.store_id),
    ),
    profileNames(
      supabase,
      rows.map((row) => row.created_by),
    ),
  ]);
  const nameOf = (id: string | null | undefined) => (id ? (names.get(id) ?? null) : null);

  const total = count ?? 0;
  return {
    adjustments: rows.map((row) => {
      const item = items.get(row.item_id);
      return {
        id: row.id,
        store_name: storeNames.get(row.store_id) ?? "—",
        item_name: item?.name ?? "—",
        item_code: item?.code ?? null,
        item_thumb_url: item?.thumb_url ?? null,
        quantity: row.quantity,
        uom: row.uom,
        reason: row.reason,
        adjusted_at: row.adjusted_at,
        adjusted_by_name: nameOf(row.created_by),
      };
    }),
    total,
    page: currentPage,
    pageCount: Math.max(1, Math.ceil(total / pageSize)),
    pageSize,
    stores,
  };
}

/* ------------------------------------------------------------------ *
 * Over-issue check (Phase 2 Step I) — flag, never refuse
 *
 * Rendered on the issue note, so the store-keeper sees it the moment
 * the redirect lands after saving, and anyone opening the note later
 * sees the same truth. Derived fresh every time (the 0083 principle:
 * nothing stored means nothing stale) from the frozen takeoff in
 * estimate_takeoff_facts — which admits /inventory since 0078 and
 * carries no rates — plus the plot's cumulative movements for the same
 * work. The arithmetic itself is lib/inventory/over-issue.ts, pure and
 * tested.
 * ------------------------------------------------------------------ */

export async function getOverIssueRows(
  plotId: string,
  workItemId: string,
): Promise<OverIssueRow[]> {
  await requireTool("/inventory");
  const supabase = await createClient();

  const { data: unit, error: unitError } = await supabase
    .from("units")
    .select("id")
    .eq("plot_id", plotId)
    .maybeSingle();
  if (unitError) {
    console.error("inventory: over-issue unit lookup failed:", unitError);
    return [];
  }
  if (!unit) return [];

  const takeoffRaw = await fetchAll<{
    material_name: string | null;
    uom: string | null;
    quantity: number | null;
    item_id: string | null;
    item_uom_factor: number | null;
  }>((from, to) =>
    supabase
      .from("estimate_takeoff_facts")
      .select("material_name, uom, quantity, item_id, item_uom_factor")
      .eq("unit_id", unit.id)
      .eq("work_item_id", workItemId)
      .order("material_id")
      .range(from, to),
  );
  const takeoff = takeoffRaw
    .filter((row) => row.material_name !== null && row.uom !== null && row.quantity !== null)
    .map((row) => ({
      materialName: row.material_name as string,
      uom: row.uom as string,
      quantity: row.quantity as number,
      itemId: row.item_id,
      itemUomFactor: row.item_uom_factor,
    }));
  if (takeoff.length === 0) return [];

  // Everything this work has drawn at this plot: store issues plus
  // direct-to-site deliveries (matched on plot OR unit — a to-site GRN
  // carries whichever its PO named).
  const [issues, receipts] = await Promise.all([
    fetchAll<{ id: string }>((from, to) =>
      supabase
        .from("stock_issues")
        .select("id")
        .eq("plot_id", plotId)
        .eq("work_item_id", workItemId)
        .order("id")
        .range(from, to),
    ),
    fetchAll<{ id: string }>((from, to) =>
      supabase
        .from("goods_receipts")
        .select("id")
        .eq("to_site", true)
        .eq("work_item_id", workItemId)
        .or(`plot_id.eq.${plotId},unit_id.eq.${unit.id}`)
        .order("id")
        .range(from, to),
    ),
  ]);

  const [issueLines, receiptLines] = await Promise.all([
    issues.length
      ? fetchAll<{ item_id: string; quantity: number }>((from, to) =>
          supabase
            .from("stock_issue_lines")
            .select("item_id, quantity")
            .in(
              "issue_id",
              issues.map((issue) => issue.id),
            )
            .order("id")
            .range(from, to),
        )
      : Promise.resolve([]),
    receipts.length
      ? fetchAll<{ item_id: string; quantity: number }>((from, to) =>
          supabase
            .from("goods_receipt_lines")
            .select("item_id, quantity")
            .in(
              "receipt_id",
              receipts.map((receipt) => receipt.id),
            )
            .order("id")
            .range(from, to),
        )
      : Promise.resolve([]),
  ]);

  const drawnByItem = new Map<string, number>();
  for (const line of [...issueLines, ...receiptLines]) {
    drawnByItem.set(line.item_id, (drawnByItem.get(line.item_id) ?? 0) + line.quantity);
  }
  if (drawnByItem.size === 0) return [];

  const itemIds = [...drawnByItem.keys()];
  const { data: items, error: itemsError } = await supabase
    .from("items")
    .select("id, default_uom")
    .in("id", itemIds);
  if (itemsError) {
    console.error("inventory: over-issue items lookup failed:", itemsError);
    return [];
  }
  const itemUomById = new Map((items ?? []).map((item) => [item.id, item.default_uom as string]));

  return findOverIssues(takeoff, drawnByItem, itemUomById);
}
