import "server-only";

import { cache } from "react";

import { requireTool } from "@/lib/auth/access";
import type { Filterable } from "@/lib/list-params";
import { labelsById, profileNames } from "@/lib/masters/names";
import { fetchAll } from "@/lib/supabase/fetch-all";
import { createClient } from "@/lib/supabase/server";
import { issueValue, recordedDraws, type BatchDraw } from "./batches";
import { findOverIssues, type OverIssueRow } from "./over-issue";

import { batchFactsById, INVENTORY_LIST_LIMIT, itemsById, listActiveStores } from "./queries";

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

export type IssueListFilters = {
  page?: number;
  projectId?: string;
  /** The store the material went out of. */
  storeId?: string;
  plotId?: string;
  /** Issue reference — already made safe by searchParam. */
  q?: string;
  /** Issued-on date range, YYYY-MM-DD, already checked by dateParam. */
  from?: string;
  to?: string;
};

export async function listStockIssues({
  page = 1,
  projectId,
  storeId,
  plotId,
  q,
  from,
  to,
}: IssueListFilters = {}): Promise<IssuePage> {
  await requireTool("/inventory");
  const supabase = await createClient();

  const pageSize = INVENTORY_LIST_LIMIT;
  const currentPage = Math.max(1, page);

  // Every filter in one place. issued_at is a date, so `to` is plain lte.
  const filtered = <T extends Filterable<T>>(query: T): T => {
    let next = query;
    if (projectId) next = next.eq("project_id", projectId);
    if (storeId) next = next.eq("store_id", storeId);
    if (plotId) next = next.eq("plot_id", plotId);
    if (from) next = next.gte("issued_at", from);
    if (to) next = next.lte("issued_at", to);
    if (q) next = next.or(`reference.ilike.*${q}*`);
    return next;
  };

  const { data, count, error } = await filtered(
    supabase
      .from("stock_issues")
      .select(
        "id, reference, store_id, to_store_id, plot_id, work_item_id, issued_at, created_by, stock_issue_lines(count), work_items(name)",
        { count: "exact" },
      ),
  )
    .order("issued_at", { ascending: false })
    .order("id")
    .range((currentPage - 1) * pageSize, currentPage * pageSize - 1);

  // A failed read is an error screen, never an empty list.
  if (error) {
    console.error("listStockIssues failed:", error);
    throw new Error("Could not read the issues.", { cause: error });
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
  project_name: string;
  /** The project's company (0101); null until Masters gives it one. */
  company_name: string | null;
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
    /** The batches it drew (0108), and any stock older than batches. */
    draws: BatchDraw[];
    /** At each batch's rate, before GST; null if any part has no rate. */
    value: number | null;
  }[];
  /** Null if any line's value is unknown — never a smaller number. */
  total_value: number | null;
};

export const getStockIssue = cache(async (issueId: string): Promise<IssueDetail | null> => {
  await requireTool("/inventory");
  const supabase = await createClient();

  const { data: issue } = await supabase
    .from("stock_issues")
    .select(
      "id, reference, store_id, to_store_id, plot_id, work_item_id, issued_at, note, created_by, work_items(name, work_categories(name)), projects(name, companies(name))",
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

  // What each line took out of the source store, batch by batch. A
  // transfer also lands the same batches in the receiving store — the
  // positive rows, not wanted here.
  const movements = lines.length
    ? await fetchAll((from, to) =>
        supabase
          .from("stock_batch_movements")
          .select("issue_line_id, receipt_line_id, quantity")
          .in(
            "issue_line_id",
            lines.map((line) => line.id),
          )
          .eq("store_id", issue.store_id)
          .lt("quantity", 0)
          .order("created_at")
          .order("id")
          .range(from, to),
      )
    : [];

  const [items, batches, stores, plots, names] = await Promise.all([
    itemsById(
      supabase,
      lines.map((line) => line.item_id),
    ),
    batchFactsById(
      supabase,
      movements.map((movement) => movement.receipt_line_id),
    ),
    labelsById(supabase, "stores", [issue.store_id, issue.to_store_id]),
    labelsById(supabase, "plots", [issue.plot_id]),
    profileNames(supabase, [
      issue.created_by,
      ...lines.map((line) => line.updated_by ?? line.created_by),
    ]),
  ]);
  const nameOf = (id: string | null | undefined) => (id ? (names.get(id) ?? null) : null);
  const project = issue.projects as { name: string; companies: { name: string } | null } | null;

  const rows = lines.map((line) => {
    const item = items.get(line.item_id);
    const draws = recordedDraws(
      line.quantity,
      movements
        .filter((movement) => movement.issue_line_id === line.id)
        .map((movement) => {
          const batch = batches.get(movement.receipt_line_id);
          return {
            receiptLineId: movement.receipt_line_id,
            label: batch?.label ?? "Batch",
            quantity: -movement.quantity,
            rate: batch?.rate ?? null,
          };
        }),
    );
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
      draws,
      value: issueValue(draws),
    };
  });

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
    project_name: project?.name ?? "—",
    company_name: project?.companies?.name ?? null,
    lines: rows,
    total_value: rows.reduce<number | null>(
      (total, row) => (total === null || row.value === null ? null : total + row.value),
      0,
    ),
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

export type AdjustmentListFilters = {
  page?: number;
  storeId?: string;
  /** Searched in the reason text — already made safe by searchParam. */
  q?: string;
  /** Dated-on range, YYYY-MM-DD, already checked by dateParam. */
  from?: string;
  to?: string;
};

export async function listStockAdjustments({
  page = 1,
  storeId,
  q,
  from,
  to,
}: AdjustmentListFilters = {}): Promise<AdjustmentPage> {
  await requireTool("/inventory");
  const supabase = await createClient();

  const pageSize = INVENTORY_LIST_LIMIT;
  const currentPage = Math.max(1, page);

  // Every filter in one place. adjusted_at is a date, so `to` is plain lte.
  const filtered = <T extends Filterable<T>>(query: T): T => {
    let next = query;
    if (storeId) next = next.eq("store_id", storeId);
    if (from) next = next.gte("adjusted_at", from);
    if (to) next = next.lte("adjusted_at", to);
    if (q) next = next.or(`reason.ilike.*${q}*`);
    return next;
  };

  const [{ data, count, error }, stores] = await Promise.all([
    filtered(
      supabase
        .from("stock_adjustments")
        .select("id, store_id, item_id, quantity, uom, reason, adjusted_at, created_by", {
          count: "exact",
        }),
    )
      .order("adjusted_at", { ascending: false })
      .order("id")
      .range((currentPage - 1) * pageSize, currentPage * pageSize - 1),
    listActiveStores(supabase),
  ]);

  // A failed read is an error screen, never an empty list.
  if (error) {
    console.error("listStockAdjustments failed:", error);
    throw new Error("Could not read the adjustments.", { cause: error });
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
