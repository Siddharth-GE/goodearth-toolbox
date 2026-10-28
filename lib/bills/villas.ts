// Pure, no database. A contractor's labour bill puts each line on a villa of the bill's company (0166); a line with
// no villa of its own is on the bill's. bill_lines_guard is the real boundary; this is the screen's side of it.

import { roundPaise } from "@/lib/line-money";
import {
  buildSiteOptions,
  type SitePlotInput,
  type SiteUnitInput,
} from "@/lib/masters/site-options";

export type LineVilla = { projectId: string | null; plotId: string | null; unitId: string | null };

export const NO_VILLA: LineVilla = { projectId: null, plotId: null, unitId: null };

export const hasVilla = (villa: LineVilla) =>
  Boolean(villa.projectId || villa.plotId || villa.unitId);

/** A line's own villa, else the bill's. */
export const villaOfLine = (line: LineVilla, bill: LineVilla): LineVilla =>
  hasVilla(line) ? line : bill;

/** One picker value per place: the site picker's "unit:<id>" or "plot:<id>", or "project:<id>" for the whole
 * project. A plot with a unit reads as its unit (1:1 since 0029), so a bill made on the plot shows in the picker. */
export function villaValue(villa: LineVilla, unitOfPlot: Record<string, string>): string {
  if (villa.unitId) return `unit:${villa.unitId}`;
  if (villa.plotId) {
    const unitId = unitOfPlot[villa.plotId];
    return unitId ? `unit:${unitId}` : `plot:${villa.plotId}`;
  }
  return villa.projectId ? `project:${villa.projectId}` : "";
}

export type VillaChoice = {
  value: string;
  label: string;
  projectId: string;
  projectName: string;
};

export type VillaProject = { id: string; name: string };

/** Every place on the given projects, each project's "Whole project" first, for a line's picker. */
export function villaChoices(
  projects: VillaProject[],
  units: SiteUnitInput[],
  plots: SitePlotInput[],
): VillaChoice[] {
  return projects.flatMap((project) => [
    {
      value: `project:${project.id}`,
      label: `Whole project — ${project.name}`,
      projectId: project.id,
      projectName: project.name,
    },
    ...buildSiteOptions(units, plots, project.id).map((option) => ({
      value: option.value,
      label: option.code ? `${option.name} (${option.code})` : option.name,
      projectId: project.id,
      projectName: project.name,
    })),
  ]);
}

/** The picked value as the line's villa, its project from the choice. Unknown values are no villa. */
export function villaFromValue(value: string, choices: VillaChoice[]): LineVilla {
  const choice = choices.find((candidate) => candidate.value === value);
  if (!choice) return NO_VILLA;
  if (value.startsWith("unit:")) {
    return { projectId: choice.projectId, plotId: null, unitId: value.slice("unit:".length) };
  }
  if (value.startsWith("plot:")) {
    return { projectId: choice.projectId, plotId: value.slice("plot:".length), unitId: null };
  }
  return { projectId: choice.projectId, plotId: null, unitId: null };
}

/** The header of a new contractor's bill: the lines' one villa when they share one in the bill's project, else none
 * (the bill is then for the whole project, and each line says where). */
export function headerVilla(
  projectId: string,
  lines: LineVilla[],
): { plotId: string | null; unitId: string | null } {
  const first = lines[0];
  const shared =
    first &&
    (first.plotId || first.unitId) &&
    first.projectId === projectId &&
    lines.every(
      (line) =>
        line.projectId === first.projectId &&
        line.plotId === first.plotId &&
        line.unitId === first.unitId,
    );
  return shared ? { plotId: first.plotId, unitId: first.unitId } : { plotId: null, unitId: null };
}

export type VillaGroup<T> = {
  key: string;
  villa: LineVilla;
  lines: T[];
  /** The lines' totals added, to the paisa. */
  total: number;
};

/** Lines grouped by their villa (the bill's when a line has none), groups in the order they first appear. */
export function groupByVilla<T>(
  lines: T[],
  villaOf: (line: T) => LineVilla,
  amountOf: (line: T) => number,
): VillaGroup<T>[] {
  const groups = new Map<string, VillaGroup<T>>();
  for (const line of lines) {
    const villa = villaOf(line);
    const key = `${villa.projectId ?? ""}/${villa.plotId ?? ""}/${villa.unitId ?? ""}`;
    const group = groups.get(key) ?? { key, villa, lines: [], total: 0 };
    group.lines.push(line);
    group.total = roundPaise(group.total + amountOf(line));
    groups.set(key, group);
  }
  return [...groups.values()];
}

/** What a contractor's bill offers its lines: every place of its company's projects, its own project first. */
export type LineVillas = {
  choices: VillaChoice[];
  unitOfPlot: Record<string, string>;
  /** The bill's own villa, which a line with none is on; none yet on a new bill. */
  bill: LineVilla;
};

export function companyVillas(
  projectId: string,
  projects: (VillaProject & { company_id: string | null })[],
  units: SiteUnitInput[],
  plots: SitePlotInput[],
): Omit<LineVillas, "bill"> {
  const own = projects.find((project) => project.id === projectId);
  const sameCompany = projects
    .filter(
      (project) =>
        project.id === projectId ||
        (own?.company_id != null && project.company_id === own.company_id),
    )
    .sort((a, b) =>
      a.id === projectId ? -1 : b.id === projectId ? 1 : a.name.localeCompare(b.name),
    );
  const unitOfPlot: Record<string, string> = {};
  for (const unit of units) if (unit.plot_id) unitOfPlot[unit.plot_id] = unit.id;
  return { choices: villaChoices(sameCompany, units, plots), unitOfPlot };
}

/** A villa's name as its picker shows it; with its project's when the bill reaches more than one project. */
export function villaLabel(
  villa: LineVilla,
  villas: Omit<LineVillas, "bill">,
  withProject = false,
): string {
  const choice = villas.choices.find(
    (candidate) => candidate.value === villaValue(villa, villas.unitOfPlot),
  );
  if (!choice) return "Villa";
  return withProject && !choice.value.startsWith("project:")
    ? `${choice.label} · ${choice.projectName}`
    : choice.label;
}

/** Whether these villas lie in more than one project, so their names need the project's. */
export const spansProjects = (villas: LineVilla[]) =>
  new Set(villas.map((villa) => villa.projectId)).size > 1;
