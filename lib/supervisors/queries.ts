import "server-only";

import { requireTool } from "@/lib/auth/access";
import { listReleasedDrawingsForUnit, type ReleasedDrawingSet } from "@/lib/drawings/queries";
import { listVendors } from "@/lib/masters/vendors";
import { listWorkCategories, listWorkItems } from "@/lib/masters/works";
import { fetchAll } from "@/lib/supabase/fetch-all";
import { readFailed } from "@/lib/supabase/read-failed";
import { createClient } from "@/lib/supabase/server";
import {
  groupSiteMaterials,
  type SiteIssuedLine,
  type SiteMaterialRow,
  type SiteTakeoffRow,
} from "./site-materials";

/**
 * Reads for the Supervisors app.
 *
 * Every function opens with `requireTool("/supervisors")`. What this
 * tool reads from outside itself, all SELECTs (STATUS.md contract row):
 * `estimate_takeoff_facts` (the official estimate's frozen quantities —
 * no rates; the view's WHERE admits /supervisors since 0084),
 * `stock_issues(_lines)` and `goods_receipts(_lines)` (open
 * quantity-only reads since 0023 — what the plot has drawn), the works
 * vocabulary and vendors/plots/units/projects/items from Masters, and —
 * since Design Management (0091) — the villa's released drawings via
 * `lib/drawings/listReleasedDrawingsForUnit`, the shared module Design
 * Management's own screens read too (Design Management owns every
 * write; this tool only reads what has already been released). Never a
 * rupee anywhere: labour is heads, materials are quantities.
 *
 * No embeds except plots→projects (single FK path): units has had two
 * paths to plots since 0029, so unit and plot names merge through Maps
 * instead (the Directory pattern, BUGCATCHER #2).
 */

const GRANT = "/supervisors";

const fail = (context: string, error: { message: string }): never =>
  readFailed("supervisors", context, error);

// ---------------------------------------------------------------------
// Welcome
// ---------------------------------------------------------------------

export async function getWelcomeCounts(): Promise<{
  villas: number;
  workersThisWeek: number;
  openRequests: number;
  contractors: number;
}> {
  await requireTool(GRANT);
  const supabase = await createClient();

  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 6);
  const since = weekAgo.toISOString().slice(0, 10);

  const [villas, weekLogs, openRequests, contractors] = await Promise.all([
    supabase.from("units").select("id", { count: "exact", head: true }),
    fetchAll<{ masons: number; helpers: number; others: number }>((from, to) =>
      supabase
        .from("labour_logs")
        .select("masons, helpers, others")
        .gte("log_date", since)
        .order("id")
        .range(from, to),
    ),
    supabase
      .from("issue_requests")
      .select("id", { count: "exact", head: true })
      .eq("status", "requested"),
    supabase
      .from("vendors")
      .select("id", { count: "exact", head: true })
      .eq("is_contractor", true)
      .eq("is_active", true),
  ]);

  return {
    villas: villas.count ?? 0,
    workersThisWeek: weekLogs.reduce((sum, log) => sum + log.masons + log.helpers + log.others, 0),
    openRequests: openRequests.count ?? 0,
    contractors: contractors.count ?? 0,
  };
}

// ---------------------------------------------------------------------
// Villas
// ---------------------------------------------------------------------

export type VillaRow = {
  plotId: string;
  unitId: string;
  villaName: string;
  plotName: string;
  projectName: string;
};

export async function listVillas(): Promise<VillaRow[]> {
  await requireTool(GRANT);
  const supabase = await createClient();

  const [units, plots, projects] = await Promise.all([
    fetchAll<{ id: string; project_id: string; plot_id: string; name: string }>((from, to) =>
      supabase
        .from("units")
        .select("id, project_id, plot_id, name")
        .order("name")
        .order("id")
        .range(from, to),
    ),
    fetchAll<{ id: string; name: string }>((from, to) =>
      supabase.from("plots").select("id, name").order("id").range(from, to),
    ),
    fetchAll<{ id: string; name: string }>((from, to) =>
      supabase.from("projects").select("id, name").order("id").range(from, to),
    ),
  ]);

  const plotNames = new Map(plots.map((plot) => [plot.id, plot.name]));
  const projectNames = new Map(projects.map((project) => [project.id, project.name]));

  return units.map((unit) => ({
    plotId: unit.plot_id,
    unitId: unit.id,
    villaName: unit.name,
    plotName: plotNames.get(unit.plot_id) ?? "—",
    projectName: projectNames.get(unit.project_id) ?? "—",
  }));
}

// ---------------------------------------------------------------------
// One villa: materials per work, labour, requests
// ---------------------------------------------------------------------

export type VillaWorkGroup = {
  workItemId: string;
  workLabel: string;
  categoryName: string;
  rows: SiteMaterialRow[];
  /** Reached the plot for this work but outside the estimate. */
  unplanned: { itemName: string; quantity: number; uom: string }[];
};

export type LabourLogRow = {
  id: string;
  logDate: string;
  workItemId: string;
  workLabel: string;
  contractorId: string;
  contractorName: string;
  masons: number;
  helpers: number;
  others: number;
  note: string | null;
};

export type IssueRequestRow = {
  id: string;
  itemName: string;
  itemUom: string;
  workLabel: string;
  quantity: number;
  note: string | null;
  status: "requested" | "fulfilled" | "declined";
  declinedReason: string | null;
  createdAt: string;
};

export type EstimateQuickPick = {
  workItemId: string;
  workLabel: string;
  materialName: string;
  /** The estimate's figure in the material's unit, for display. */
  estimatedLabel: string;
  itemId: string;
  itemName: string;
  itemUom: string;
};

export type VillaDetail = {
  plotId: string;
  unitId: string | null;
  villaName: string;
  plotName: string;
  projectName: string;
  /** Null when no official estimate exists for the villa. */
  estimate: { reference: string; submittedAt: string } | null;
  workGroups: VillaWorkGroup[];
  /** Untagged history — reached the plot with no work recorded. */
  untagged: { itemName: string; quantity: number; uom: string }[];
  labourLogs: LabourLogRow[];
  labourTotal: number;
  requests: IssueRequestRow[];
  /** The estimate's linked materials, ready to prefill a request. */
  quickPicks: EstimateQuickPick[];
  /** Released drawing sets for this villa — empty when there is no unit row. */
  drawings: ReleasedDrawingSet[];
};

const LOGS_SHOWN = 30;

export async function getVillaDetail(plotId: string): Promise<VillaDetail | null> {
  await requireTool(GRANT);
  const supabase = await createClient();

  const { data: plot, error: plotError } = await supabase
    .from("plots")
    .select("id, name, project_id, projects(name)")
    .eq("id", plotId)
    .maybeSingle();
  if (plotError) fail("the villa", plotError);
  if (!plot) return null;

  const { data: unit, error: unitError } = await supabase
    .from("units")
    .select("id, name")
    .eq("plot_id", plotId)
    .maybeSingle();
  if (unitError) fail("the villa", unitError);

  // The frozen takeoff — empty when no official estimate exists. The
  // generated view types are all-nullable (Postgres can't promise a
  // view column), so the read narrows with a guard, the indents idiom.
  const takeoffRaw = unit
    ? await fetchAll<{
        reference: string | null;
        submitted_at: string | null;
        work_item_id: string | null;
        material_id: string | null;
        material_name: string | null;
        uom: string | null;
        quantity: number | null;
        item_id: string | null;
        item_uom_factor: number | null;
      }>((from, to) =>
        supabase
          .from("estimate_takeoff_facts")
          .select(
            "reference, submitted_at, work_item_id, material_id, material_name, uom, quantity, item_id, item_uom_factor",
          )
          .eq("unit_id", unit.id)
          .order("material_name")
          .order("material_id")
          .range(from, to),
      )
    : [];
  const takeoffRows = takeoffRaw.filter(
    (
      row,
    ): row is typeof row & {
      reference: string;
      submitted_at: string;
      work_item_id: string;
      material_name: string;
      uom: string;
      quantity: number;
    } =>
      row.reference !== null &&
      row.submitted_at !== null &&
      row.work_item_id !== null &&
      row.material_name !== null &&
      row.uom !== null &&
      row.quantity !== null,
  );

  // Every movement onto the plot: store issues, plus direct-to-site
  // deliveries matched on the plot OR the unit — a to-site GRN carries
  // whichever its PO named (0023). The villa's released drawings ride
  // along in the same Promise.all — skipped gracefully with no unit row,
  // the same guard the takeoff read above already uses.
  const [issues, receipts, drawings] = await Promise.all([
    fetchAll<{ id: string; work_item_id: string | null }>((from, to) =>
      supabase
        .from("stock_issues")
        .select("id, work_item_id")
        .eq("plot_id", plotId)
        .order("id")
        .range(from, to),
    ),
    fetchAll<{ id: string; work_item_id: string | null }>((from, to) => {
      let query = supabase.from("goods_receipts").select("id, work_item_id").eq("to_site", true);
      query = unit
        ? query.or(`plot_id.eq.${plotId},unit_id.eq.${unit.id}`)
        : query.eq("plot_id", plotId);
      return query.order("id").range(from, to);
    }),
    unit ? listReleasedDrawingsForUnit(unit.id) : Promise.resolve<ReleasedDrawingSet[]>([]),
  ]);

  const workByIssue = new Map(issues.map((issue) => [issue.id, issue.work_item_id]));
  const workByReceipt = new Map(receipts.map((receipt) => [receipt.id, receipt.work_item_id]));

  const [issueLines, receiptLines] = await Promise.all([
    issues.length
      ? fetchAll<{ issue_id: string; item_id: string; quantity: number }>((from, to) =>
          supabase
            .from("stock_issue_lines")
            .select("issue_id, item_id, quantity")
            .in(
              "issue_id",
              issues.map((issue) => issue.id),
            )
            .order("id")
            .range(from, to),
        )
      : Promise.resolve([]),
    receipts.length
      ? fetchAll<{ receipt_id: string; item_id: string; quantity: number }>((from, to) =>
          supabase
            .from("goods_receipt_lines")
            .select("receipt_id, item_id, quantity")
            .in(
              "receipt_id",
              receipts.map((receipt) => receipt.id),
            )
            .order("id")
            .range(from, to),
        )
      : Promise.resolve([]),
  ]);

  const issued: SiteIssuedLine[] = [
    ...issueLines.map((line) => ({
      workItemId: workByIssue.get(line.issue_id) ?? null,
      itemId: line.item_id,
      quantity: line.quantity,
    })),
    ...receiptLines.map((line) => ({
      workItemId: workByReceipt.get(line.receipt_id) ?? null,
      itemId: line.item_id,
      quantity: line.quantity,
    })),
  ];

  // Labour (recent, with a real count) and requests for this plot.
  const [logsPage, requestRows] = await Promise.all([
    supabase
      .from("labour_logs")
      .select("id, log_date, work_item_id, contractor_id, masons, helpers, others, note", {
        count: "exact",
      })
      .eq("plot_id", plotId)
      .order("log_date", { ascending: false })
      .order("created_at", { ascending: false })
      .range(0, LOGS_SHOWN - 1),
    fetchAll<{
      id: string;
      work_item_id: string;
      item_id: string;
      quantity: number;
      note: string | null;
      /** Narrowed on mapping — the CHECK allows exactly three values. */
      status: string;
      declined_reason: string | null;
      created_at: string;
    }>((from, to) =>
      supabase
        .from("issue_requests")
        .select("id, work_item_id, item_id, quantity, note, status, declined_reason, created_at")
        .eq("plot_id", plotId)
        .order("created_at", { ascending: false })
        .order("id")
        .range(from, to),
    ),
  ]);
  if (logsPage.error) fail("the labour logs", logsPage.error);
  const logs = logsPage.data ?? [];

  // Names: items (name + unit), works (label + category), contractors.
  const itemIds = [
    ...new Set([
      ...issued.map((line) => line.itemId),
      ...takeoffRows.flatMap((row) => (row.item_id ? [row.item_id] : [])),
      ...requestRows.map((request) => request.item_id),
    ]),
  ];
  const [itemsResult, workItems, workCategories, vendors] = await Promise.all([
    itemIds.length
      ? supabase.from("items").select("id, name, default_uom").in("id", itemIds)
      : Promise.resolve({ data: [], error: null }),
    listWorkItems(),
    listWorkCategories(),
    listVendors(),
  ]);
  if (itemsResult.error) fail("the items", itemsResult.error);
  const items = new Map(
    (itemsResult.data ?? []).map((item) => [
      item.id,
      { name: item.name, uom: item.default_uom as string },
    ]),
  );
  const workById = new Map(workItems.map((work) => [work.id, work]));
  const categoryNameById = new Map(workCategories.map((category) => [category.id, category.name]));
  const workLabel = (workItemId: string | null): string => {
    if (!workItemId) return "No work recorded";
    const work = workById.get(workItemId);
    return work ? `${work.code} · ${work.name}` : "Retired work";
  };
  const vendorNames = new Map(vendors.map((vendor) => [vendor.id, vendor.name]));

  // Line the drawn quantities up against the estimate, per work.
  const takeoff: SiteTakeoffRow[] = takeoffRows.map((row) => ({
    workItemId: row.work_item_id,
    materialId: row.material_id,
    materialName: row.material_name,
    uom: row.uom,
    quantity: row.quantity,
    itemId: row.item_id,
    itemUomFactor: row.item_uom_factor,
  }));
  const itemUoms = new Map([...items].map(([id, item]) => [id, item.uom]));
  const grouped = groupSiteMaterials(takeoff, issued, itemUoms);

  const unplannedByWork = new Map<string, { itemName: string; quantity: number; uom: string }[]>();
  const untagged: { itemName: string; quantity: number; uom: string }[] = [];
  for (const entry of grouped.unplanned) {
    const item = items.get(entry.itemId);
    const shaped = {
      itemName: item?.name ?? "Unknown item",
      quantity: entry.quantity,
      uom: item?.uom ?? "",
    };
    if (entry.workItemId === null) untagged.push(shaped);
    else {
      const bucket = unplannedByWork.get(entry.workItemId) ?? [];
      bucket.push(shaped);
      unplannedByWork.set(entry.workItemId, bucket);
    }
  }

  const workIds = [
    ...new Set([...grouped.rows.map((row) => row.workItemId), ...unplannedByWork.keys()]),
  ];
  const workGroups: VillaWorkGroup[] = workIds
    .map((workItemId) => {
      const work = workById.get(workItemId);
      return {
        workItemId,
        workLabel: workLabel(workItemId),
        categoryName: work ? (categoryNameById.get(work.category_id) ?? "—") : "—",
        rows: grouped.rows.filter((row) => row.workItemId === workItemId),
        unplanned: unplannedByWork.get(workItemId) ?? [],
      };
    })
    .sort((a, b) => a.workLabel.localeCompare(b.workLabel));

  const quickPicks: EstimateQuickPick[] = takeoffRows.flatMap((row) => {
    if (!row.item_id) return [];
    const item = items.get(row.item_id);
    if (!item) return [];
    return [
      {
        workItemId: row.work_item_id,
        workLabel: workLabel(row.work_item_id),
        materialName: row.material_name,
        estimatedLabel: `${row.quantity} ${row.uom}`,
        itemId: row.item_id,
        itemName: item.name,
        itemUom: item.uom,
      },
    ];
  });

  return {
    plotId,
    unitId: unit?.id ?? null,
    villaName: unit?.name ?? plot.name,
    plotName: plot.name,
    projectName: (plot.projects as { name: string } | null)?.name ?? "—",
    estimate: takeoffRows.length
      ? { reference: takeoffRows[0].reference, submittedAt: takeoffRows[0].submitted_at }
      : null,
    workGroups,
    untagged,
    labourLogs: logs.map((log) => ({
      id: log.id,
      logDate: log.log_date,
      workItemId: log.work_item_id,
      workLabel: workLabel(log.work_item_id),
      contractorId: log.contractor_id,
      contractorName: vendorNames.get(log.contractor_id) ?? "—",
      masons: log.masons,
      helpers: log.helpers,
      others: log.others,
      note: log.note,
    })),
    labourTotal: logsPage.count ?? logs.length,
    requests: requestRows.map((request) => ({
      id: request.id,
      itemName: items.get(request.item_id)?.name ?? "Unknown item",
      itemUom: items.get(request.item_id)?.uom ?? "",
      workLabel: workLabel(request.work_item_id),
      quantity: request.quantity,
      note: request.note,
      status: request.status as IssueRequestRow["status"],
      declinedReason: request.declined_reason,
      createdAt: request.created_at,
    })),
    quickPicks,
    drawings,
  };
}

// ---------------------------------------------------------------------
// Form data
// ---------------------------------------------------------------------

export type ContractorOption = { id: string; name: string };

export async function listContractors(): Promise<ContractorOption[]> {
  await requireTool(GRANT);
  const vendors = await listVendors(true);
  return vendors
    .filter((vendor) => vendor.is_contractor)
    .map((vendor) => ({ id: vendor.id, name: vendor.name }));
}

export type WorkOption = {
  id: string;
  label: string;
  categoryName: string;
};

/** Active works flattened for a phone-first single select, category optgroups. */
export async function listWorkOptions(): Promise<WorkOption[]> {
  await requireTool(GRANT);
  const [workItems, categories] = await Promise.all([listWorkItems(), listWorkCategories()]);
  const categoryNameById = new Map(categories.map((category) => [category.id, category.name]));
  return workItems
    .filter((work) => work.is_active)
    .map((work) => ({
      id: work.id,
      label: `${work.code} · ${work.name}`,
      categoryName: categoryNameById.get(work.category_id) ?? "—",
    }));
}
