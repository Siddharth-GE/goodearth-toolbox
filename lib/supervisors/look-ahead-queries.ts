import "server-only";

import { listVendors } from "@/lib/masters/vendors";
import { listWorkItems } from "@/lib/masters/works";
import { readSiteVillas, type SiteVilla } from "./board-queries";
import {
  contractorLoads,
  lookAhead,
  stagesAhead,
  type BehindVilla,
  type ContractorLoad,
  type PlannedStage,
} from "./look-ahead";
import { stageOwner } from "./programme";
import { storeStock } from "./programme-queries";
import { getVillaDetail, type VillaDetail } from "./queries";
import { stageReadiness, type Readiness } from "./readiness";

/** The look ahead (plan.md phase E) and the welcome counts: every villa's forecast from the board's read, with the material
 * readiness of what starts in the next three weeks from each of those villas' own page reads. */

export type LookAheadRow = PlannedStage & {
  contractorName: string | null;
  workIds: string[];
  readiness: Readiness[];
};

export type LookAheadVilla = Pick<VillaDetail, "quickPicks"> & { hasEstimate: boolean };

export type LookAhead = {
  who: "mine" | "all";
  today: string;
  thisWeek: LookAheadRow[];
  nextTwoWeeks: LookAheadRow[];
  waiting: LookAheadRow[];
  behind: BehindVilla[];
  loads: (ContractorLoad & { contractorName: string })[];
  /** What a row's Request needs of its villa, by plot. */
  villas: Record<string, LookAheadVilla>;
};

function planned(villa: SiteVilla): PlannedStage[] {
  return stagesAhead(
    villa.stages.map((stage) => ({
      plotId: villa.card.plotId,
      plotName: villa.card.plotName,
      villaName: villa.card.villaName,
      groupId: stage.id,
      code: stage.code,
      name: stage.name,
      status: stage.status,
      startedOn: stage.record?.startedOn ?? null,
      start: stage.forecast.start,
      finish: stage.forecast.finish,
      days: stage.forecast.days,
      contractorId: stage.record?.contractorId ?? null,
      waitingOn: stage.record?.waitingOn ?? null,
    })),
  );
}

export async function getLookAhead(params: { who?: string }): Promise<LookAhead> {
  const [{ user, today, villas, leads }, contractors, works] = await Promise.all([
    readSiteVillas(),
    listVendors(),
    listWorkItems(),
  ]);
  // Mine: every stage of a villa I run, and on any other villa the stages I own (0158).
  const runs = (villa: SiteVilla) => villa.card.supervisor?.id === user.id;
  const ownedHere = (villa: SiteVilla) =>
    new Set(
      villa.stages
        .filter((stage) => stageOwner(stage, leads, new Map())?.id === user.id)
        .map((stage) => stage.id),
    );
  const runsAny = villas.some((villa) => runs(villa) || ownedHere(villa).size > 0);
  const who = params.who === "mine" || params.who === "all" ? params.who : runsAny ? "mine" : "all";
  const scoped = villas.filter(
    (villa) => who === "all" || runs(villa) || ownedHere(villa).size > 0,
  );
  const stages = scoped.flatMap((villa) => {
    const all = planned(villa);
    if (who === "all" || runs(villa)) return all;
    const owned = ownedHere(villa);
    return all.filter((stage) => owned.has(stage.groupId));
  });
  const { thisWeek, nextTwoWeeks, waiting } = lookAhead(stages, today);

  // Readiness needs each villa's own materials read: only the villas with something starting.
  const plots = [...new Set([...thisWeek, ...nextTwoWeeks].map((stage) => stage.plotId))];
  const details = new Map(
    (await Promise.all(plots.map((plotId) => getVillaDetail(plotId)))).flatMap((detail, index) =>
      detail ? [[plots[index], detail] as const] : [],
    ),
  );
  const worksOf = (groupId: string) =>
    works.filter((work) => work.group_id === groupId && work.is_active).map((work) => work.id);
  const itemIds = new Set<string>();
  for (const stage of [...thisWeek, ...nextTwoWeeks]) {
    const detail = details.get(stage.plotId);
    if (!detail) continue;
    for (const row of stageReadiness(worksOf(stage.groupId), detail, new Map())) {
      if (row.pick) itemIds.add(row.pick.itemId);
    }
  }
  const stock = await storeStock([...itemIds]);

  const contractorName = new Map(contractors.map((vendor) => [vendor.id, vendor.name]));
  const row = (stage: PlannedStage, withReadiness: boolean): LookAheadRow => {
    const workIds = worksOf(stage.groupId);
    const detail = details.get(stage.plotId);
    return {
      ...stage,
      contractorName: stage.contractorId ? (contractorName.get(stage.contractorId) ?? null) : null,
      workIds,
      readiness: withReadiness && detail ? stageReadiness(workIds, detail, stock) : [],
    };
  };

  return {
    who,
    today,
    thisWeek: thisWeek.map((stage) => row(stage, true)),
    nextTwoWeeks: nextTwoWeeks.map((stage) => row(stage, true)),
    waiting: waiting.map((stage) => row(stage, false)),
    behind: scoped
      .flatMap((villa) =>
        villa.card.handover && villa.card.slip && villa.card.slip > 0
          ? [
              {
                plotId: villa.card.plotId,
                plotName: villa.card.plotName,
                villaName: villa.card.villaName,
                handover: villa.card.handover,
                slip: villa.card.slip,
              },
            ]
          : [],
      )
      .sort((a, b) => b.slip - a.slip),
    loads: contractorLoads(stages, today).map((load) => ({
      ...load,
      contractorName: contractorName.get(load.contractorId) ?? "A contractor",
    })),
    villas: Object.fromEntries(
      [...details.entries()].map(([plotId, detail]) => [
        plotId,
        { quickPicks: detail.quickPicks, hasEstimate: detail.estimate !== null },
      ]),
    ),
  };
}

/** The Supervisors welcome: counts only, across every villa. */
export async function getSiteCounts(): Promise<{
  working: number;
  startingThisWeek: number;
  waiting: number;
  toConfirm: number;
}> {
  const { today, villas } = await readSiteVillas();
  const stages = villas.flatMap(planned);
  const { thisWeek, waiting } = lookAhead(stages, today);
  return {
    working: stages.filter((stage) => stage.status === "working").length,
    startingThisWeek: thisWeek.length,
    waiting: waiting.length,
    toConfirm: villas.reduce((sum, villa) => sum + villa.card.toConfirm, 0),
  };
}
