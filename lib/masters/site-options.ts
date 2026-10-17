/**
 * One option per place: a unit appears once labelled with its plot, a unit-less plot on its own (0029).
 * Value is "unit:<id>", "plot:<id>" or "" for general, so server-side checks and resolveScopeCode's unit-first order are unchanged.
 */

export type SitePlotInput = {
  id: string;
  project_id: string;
  name: string;
  code: string | null;
};

export type SiteUnitInput = SitePlotInput & {
  plot_id: string | null;
};

export type SiteOption = {
  value: string;
  label: string;
  code: string | null;
  name: string;
};

export function buildSiteOptions(
  units: SiteUnitInput[],
  plots: SitePlotInput[],
  projectId: string,
): SiteOption[] {
  if (!projectId) return [];

  const projectUnits = units.filter((unit) => unit.project_id === projectId);
  const projectPlots = plots.filter((plot) => plot.project_id === projectId);
  const plotsById = new Map(projectPlots.map((plot) => [plot.id, plot]));
  const takenPlotIds = new Set(projectUnits.map((unit) => unit.plot_id));

  const options: SiteOption[] = [];

  for (const unit of projectUnits) {
    const plot = unit.plot_id ? plotsById.get(unit.plot_id) : undefined;
    options.push({
      value: `unit:${unit.id}`,
      label: plot ? `${unit.name} — ${plot.name}` : unit.name,
      code: unit.code,
      name: unit.name,
    });
  }

  for (const plot of projectPlots) {
    if (takenPlotIds.has(plot.id)) continue;
    options.push({
      value: `plot:${plot.id}`,
      label: `${plot.name} — no unit yet`,
      code: plot.code,
      name: plot.name,
    });
  }

  return options.sort((a, b) => a.name.localeCompare(b.name));
}

/** Anything malformed reads as general; the database's XOR checks are the real boundary. */
export function decodeSite(value: string): { plotId: string | null; unitId: string | null } {
  if (value.startsWith("unit:")) return { plotId: null, unitId: value.slice("unit:".length) };
  if (value.startsWith("plot:")) return { plotId: value.slice("plot:".length), unitId: null };
  return { plotId: null, unitId: null };
}
