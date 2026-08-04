import "server-only";

import { cache } from "react";

import { requireTool } from "@/lib/auth/access";
import { fetchAll } from "@/lib/supabase/fetch-all";
import { createClient } from "@/lib/supabase/server";

import {
  INVENTORY_LIST_LIMIT,
  itemsById,
  labelsById,
  listActiveStores,
  namesById,
} from "./queries";

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
      "id, reference, store_id, to_store_id, plot_id, issued_at, created_by, stock_issue_lines(count)",
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
  const [stores, plots, nameOf] = await Promise.all([
    labelsById(supabase, "stores", [
      ...rows.map((r) => r.store_id),
      ...rows.map((r) => r.to_store_id),
    ]),
    labelsById(
      supabase,
      "plots",
      rows.map((r) => r.plot_id),
    ),
    namesById(
      supabase,
      rows.map((r) => r.created_by),
    ),
  ]);

  const total = count ?? 0;
  return {
    issues: rows.map((row) => ({
      id: row.id,
      reference: row.reference ?? "—",
      store_name: stores.get(row.store_id) ?? "—",
      destination: row.to_store_id
        ? `${stores.get(row.to_store_id) ?? "another store"} (transfer)`
        : (plots.get(row.plot_id ?? "") ?? "—"),
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
    .select("id, reference, store_id, to_store_id, plot_id, issued_at, note, created_by")
    .eq("id", issueId)
    .maybeSingle();
  if (!issue) return null;

  const { data: lines } = await fetchAll((from, to) =>
    supabase
      .from("stock_issue_lines")
      .select("id, item_id, quantity, uom, note, created_by, updated_by")
      .eq("issue_id", issueId)
      .order("created_at")
      .order("id")
      .range(from, to),
  );

  const [items, stores, plots, nameOf] = await Promise.all([
    itemsById(
      supabase,
      (lines ?? []).map((line) => line.item_id),
    ),
    labelsById(supabase, "stores", [issue.store_id, issue.to_store_id]),
    labelsById(supabase, "plots", [issue.plot_id]),
    namesById(supabase, [
      issue.created_by,
      ...(lines ?? []).map((line) => line.updated_by ?? line.created_by),
    ]),
  ]);

  return {
    id: issue.id,
    reference: issue.reference ?? "—",
    store_name: stores.get(issue.store_id) ?? "—",
    destination: issue.to_store_id
      ? (stores.get(issue.to_store_id) ?? "another store")
      : (plots.get(issue.plot_id ?? "") ?? "—"),
    is_transfer: issue.to_store_id != null,
    issued_at: issue.issued_at,
    note: issue.note,
    issued_by_name: nameOf(issue.created_by),
    lines: (lines ?? []).map((line) => {
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

  const [{ data: stores }, { data: plots }, { data: projects }] = await Promise.all([
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
    stores: (stores ?? []).map(({ id, name, project_id }) => ({ id, name, project_id })),
    plots: (plots ?? []).map((plot) => ({
      id: plot.id,
      name: plot.name,
      project_name: (plot.projects as { name: string } | null)?.name ?? "—",
    })),
    projects: (projects ?? []).map(({ id, name }) => ({ id, name })),
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
  const [items, storeNames, nameOf] = await Promise.all([
    itemsById(
      supabase,
      rows.map((row) => row.item_id),
    ),
    labelsById(
      supabase,
      "stores",
      rows.map((row) => row.store_id),
    ),
    namesById(
      supabase,
      rows.map((row) => row.created_by),
    ),
  ]);

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
