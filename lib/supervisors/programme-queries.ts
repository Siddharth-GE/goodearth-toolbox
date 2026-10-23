import "server-only";

import { requireTool } from "@/lib/auth/access";
import { todayInIndia } from "@/lib/format";
import { listWorkCategories, listWorkGroups, listWorkItems } from "@/lib/masters/works";
import { fetchAll } from "@/lib/supabase/fetch-all";
import { readFailed } from "@/lib/supabase/read-failed";
import { createClient } from "@/lib/supabase/server";
import type { VillaChecklistRow } from "./checklist-queries";
import {
  buildProgramme,
  dayInIndia,
  dayOfStage,
  isStageStatus,
  isWaitingOn,
  nowAndNext,
  stageProgress,
  villaHealth,
  type GroupInfo,
  type Health,
  type ProgrammeStage,
  type StageRecord,
  type StageStatus,
  type WaitingOn,
  type WorkProgress,
} from "./programme";
import type { VillaDelivery } from "./site-receipt-queries";

/** A villa's programme (0137): Supervisors' own stage tables, read with the open works lists, the villa's labour and the money-free
 * estimate_work_facts. Checklists and deliveries come in from the page, which reads them for their own sections. */

const GRANT = "/supervisors";

const fail = (context: string, error: { message: string }): never =>
  readFailed("supervisors", context, error);

export type StageChecklist = {
  templateId: string;
  templateName: string;
  /** The villa's newest checklist of this kind for this stage, or null when none was started. */
  checklist: VillaChecklistRow | null;
};

export type StageView = ProgrammeStage & {
  day: number | null;
  contractorName: string | null;
  works: { id: string; label: string }[];
  progress: WorkProgress[];
  checklists: StageChecklist[];
};

export type StageEvent = {
  id: string;
  at: string;
  stageLabel: string | null;
  kind: "status" | "baseline";
  fromStatus: StageStatus | null;
  toStatus: StageStatus | null;
  waitingOn: WaitingOn | null;
  note: string | null;
  actorName: string | null;
};

export type Person = { id: string; name: string };

export type VillaProgramme = {
  supervisor: Person | null;
  stages: StageView[];
  now: StageView[];
  next: StageView[];
  health: Health;
  history: StageEvent[];
  people: Person[];
  today: string;
};

const HISTORY_SHOWN = 40;

export async function getVillaProgramme(input: {
  plotId: string;
  unitId: string | null;
  checklists: VillaChecklistRow[];
  templates: { id: string; name: string }[];
  templateGroups: Map<string, string[]>;
  deliveries: VillaDelivery[];
  contractors: { id: string; name: string }[];
}): Promise<VillaProgramme> {
  await requireTool(GRANT);
  const supabase = await createClient();
  const { plotId, unitId } = input;
  const today = todayInIndia();

  const [categories, groups, works, sequence, records, site, logs, estimate, events, profiles] =
    await Promise.all([
      listWorkCategories(),
      listWorkGroups(),
      listWorkItems(),
      fetchAll((from, to) =>
        supabase
          .from("site_sequence")
          .select("work_group_id, position")
          .order("position")
          .order("id")
          .range(from, to),
      ),
      fetchAll((from, to) =>
        supabase
          .from("site_stages")
          .select(
            "id, work_group_id, status, status_changed_at, waiting_on, waiting_note, started_on, finished_on, contractor_id",
          )
          .eq("plot_id", plotId)
          .order("id")
          .range(from, to),
      ),
      supabase.from("site_villas").select("supervisor_id").eq("plot_id", plotId).maybeSingle(),
      fetchAll((from, to) =>
        supabase
          .from("labour_logs")
          .select("work_item_id, log_date, kind, quantity, uom, work_class")
          .eq("plot_id", plotId)
          .order("id")
          .range(from, to),
      ),
      unitId
        ? fetchAll((from, to) =>
            supabase
              .from("estimate_work_facts")
              .select("work_item_id, quantity, uom")
              .eq("unit_id", unitId)
              .order("work_item_id")
              .range(from, to),
          )
        : Promise.resolve([]),
      supabase
        .from("site_stage_events")
        .select("id, at, work_group_id, kind, from_status, to_status, waiting_on, note, actor_id")
        .eq("plot_id", plotId)
        .order("seq", { ascending: false })
        .range(0, HISTORY_SHOWN - 1),
      fetchAll((from, to) =>
        supabase
          .from("profiles")
          .select("id, full_name, is_active")
          .order("full_name")
          .order("id")
          .range(from, to),
      ),
    ]);
  if (site.error) fail("the villa's supervisor", site.error);
  if (events.error) fail("the stage history", events.error);

  const categoryById = new Map(categories.map((category) => [category.id, category]));
  const groupInfos: GroupInfo[] = groups.flatMap((group) => {
    const category = categoryById.get(group.category_id);
    if (!category) return [];
    return [
      {
        id: group.id,
        code: group.code,
        name: group.name,
        categoryName: category.name,
        order: category.sort_order * 10_000 + group.sort_order,
      },
    ];
  });
  const groupById = new Map(groupInfos.map((group) => [group.id, group]));

  const groupOfWork = new Map(works.map((work) => [work.id, work.group_id]));
  const estimateRows = estimate.flatMap((row) =>
    row.work_item_id && row.quantity !== null
      ? [{ workItemId: row.work_item_id, quantity: row.quantity, uom: row.uom }]
      : [],
  );
  const estimateGroupIds = unitId
    ? new Set(
        estimate.flatMap((row) => {
          const group = row.work_item_id ? groupOfWork.get(row.work_item_id) : null;
          return group ? [group] : [];
        }),
      )
    : null;

  const stageRecords: StageRecord[] = records.map((record) => ({
    id: record.id,
    groupId: record.work_group_id,
    status: isStageStatus(record.status) ? record.status : "not_started",
    statusChangedAt: record.status_changed_at,
    waitingOn: record.waiting_on && isWaitingOn(record.waiting_on) ? record.waiting_on : null,
    waitingNote: record.waiting_note,
    startedOn: record.started_on,
    finishedOn: record.finished_on,
    contractorId: record.contractor_id,
  }));

  const programme = buildProgramme({
    groups: groupInfos,
    sequence: sequence.map((entry) => ({ groupId: entry.work_group_id, position: entry.position })),
    // A villa whose official estimate names no grouped work is planned like one with none.
    estimateGroupIds: estimateGroupIds && estimateGroupIds.size > 0 ? estimateGroupIds : null,
    records: stageRecords,
  });

  const lastLabourByGroup = new Map<string, string>();
  for (const log of logs) {
    const group = groupOfWork.get(log.work_item_id);
    if (!group) continue;
    const last = lastLabourByGroup.get(group);
    if (!last || log.log_date > last) lastLabourByGroup.set(group, log.log_date);
  }
  const pieceWork = logs
    // Standard work only: rework repeats what the estimate already counts, and additional work is beyond it.
    .filter((log) => log.kind === "pw_qty" && log.work_class === "standard")
    .map((log) => ({ workItemId: log.work_item_id, quantity: log.quantity, uom: log.uom }));

  const contractorNames = new Map(
    input.contractors.map((contractor) => [contractor.id, contractor.name]),
  );
  const templateNames = new Map(input.templates.map((template) => [template.id, template.name]));
  const templatesByGroup = new Map<string, string[]>();
  for (const [templateId, groupIds] of input.templateGroups) {
    for (const groupId of groupIds) {
      templatesByGroup.set(groupId, [...(templatesByGroup.get(groupId) ?? []), templateId]);
    }
  }

  const stages: StageView[] = programme.map((stage) => {
    const stageWorks = works
      .filter((work) => work.group_id === stage.id && work.is_active)
      .map((work) => ({ id: work.id, label: `${work.code} · ${work.name}` }));
    const checklists = (templatesByGroup.get(stage.id) ?? []).flatMap((templateId) => {
      const name = templateNames.get(templateId);
      if (!name) return [];
      // Newest first already; an older one started before stages existed counts for every stage it inspects.
      const mine = input.checklists.filter(
        (checklist) =>
          checklist.templateId === templateId &&
          (checklist.workGroupId === stage.id || checklist.workGroupId === null),
      );
      const checklist = mine.find((row) => row.status === "open") ?? mine[0] ?? null;
      return [{ templateId, templateName: name, checklist }];
    });
    return {
      ...stage,
      day:
        stage.status === "done"
          ? null
          : dayOfStage({ startedOn: stage.record?.startedOn ?? null }, today),
      contractorName: stage.record?.contractorId
        ? (contractorNames.get(stage.record.contractorId) ?? null)
        : null,
      works: stageWorks,
      progress: stageProgress(stageWorks, estimateRows, pieceWork),
      checklists,
    };
  });

  const { now, next } = nowAndNext(stages);
  const failedOpenChecklists = input.checklists.filter(
    (checklist) => checklist.status === "open" && checklist.failed > 0,
  ).length;
  const unconfirmed = input.deliveries
    .filter((delivery) => !delivery.confirmedAt && delivery.lines.length > 0)
    .map((delivery) => dayInIndia(delivery.on))
    .sort();

  const names = new Map(profiles.map((person) => [person.id, person.full_name ?? "—"]));
  const supervisorId = site.data?.supervisor_id ?? null;
  const stageLabel = (groupId: string | null) => {
    const group = groupId ? groupById.get(groupId) : null;
    return group ? `${group.code} ${group.name}` : null;
  };

  return {
    supervisor: supervisorId ? { id: supervisorId, name: names.get(supervisorId) ?? "—" } : null,
    stages,
    now,
    next,
    health: villaHealth({
      stages,
      lastLabourByGroup,
      failedOpenChecklists,
      oldestUnconfirmedDelivery: unconfirmed[0] ?? null,
      today,
    }),
    history: (events.data ?? []).map((event) => ({
      id: event.id,
      at: event.at,
      stageLabel: stageLabel(event.work_group_id),
      kind: event.kind === "baseline" ? "baseline" : "status",
      fromStatus: event.from_status && isStageStatus(event.from_status) ? event.from_status : null,
      toStatus: event.to_status && isStageStatus(event.to_status) ? event.to_status : null,
      waitingOn: event.waiting_on && isWaitingOn(event.waiting_on) ? event.waiting_on : null,
      note: event.note,
      actorName: event.actor_id ? (names.get(event.actor_id) ?? null) : null,
    })),
    people: profiles
      .filter((person) => person.is_active)
      .map((person) => ({ id: person.id, name: person.full_name ?? "—" })),
    today,
  };
}

/** What the stores hold of each item, summed across stores (stock_by_location, open to every signed-in person). */
export async function storeStock(itemIds: string[]): Promise<Map<string, number>> {
  await requireTool(GRANT);
  const held = new Map<string, number>();
  if (itemIds.length === 0) return held;
  const supabase = await createClient();
  const rows = await fetchAll((from, to) =>
    supabase
      .from("stock_by_location")
      .select("item_id, quantity")
      .eq("location_kind", "store")
      .in("item_id", itemIds)
      .order("item_id")
      .range(from, to),
  );
  for (const row of rows) {
    if (!row.item_id || row.quantity === null) continue;
    held.set(row.item_id, (held.get(row.item_id) ?? 0) + row.quantity);
  }
  return held;
}
