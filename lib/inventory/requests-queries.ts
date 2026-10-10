import "server-only";

import { requireTool } from "@/lib/auth/access";
import type { Filterable } from "@/lib/list-params";
import { listWorkItems } from "@/lib/masters/works";
import { fetchAll } from "@/lib/supabase/fetch-all";
import { readFailed } from "@/lib/supabase/read-failed";
import { createClient } from "@/lib/supabase/server";

import { matchingItemIds } from "./queries";

/**
 * The store-keeper's side of the Supervisors' requests (Phase 2 Step
 * H). `issue_requests` is the Supervisors tool's table; Inventory reads
 * it (its SELECT policy admits `/inventory` since 0084) and resolves it
 * — the fifth documented cross-tool write exception (STATUS.md). The
 * guard trigger in 0084 is the boundary: this side can only move
 * `requested → fulfilled/declined`, never rewrite what was asked.
 */

const fail = (context: string, error: { message: string }): never =>
  readFailed("inventory requests", context, error);

export type SiteRequestRow = {
  id: string;
  plotId: string;
  plotName: string;
  projectName: string;
  workItemId: string;
  workLabel: string;
  itemId: string;
  itemName: string;
  itemUom: string;
  quantity: number;
  note: string | null;
  requesterName: string;
  createdAt: string;
  status: "requested" | "fulfilled" | "declined";
  declinedReason: string | null;
  fulfilledIssueId: string | null;
};

const ANSWERED_SHOWN = 20;

type RequestRecord = {
  id: string;
  plot_id: string;
  work_item_id: string;
  item_id: string;
  quantity: number;
  note: string | null;
  status: string;
  declined_reason: string | null;
  fulfilled_issue_id: string | null;
  created_by: string | null;
  created_at: string;
};

const REQUEST_COLUMNS =
  "id, plot_id, work_item_id, item_id, quantity, note, status, declined_reason, fulfilled_issue_id, created_by, created_at";

export type SiteRequestFilters = {
  plotId?: string;
  /** Waiting (requested), issued (fulfilled) or declined. */
  status?: SiteRequestRow["status"];
  /** Item name — already made safe by searchParam. */
  q?: string;
};

export async function listSiteRequests({ plotId, status, q }: SiteRequestFilters = {}): Promise<{
  open: SiteRequestRow[];
  answered: SiteRequestRow[];
  answeredTotal: number;
  /** More items matched the search than it can carry — the screen says so. */
  searchCapped: boolean;
}> {
  await requireTool("/inventory");
  const supabase = await createClient();

  // The search is over items (an open Masters read): find the matching
  // item ids first, then keep only the requests for those items.
  const found = q ? await matchingItemIds(supabase, q, ["name"]) : null;
  if (found && found.ids.length === 0) {
    return { open: [], answered: [], answeredTotal: 0, searchCapped: false };
  }

  // Every filter in one place; the status filter picks WHICH list(s) to
  // read below, since waiting and answered are two separate lists.
  const filtered = <T extends Filterable<T>>(query: T): T => {
    let next = query;
    if (plotId) next = next.eq("plot_id", plotId);
    if (found) next = next.in("item_id", found.ids);
    return next;
  };
  const wantOpen = !status || status === "requested";
  const wantAnswered = status !== "requested";

  const readAnswered = () => {
    const base = filtered(
      supabase.from("issue_requests").select(REQUEST_COLUMNS, { count: "exact" }),
    );
    return (status ? base.eq("status", status) : base.neq("status", "requested"))
      .order("created_at", { ascending: false })
      .order("id")
      .range(0, ANSWERED_SHOWN - 1);
  };

  // The queue reads complete (a capped queue silently starves the
  // oldest request); answered is a display list and says its limit.
  const [open, answeredPage] = await Promise.all([
    wantOpen
      ? fetchAll<RequestRecord>((from, to) =>
          filtered(
            supabase.from("issue_requests").select(REQUEST_COLUMNS).eq("status", "requested"),
          )
            .order("created_at")
            .order("id")
            .range(from, to),
        )
      : Promise.resolve([] as RequestRecord[]),
    wantAnswered ? readAnswered() : Promise.resolve(null),
  ]);
  if (answeredPage?.error) fail("the answered requests", answeredPage.error);
  const answered = (answeredPage?.data ?? []) as RequestRecord[];

  const shaped = await shapeRequests(supabase, [...open, ...answered]);
  return {
    open: shaped.slice(0, open.length),
    answered: shaped.slice(open.length),
    answeredTotal: answeredPage?.count ?? answered.length,
    searchCapped: found?.capped ?? false,
  };
}

export async function countOpenSiteRequests(): Promise<number> {
  await requireTool("/inventory");
  const supabase = await createClient();
  const { count, error } = await supabase
    .from("issue_requests")
    .select("id", { count: "exact", head: true })
    .eq("status", "requested");
  if (error) fail("the request count", error);
  return count ?? 0;
}

/** One request, for prefilling the issue form (?request=<id>). */
export async function getSiteRequest(id: string): Promise<SiteRequestRow | null> {
  await requireTool("/inventory");
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("issue_requests")
    .select(REQUEST_COLUMNS)
    .eq("id", id)
    .maybeSingle();
  if (error) fail("the request", error);
  if (!data) return null;
  const [shaped] = await shapeRequests(supabase, [data as RequestRecord]);
  return shaped;
}

async function shapeRequests(
  supabase: Awaited<ReturnType<typeof createClient>>,
  records: RequestRecord[],
): Promise<SiteRequestRow[]> {
  if (records.length === 0) return [];

  const itemIds = [...new Set(records.map((record) => record.item_id))];
  const plotIds = [...new Set(records.map((record) => record.plot_id))];
  const requesterIds = [
    ...new Set(records.flatMap((record) => (record.created_by ? [record.created_by] : []))),
  ];

  const [itemsResult, plotsResult, profilesResult, workItems] = await Promise.all([
    supabase.from("items").select("id, name, default_uom").in("id", itemIds),
    supabase.from("plots").select("id, name, projects(name)").in("id", plotIds),
    requesterIds.length
      ? supabase.from("profiles").select("id, full_name").in("id", requesterIds)
      : Promise.resolve({ data: [], error: null }),
    listWorkItems(),
  ]);
  if (itemsResult.error) fail("the requested items", itemsResult.error);
  if (plotsResult.error) fail("the plots", plotsResult.error);
  if (profilesResult.error) fail("the requesters", profilesResult.error);

  const items = new Map(
    (itemsResult.data ?? []).map((item) => [
      item.id,
      { name: item.name, uom: item.default_uom as string },
    ]),
  );
  const plots = new Map(
    (plotsResult.data ?? []).map((plot) => [
      plot.id,
      {
        name: plot.name,
        projectName: (plot.projects as { name: string } | null)?.name ?? "—",
      },
    ]),
  );
  const profiles = new Map(
    (profilesResult.data ?? []).map((profile) => [profile.id, profile.full_name as string]),
  );
  const works = new Map(workItems.map((work) => [work.id, `${work.code} · ${work.name}`]));

  return records.map((record) => ({
    id: record.id,
    plotId: record.plot_id,
    plotName: plots.get(record.plot_id)?.name ?? "—",
    projectName: plots.get(record.plot_id)?.projectName ?? "—",
    workItemId: record.work_item_id,
    workLabel: works.get(record.work_item_id) ?? "Retired work",
    itemId: record.item_id,
    itemName: items.get(record.item_id)?.name ?? "Unknown item",
    itemUom: items.get(record.item_id)?.uom ?? "",
    quantity: record.quantity,
    note: record.note,
    requesterName: (record.created_by && profiles.get(record.created_by)) || "—",
    createdAt: record.created_at,
    status: record.status as SiteRequestRow["status"],
    declinedReason: record.declined_reason,
    fulfilledIssueId: record.fulfilled_issue_id,
  }));
}
