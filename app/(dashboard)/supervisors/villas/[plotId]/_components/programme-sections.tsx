import { Button, LinkButton } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { HealthPill } from "@/components/ui/health-pill";
import { Pill, type PillTone } from "@/components/ui/pill";
import { StageRail, type RailFill } from "@/components/ui/stage-rail";
import { formatDate, formatQuantity, formatShortDate } from "@/lib/format";
import {
  HEALTH_TONE,
  STAGE_STATUS_LABEL,
  WAITING_ON_LABEL,
  type StageStatus,
} from "@/lib/supervisors/programme";
import type { StageEvent, StageView, VillaProgramme } from "@/lib/supervisors/programme-queries";
import type {
  ContractorOption,
  EstimateQuickPick,
  VillaDetail,
  WorkOption,
} from "@/lib/supervisors/queries";
import { cn } from "@/lib/utils";
import { ChevronRight, ClipboardCheck, HardHat, Package } from "lucide-react";
import { StartChecklistDialog } from "./checklist-forms";
import { LabourLogDialog } from "./labour-forms";
import { RequestIssueDialog } from "./request-forms";
import {
  StageContractorSelect,
  StageSheet,
  StageStatusChips,
  SupervisorPicker,
  type StageControlData,
} from "./stage-controls";

const STATUS_TONE: Record<StageStatus, PillTone> = {
  not_started: "plain",
  working: "info",
  waiting: "warning",
  done: "success",
};

const RAIL_FILL: Record<StageStatus, RailFill> = {
  not_started: null,
  working: "working",
  waiting: "waiting",
  done: "done",
};

export function controlData(plotId: string, stage: StageView): StageControlData {
  return {
    plotId,
    groupId: stage.id,
    code: stage.code,
    name: stage.name,
    snapshot: {
      status: stage.status,
      waitingOn: stage.record?.waitingOn ?? null,
      waitingNote: stage.record?.waitingNote ?? null,
      startedOn: stage.record?.startedOn ?? null,
      finishedOn: stage.record?.finishedOn ?? null,
    },
    contractorId: stage.record?.contractorId ?? null,
    checklists: stage.checklists.map((entry) => ({
      name: entry.templateName,
      signedOff: entry.checklist?.status === "signed_off",
    })),
  };
}

function StatusPill({ stage }: { stage: StageView }) {
  const on = stage.record?.waitingOn;
  return (
    <Pill tone={STATUS_TONE[stage.status]} className="shrink-0">
      {stage.status === "waiting" && on
        ? `Waiting · ${WAITING_ON_LABEL[on].toLowerCase()}`
        : STAGE_STATUS_LABEL[stage.status]}
    </Pill>
  );
}

function waitingLine(stage: StageView): string | null {
  const record = stage.record;
  if (stage.status !== "waiting" || !record) return null;
  return `Waiting on ${record.waitingOn ? WAITING_ON_LABEL[record.waitingOn].toLowerCase() : "something"} since ${formatDate(record.statusChangedAt)}${record.waitingNote ? ` — ${record.waitingNote}` : ""}`;
}

/** The Design Management header, for a site: the plot number large, the villa, its health, who runs it, and where it stands. */
export function VillaHeader({
  villa,
  programme,
  plotId,
}: {
  villa: VillaDetail;
  programme: VillaProgramme;
  plotId: string;
}) {
  const { health } = programme;
  const done = programme.stages.filter((stage) => stage.status === "done").length;
  return (
    <Card className="flex flex-wrap items-start gap-x-5 gap-y-3 p-5">
      <div className="shrink-0">
        <p className="text-muted text-[10px] font-medium tracking-[0.14em] uppercase">Plot</p>
        <p className="text-foreground font-mono text-4xl leading-none font-bold tracking-tight">
          {villa.plotNumber}
        </p>
      </div>
      <div className="min-w-0 flex-1 basis-56">
        <p className="text-foreground font-display text-2xl font-medium">{villa.villaName}</p>
        <div className="text-muted mt-1 flex flex-wrap items-center gap-x-2 gap-y-1.5 text-sm">
          <span>{villa.projectName}</span>
          <HealthPill label={health.label} tone={HEALTH_TONE[health.kind]} />
          <SupervisorPicker
            plotId={plotId}
            supervisor={programme.supervisor}
            people={programme.people}
          />
        </div>
        {health.detail ? <p className="text-muted mt-1 text-xs">{health.detail}</p> : null}
        {programme.stages.length > 0 ? (
          <div className="mt-3 space-y-1">
            <StageRail
              segments={programme.stages.map((stage) => ({
                key: stage.id,
                label: `${stage.code} ${stage.name}`,
                status: STAGE_STATUS_LABEL[stage.status].toLowerCase(),
                fill: RAIL_FILL[stage.status],
                current: stage.status === "working" || stage.status === "waiting",
              }))}
            />
            <p className="text-muted text-xs">
              {`${done} of ${programme.stages.length} stages done · `}
              {villa.estimate
                ? `from official estimate ${villa.estimate.reference}`
                : "no official estimate yet, so every villa stage is listed"}
            </p>
          </div>
        ) : null}
      </div>
    </Card>
  );
}

function ChecklistButton({
  plotId,
  stage,
  templates,
}: {
  plotId: string;
  stage: StageView;
  templates: { id: string; name: string; itemCount: number }[];
}) {
  const open = stage.checklists.find((entry) => entry.checklist?.status === "open")?.checklist;
  if (open) {
    return (
      <LinkButton
        href={`/supervisors/villas/${plotId}/checklists/${open.id}`}
        variant="secondary"
        size="lg"
        className="w-full px-3 whitespace-nowrap"
      >
        <ClipboardCheck className="size-5" aria-hidden />
        {`Checklist ${open.answered}/${open.total}`}
      </LinkButton>
    );
  }
  const signed = stage.checklists.find((entry) => entry.checklist?.status === "signed_off");
  const startable = templates.filter((template) =>
    stage.checklists.some((entry) => entry.templateId === template.id),
  );
  if (startable.length === 0) {
    return signed?.checklist ? (
      <LinkButton
        href={`/supervisors/villas/${plotId}/checklists/${signed.checklist.id}`}
        variant="secondary"
        size="lg"
        className="w-full px-3 whitespace-nowrap"
      >
        <ClipboardCheck className="size-5" aria-hidden />
        Signed off
      </LinkButton>
    ) : null;
  }
  return (
    <StartChecklistDialog
      plotId={plotId}
      templates={startable}
      workGroupId={stage.id}
      trigger={
        <Button variant="secondary" size="lg" className="w-full px-3 whitespace-nowrap">
          <ClipboardCheck className="size-5" aria-hidden />
          {signed ? "Checklist again" : "Checklist"}
        </Button>
      }
    />
  );
}

/** A stage being worked: what it is, how far, and the four things a supervisor does on it. */
export function NowCard({
  plotId,
  stage,
  works,
  contractors,
  villa,
  categories,
  brands,
  templates,
}: {
  plotId: string;
  stage: StageView;
  works: WorkOption[];
  contractors: ContractorOption[];
  villa: VillaDetail;
  categories: { id: string; name: string }[];
  brands: { id: string; name: string }[];
  templates: { id: string; name: string; itemCount: number }[];
}) {
  const stageWorkIds = stage.works.map((work) => work.id);
  const measured = stage.progress.filter((row) => row.estimated !== null);
  return (
    <Card className="space-y-4 p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-muted font-mono text-xs">{stage.code}</p>
          <p className="text-foreground text-[17px] leading-snug font-semibold">{stage.name}</p>
          <p className="text-muted mt-0.5 text-sm">
            {[stage.day ? `Day ${stage.day}` : null, stage.contractorName ?? "No contractor yet"]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
        <StatusPill stage={stage} />
      </div>

      {waitingLine(stage) ? <p className="text-warning text-sm">{waitingLine(stage)}</p> : null}

      {measured.length > 0 ? (
        <ul className="space-y-1 text-sm">
          {measured.map((row) => (
            <li key={row.workItemId} className="flex justify-between gap-3">
              <span className="text-muted min-w-0 truncate">{row.label}</span>
              <span className="text-foreground shrink-0 tabular-nums">
                {`${formatQuantity(row.logged)} of ${formatQuantity(row.estimated)} ${row.uom}`}
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="grid grid-cols-2 gap-2">
        <div className="col-span-2">
          <LabourLogDialog
            plotId={plotId}
            works={works}
            contractors={contractors}
            stageWorkIds={stageWorkIds}
            contractorId={stage.record?.contractorId ?? null}
            trigger={
              <Button variant="primary" size="lg" className="w-full">
                <HardHat className="size-5" aria-hidden />
                Log labour
              </Button>
            }
          />
        </div>
        <div className={stage.checklists.length > 0 ? undefined : "col-span-2"}>
          <RequestIssueDialog
            plotId={plotId}
            works={works}
            hasEstimate={villa.estimate !== null}
            quickPicks={villa.quickPicks}
            categories={categories}
            brands={brands}
            stageWorkIds={stageWorkIds}
            trigger={
              <Button variant="secondary" size="lg" className="w-full">
                <Package className="size-5" aria-hidden />
                Material
              </Button>
            }
          />
        </div>
        {stage.checklists.length > 0 ? (
          <ChecklistButton plotId={plotId} stage={stage} templates={templates} />
        ) : null}
      </div>

      <StageStatusChips stage={controlData(plotId, stage)} />
    </Card>
  );
}

type Readiness = {
  key: string;
  materialName: string;
  uom: string;
  estimated: number;
  drawn: number | null;
  pick: EstimateQuickPick | null;
  held: number | null;
  left: number | null;
};

/** Each material the estimate needs for a stage: drawn so far, what the stores hold, and what is left to ask for. */
export function stageReadiness(
  stage: StageView,
  villa: VillaDetail,
  stock: Map<string, number>,
): Readiness[] {
  const workIds = new Set(stage.works.map((work) => work.id));
  return villa.workGroups
    .filter((group) => workIds.has(group.workItemId))
    .flatMap((group) =>
      group.rows.map((row) => {
        const pick =
          villa.quickPicks.find(
            (entry) =>
              entry.workItemId === row.workItemId && entry.materialName === row.materialName,
          ) ?? null;
        const sameUnit =
          pick !== null && pick.itemUom.trim().toLowerCase() === row.uom.trim().toLowerCase();
        // Rounded so a request never pre-fills 7.099999999999999.
        const left =
          Math.round(
            (row.issued !== null ? Math.max(row.estimated - row.issued, 0) : row.estimated) * 1000,
          ) / 1000;
        return {
          key: `${row.workItemId}-${row.materialName}`,
          materialName: row.materialName,
          uom: row.uom,
          estimated: row.estimated,
          drawn: row.issued,
          pick,
          held: pick ? (stock.get(pick.itemId) ?? 0) : null,
          left: sameUnit ? left : null,
        };
      }),
    );
}

/** A stage coming up: who will do it, and whether its material is ready. */
export function NextCard({
  plotId,
  stage,
  readiness,
  works,
  contractors,
  villa,
  categories,
  brands,
}: {
  plotId: string;
  stage: StageView;
  readiness: Readiness[];
  works: WorkOption[];
  contractors: ContractorOption[];
  villa: VillaDetail;
  categories: { id: string; name: string }[];
  brands: { id: string; name: string }[];
}) {
  const control = controlData(plotId, stage);
  return (
    <Card className="space-y-4 p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-muted font-mono text-xs">{stage.code}</p>
          <p className="text-foreground text-[17px] leading-snug font-semibold">{stage.name}</p>
        </div>
        <StatusPill stage={stage} />
      </div>

      <div className="space-y-1.5">
        <label htmlFor={`next-contractor-${stage.id}`} className="text-muted text-xs">
          Contractor
        </label>
        <StageContractorSelect
          stage={control}
          contractors={contractors}
          id={`next-contractor-${stage.id}`}
        />
      </div>

      <div className="space-y-2">
        <p className="text-muted text-[11px] font-medium tracking-[0.14em] uppercase">Material</p>
        {readiness.length === 0 ? (
          <p className="text-muted text-sm">
            {villa.estimate
              ? "The official estimate lists no material for this stage."
              : "No official estimate yet, so there is nothing to check the material against."}
          </p>
        ) : (
          <ul className="divide-border divide-y">
            {readiness.map((row) => (
              <li key={row.key} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <div className="min-w-0">
                  <p className="text-foreground text-sm font-medium">{row.materialName}</p>
                  <p className="text-muted text-xs">
                    {[
                      `Estimate ${formatQuantity(row.estimated)} ${row.uom}`,
                      `drawn ${row.drawn === null ? "—" : formatQuantity(row.drawn)}`,
                      row.pick
                        ? `stores hold ${formatQuantity(row.held)} ${row.pick.itemUom}`
                        : "not linked to a catalogue item",
                    ].join(" · ")}
                  </p>
                </div>
                {row.pick && row.left !== 0 ? (
                  <RequestIssueDialog
                    plotId={plotId}
                    works={works}
                    hasEstimate={villa.estimate !== null}
                    quickPicks={villa.quickPicks}
                    categories={categories}
                    brands={brands}
                    preset={{
                      workItemId: row.pick.workItemId,
                      item: { id: row.pick.itemId, name: row.pick.itemName, uom: row.pick.itemUom },
                      quantity: row.left,
                    }}
                    trigger={
                      <Button variant="secondary" size="sm">
                        Request what&apos;s left
                      </Button>
                    }
                  />
                ) : row.left === 0 ? (
                  <Pill tone="success">All drawn</Pill>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>

      <StageStatusChips stage={control} />
    </Card>
  );
}

/** Every stage of the villa as a row, in site order; a tap opens the stage. */
export function ProgrammeList({
  plotId,
  stages,
  contractors,
}: {
  plotId: string;
  stages: StageView[];
  contractors: ContractorOption[];
}) {
  return (
    <Card className="divide-border divide-y p-0">
      {stages.map((stage) => {
        const record = stage.record;
        const dates =
          stage.status === "done" && record?.startedOn && record.finishedOn
            ? `${formatShortDate(record.startedOn)} – ${formatShortDate(record.finishedOn)}`
            : record?.startedOn
              ? `From ${formatShortDate(record.startedOn)}`
              : null;
        const checklist = stage.checklists.find((entry) => entry.checklist)?.checklist;
        return (
          <StageSheet
            key={stage.id}
            stage={controlData(plotId, stage)}
            contractors={contractors}
            waitingLine={waitingLine(stage)}
            trigger={
              <button
                type="button"
                className="hover:bg-foreground/[0.025] focus-visible:ring-accent/25 flex min-h-14 w-full items-center gap-3 px-4 py-2.5 text-left first:rounded-t-2xl last:rounded-b-2xl focus-visible:ring-4 focus-visible:outline-none"
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    "size-2.5 shrink-0 rounded-full",
                    stage.status === "done" && "bg-accent",
                    stage.status === "working" && "bg-info",
                    stage.status === "waiting" && "bg-warning",
                    stage.status === "not_started" && "bg-foreground/15",
                  )}
                />
                <span className="min-w-0 flex-1">
                  <span className="text-foreground block truncate text-sm font-medium">
                    <span className="text-muted font-mono text-xs">{stage.code}</span> {stage.name}
                  </span>
                  <span className="text-muted block truncate text-xs">
                    {[
                      STAGE_STATUS_LABEL[stage.status],
                      dates,
                      stage.contractorName,
                      checklist
                        ? checklist.status === "signed_off"
                          ? "checklist signed off"
                          : `checklist ${checklist.answered}/${checklist.total}`
                        : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </span>
                <ChevronRight className="text-muted size-4 shrink-0" aria-hidden />
              </button>
            }
          />
        );
      })}
    </Card>
  );
}

const EVENT_VERB: Record<StageStatus, string> = {
  not_started: "set back to not started",
  working: "started",
  waiting: "waiting",
  done: "done",
};

export function StageHistory({ events }: { events: StageEvent[] }) {
  if (events.length === 0) {
    return (
      <p className="text-muted text-sm">Nothing yet — each change of a stage is written here.</p>
    );
  }
  return (
    <ul className="divide-border divide-y">
      {events.map((event) => (
        <li key={event.id} className="py-2 text-sm">
          <p className="text-foreground">
            {event.kind === "baseline"
              ? "The first plan was set"
              : `${event.stageLabel ?? "A stage"} ${event.toStatus ? EVENT_VERB[event.toStatus] : ""}${
                  event.toStatus === "waiting" && event.waitingOn
                    ? ` on ${WAITING_ON_LABEL[event.waitingOn].toLowerCase()}`
                    : ""
                }`}
          </p>
          <p className="text-muted text-xs">
            {[formatDate(event.at), event.actorName ?? "by the system", event.note]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </li>
      ))}
    </ul>
  );
}
