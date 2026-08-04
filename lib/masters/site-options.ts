/**
 * The single "For" picker's option list — one entry per PLACE, now that
 * plot ↔ unit is strictly one-to-one (migration 0029). A unit and its
 * plot are the same place, so forms ask one question where they used to
 * ask two: each unit appears once labelled with its plot, and a plot
 * whose unit isn't recorded yet appears on its own (nothing strands
 * mid-data-load).
 *
 * The value encoding is the one the PO form already used — "unit:<id>",
 * "plot:<id>", "" for general — so everything server-side (the XOR
 * checks, the mint RPCs, resolveScopeCode's unit-first order) is
 * untouched: a pair writes the unit id, a unit-less plot writes the
 * plot id.
 *
 * Pure and import-free so it can be tested directly.
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
  /** "unit:<id>" or "plot:<id>" — what the <option> submits. */
  value: string;
  /** "<unit> — <plot>" for a pair, "<plot> — no unit yet" alone. */
  label: string;
  /** The code the reference number would use (unit's for a pair). */
  code: string | null;
  /** The primary name, for warning messages ("V12A has no code yet"). */
  name: string;
};

/**
 * One option per place in the project: every unit (labelled with its
 * plot), then every plot that has no unit yet, all sorted by name.
 */
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

/**
 * The ids a picked value stands for — exactly one of plotId/unitId, or
 * neither for "" (general). Anything malformed reads as general; the
 * database's XOR checks and grants are the real boundary.
 */
export function decodeSite(value: string): { plotId: string | null; unitId: string | null } {
  if (value.startsWith("unit:")) return { plotId: null, unitId: value.slice("unit:".length) };
  if (value.startsWith("plot:")) return { plotId: value.slice("plot:".length), unitId: null };
  return { plotId: null, unitId: null };
}
