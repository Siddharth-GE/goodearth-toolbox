import "server-only";

import { requireTool } from "@/lib/auth/access";
import { fetchAll } from "@/lib/supabase/fetch-all";
import { createClient } from "@/lib/supabase/server";
import {
  dayInIndia,
  dayOfStage,
  nowAndNext,
  villaHealth,
  type Health,
  type HealthKind,
  type StageStatus,
} from "./programme";
import {
  planVilla,
  readShared,
  type EstimateRow,
  type SiteVillaRow,
  type StageRow,
} from "./programme-queries";

/** The site board (plan.md phase D): every villa's programme, health and forecast at once, from the same rules as the villa
 * page. Deliveries count as the villa page does: the newest 20 issues and 20 site deliveries, each until the site confirms it. */

const GRANT = "/supervisors";
const RECENT_DELIVERIES = 20;

export const NOT_STARTED_COLUMN = "Not started";
export const FINISHED_COLUMN = "Every stage done";

export type BoardCard = {
  plotId: string;
  plotName: string;
  villaName: string;
  projectId: string;
  projectName: string;
  health: Health;
  stages: { id: string; code: string; name: string; status: StageStatus }[];
  now: { label: string; day: number | null } | null;
  /** How many more stages are being worked than the one named. */
  nowMore: number;
  next: { label: string; start: string | null } | null;
  handover: string | null;
  slip: number | null;
  toConfirm: number;
  openRequests: number;
  supervisor: { id: string; name: string } | null;
  /** The work category of the furthest stage begun: the board's column. */
  column: string;
};

export type SiteBoard = {
  columns: string[];
  cards: BoardCard[];
  counts: Record<HealthKind | "all", number>;
  projects: { id: string; name: string }[];
  who: "mine" | "all";
  today: string;
};

export const BOARD_HEALTH: HealthKind[] = [
  "waiting",
  "late",
  "idle",
  "failed_check",
  "delivery",
  "on_track",
  "not_started",
  "finished",
];

const isHealth = (value: string | undefined): value is HealthKind =>
  (BOARD_HEALTH as string[]).includes(value ?? "");

export async function getSiteBoard(params: {
  q?: string;
  project?: string;
  who?: string;
  health?: string;
}): Promise<SiteBoard> {
  const user = await requireTool(GRANT);
  const supabase = await createClient();

  const [
    shared,
    units,
    plots,
    projects,
    stageRows,
    villaRows,
    estimate,
    logs,
    openChecklists,
    failedItems,
    issues,
    receipts,
    confirmations,
    requests,
    profiles,
  ] = await Promise.all([
    readShared(supabase),
    fetchAll((from, to) =>
      supabase
        .from("units")
        .select("id, project_id, plot_id, name")
        .order("name")
        .order("id")
        .range(from, to),
    ),
    fetchAll((from, to) => supabase.from("plots").select("id, name").order("id").range(from, to)),
    fetchAll((from, to) =>
      supabase.from("projects").select("id, name").order("id").range(from, to),
    ),
    fetchAll((from, to) =>
      supabase
        .from("site_stages")
        .select(
          "id, plot_id, work_group_id, status, status_changed_at, waiting_on, waiting_note, started_on, finished_on, contractor_id, days, pinned_start, baseline_start, baseline_finish",
        )
        .order("id")
        .range(from, to),
    ),
    fetchAll((from, to) =>
      supabase
        .from("site_villas")
        .select("plot_id, supervisor_id, start_on, baselined_at")
        .order("id")
        .range(from, to),
    ),
    // Which works each official estimate covers; quantities are the villa page's, not the board's.
    fetchAll((from, to) =>
      supabase
        .from("estimate_work_facts")
        .select("unit_id, work_item_id")
        .order("estimate_id")
        .order("work_item_id")
        .order("quantity")
        .range(from, to),
    ),
    fetchAll((from, to) =>
      supabase
        .from("labour_logs")
        .select("plot_id, work_item_id, log_date")
        .order("id")
        .range(from, to),
    ),
    fetchAll((from, to) =>
      supabase
        .from("site_checklists")
        .select("id, plot_id")
        .eq("status", "open")
        .order("id")
        .range(from, to),
    ),
    fetchAll((from, to) =>
      supabase
        .from("site_checklist_items")
        .select("checklist_id")
        .eq("status", "fail")
        .order("id")
        .range(from, to),
    ),
    fetchAll((from, to) =>
      supabase
        .from("stock_issues")
        .select("id, plot_id, issued_at")
        .not("plot_id", "is", null)
        .order("issued_at", { ascending: false })
        .order("id")
        .range(from, to),
    ),
    fetchAll((from, to) =>
      supabase
        .from("goods_receipts")
        .select("id, plot_id, received_at")
        .eq("to_site", true)
        .not("plot_id", "is", null)
        .order("received_at", { ascending: false })
        .order("id")
        .range(from, to),
    ),
    fetchAll((from, to) =>
      supabase
        .from("site_receipt_confirmations")
        .select("issue_id, receipt_id")
        .order("id")
        .range(from, to),
    ),
    fetchAll((from, to) =>
      supabase
        .from("issue_requests")
        .select("plot_id")
        .eq("status", "requested")
        .order("id")
        .range(from, to),
    ),
    fetchAll((from, to) =>
      supabase.from("profiles").select("id, full_name").order("id").range(from, to),
    ),
  ]);

  const { today, groupOfWork, groupInfos } = shared;
  const byPlot = <T extends { plot_id: string | null }>(rows: T[]) => {
    const map = new Map<string, T[]>();
    for (const row of rows) {
      if (!row.plot_id) continue;
      map.set(row.plot_id, [...(map.get(row.plot_id) ?? []), row]);
    }
    return map;
  };
  const stagesByPlot = byPlot(stageRows);
  const villaByPlot = new Map(villaRows.map((row) => [row.plot_id, row]));
  const estimateByUnit = new Map<string, EstimateRow[]>();
  for (const row of estimate) {
    if (!row.unit_id) continue;
    estimateByUnit.set(row.unit_id, [
      ...(estimateByUnit.get(row.unit_id) ?? []),
      { work_item_id: row.work_item_id, quantity: null, uom: null },
    ]);
  }
  const lastLabour = new Map<string, Map<string, string>>();
  for (const log of logs) {
    const group = groupOfWork.get(log.work_item_id);
    if (!group) continue;
    const forPlot = lastLabour.get(log.plot_id) ?? new Map<string, string>();
    const last = forPlot.get(group);
    if (!last || log.log_date > last) forPlot.set(group, log.log_date);
    lastLabour.set(log.plot_id, forPlot);
  }
  const failedChecklists = new Set(failedItems.map((item) => item.checklist_id));
  const failedByPlot = new Map<string, number>();
  for (const checklist of openChecklists) {
    if (!failedChecklists.has(checklist.id)) continue;
    failedByPlot.set(checklist.plot_id, (failedByPlot.get(checklist.plot_id) ?? 0) + 1);
  }
  const confirmedIssues = new Set(
    confirmations.flatMap((row) => (row.issue_id ? [row.issue_id] : [])),
  );
  const confirmedReceipts = new Set(
    confirmations.flatMap((row) => (row.receipt_id ? [row.receipt_id] : [])),
  );
  const unconfirmedByPlot = new Map<string, string[]>();
  const addUnconfirmed = (
    rows: { id: string; plot_id: string | null; at: string }[],
    confirmed: Set<string>,
  ) => {
    for (const [plot, list] of byPlot(rows)) {
      const open = list
        .slice(0, RECENT_DELIVERIES)
        .filter((row) => !confirmed.has(row.id))
        .map((row) => dayInIndia(row.at));
      unconfirmedByPlot.set(plot, [...(unconfirmedByPlot.get(plot) ?? []), ...open]);
    }
  };
  addUnconfirmed(
    issues.map((row) => ({ id: row.id, plot_id: row.plot_id, at: row.issued_at })),
    confirmedIssues,
  );
  addUnconfirmed(
    receipts.map((row) => ({ id: row.id, plot_id: row.plot_id, at: row.received_at })),
    confirmedReceipts,
  );
  const requestsByPlot = new Map<string, number>();
  for (const request of requests) {
    requestsByPlot.set(request.plot_id, (requestsByPlot.get(request.plot_id) ?? 0) + 1);
  }
  const names = new Map(profiles.map((person) => [person.id, person.full_name ?? "—"]));
  const plotNames = new Map(plots.map((plot) => [plot.id, plot.name]));
  const projectNames = new Map(projects.map((project) => [project.id, project.name]));

  // The columns: categories in the order the sequence first reaches them.
  const categoryOf = new Map(groupInfos.map((group) => [group.id, group.categoryName]));
  const categories: string[] = [];
  for (const entry of shared.sequencePositions) {
    const name = categoryOf.get(entry.groupId);
    if (name && !categories.includes(name)) categories.push(name);
  }

  const all: BoardCard[] = units.map((unit) => {
    const records = (stagesByPlot.get(unit.plot_id) ?? []) as (StageRow & { plot_id: string })[];
    const site = villaByPlot.get(unit.plot_id);
    const plan = planVilla(shared, {
      unitId: unit.id,
      records,
      site: (site ?? null) as SiteVillaRow,
      estimate: estimateByUnit.get(unit.id) ?? [],
    });
    const stages = plan.programme.map((stage, index) => ({
      ...stage,
      forecast: plan.schedule.stages[index],
    }));
    const { now, next } = nowAndNext(stages, 1);
    const late = stages
      .filter((stage) => stage.forecast.overdueDays)
      .sort((a, b) => b.forecast.overdueDays! - a.forecast.overdueDays!)[0];
    const unconfirmed = (unconfirmedByPlot.get(unit.plot_id) ?? []).sort();
    const health = villaHealth({
      stages,
      lastLabourByGroup: lastLabour.get(unit.plot_id) ?? new Map(),
      failedOpenChecklists: failedByPlot.get(unit.plot_id) ?? 0,
      late: late ? { stage: late, days: late.forecast.overdueDays! } : null,
      oldestUnconfirmedDelivery: unconfirmed[0] ?? null,
      today,
    });
    const furthest = stages.findLast((stage) => stage.status !== "not_started");
    const column =
      health.kind === "finished"
        ? FINISHED_COLUMN
        : furthest
          ? furthest.categoryName
          : NOT_STARTED_COLUMN;
    const first = now[0];
    const supervisorId = site?.supervisor_id ?? null;
    return {
      plotId: unit.plot_id,
      plotName: plotNames.get(unit.plot_id) ?? "—",
      villaName: unit.name,
      projectId: unit.project_id,
      projectName: projectNames.get(unit.project_id) ?? "—",
      health,
      stages: stages.map((stage) => ({
        id: stage.id,
        code: stage.code,
        name: stage.name,
        status: stage.status,
      })),
      now: first
        ? {
            label: `${first.code} ${first.name}`,
            day:
              first.status === "done"
                ? null
                : dayOfStage({ startedOn: first.record?.startedOn ?? null }, today),
          }
        : null,
      nowMore: Math.max(now.length - 1, 0),
      next: next[0]
        ? { label: `${next[0].code} ${next[0].name}`, start: next[0].forecast.start }
        : null,
      handover: plan.schedule.handover,
      slip: plan.schedule.slip,
      toConfirm: unconfirmed.length,
      openRequests: requestsByPlot.get(unit.plot_id) ?? 0,
      supervisor: supervisorId ? { id: supervisorId, name: names.get(supervisorId) ?? "—" } : null,
      column,
    };
  });

  const runsAny = all.some((card) => card.supervisor?.id === user.id);
  const who = params.who === "mine" || params.who === "all" ? params.who : runsAny ? "mine" : "all";
  const q = (params.q ?? "").trim().toLowerCase();
  const scoped = all.filter(
    (card) =>
      (who === "all" || card.supervisor?.id === user.id) &&
      (!params.project || card.projectId === params.project) &&
      (!q ||
        card.plotName.toLowerCase().includes(q) ||
        card.villaName.toLowerCase().includes(q) ||
        card.projectName.toLowerCase().includes(q)),
  );
  const counts = Object.fromEntries([
    ["all", scoped.length],
    ...BOARD_HEALTH.map((kind) => [
      kind,
      scoped.filter((card) => card.health.kind === kind).length,
    ]),
  ]) as Record<HealthKind | "all", number>;
  const health = isHealth(params.health) ? params.health : null;

  return {
    columns: [NOT_STARTED_COLUMN, ...categories, FINISHED_COLUMN],
    cards: health ? scoped.filter((card) => card.health.kind === health) : scoped,
    counts,
    projects: [...new Map(all.map((card) => [card.projectId, card.projectName])).entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    who,
    today,
  };
}
