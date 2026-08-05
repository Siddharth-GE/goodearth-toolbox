import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { PlotRow } from "./plots";
import type { ProjectRow } from "./projects";
import type { UnitStatus } from "./units";

// Money confinement, same rule as vendor-detail: document activity
// comes from the money-free fact views and open tables only — counts
// and references, never an amount.

export type ProjectPlot = PlotRow & {
  /** The plot's unit (1:1 since 0029), or null while it waits for one. */
  unitName: string | null;
};

export type ProjectUnit = {
  id: string;
  name: string;
  code: string | null;
  status: UnitStatus;
  clientName: string | null;
  issuedRevision: number | null;
  /** Only meaningful when includeBudgets was true; null otherwise. */
  budgetApproved: boolean | null;
};

export type ProjectDetail = {
  project: ProjectRow;
  /** Who last edited the project, when updated_by is stamped. */
  updatedByName: string | null;
  plots: ProjectPlot[];
  plotTotal: number;
  units: ProjectUnit[];
  unitTotal: number;
  counts: { indents: number; pos: number; bills: number };
};

const RELATED_LIMIT = 50;

export async function getProjectDetail(
  id: string,
  { includeBudgets }: { includeBudgets: boolean },
): Promise<ProjectDetail | null> {
  const supabase = await createClient();

  const { data: project } = await supabase.from("projects").select("*").eq("id", id).maybeSingle();
  if (!project) return null;

  const [plotRes, unitRes, indentRes, poRes, billRes, clientRes] = await Promise.all([
    supabase
      .from("plots")
      .select("*", { count: "exact" })
      .eq("project_id", id)
      .order("name")
      .order("id")
      .limit(RELATED_LIMIT),
    supabase
      .from("units")
      .select("id, name, code, status, client_id", { count: "exact" })
      .eq("project_id", id)
      .order("name")
      .order("id")
      .limit(RELATED_LIMIT),
    supabase.from("indents").select("id", { count: "exact", head: true }).eq("project_id", id),
    supabase.from("po_facts").select("id", { count: "exact", head: true }).eq("project_id", id),
    supabase.from("bill_facts").select("id", { count: "exact", head: true }).eq("project_id", id),
    supabase.from("clients").select("id, name"),
  ]);

  const plots = (plotRes.data ?? []) as PlotRow[];
  const units = unitRes.data ?? [];
  const unitIds = units.map((u) => u.id);
  const plotIds = plots.map((p) => p.id);

  const [plotUnitRes, selectionRes, budgetRes] = await Promise.all([
    // Keyed on the plots actually shown, so the mapping is complete for
    // them even if the project somehow outgrows the units page above.
    plotIds.length
      ? supabase.from("units").select("plot_id, name").in("plot_id", plotIds)
      : Promise.resolve({ data: [] as { plot_id: string; name: string }[] }),
    unitIds.length
      ? supabase
          .from("selections")
          .select("unit_id, revision_no")
          .in("unit_id", unitIds)
          .eq("status", "issued")
      : Promise.resolve({ data: [] as { unit_id: string; revision_no: number }[] }),
    includeBudgets && unitIds.length
      ? supabase.from("approved_budgets").select("unit_id").in("unit_id", unitIds)
      : Promise.resolve({ data: null }),
  ]);

  const clientNames = new Map((clientRes.data ?? []).map((c) => [c.id, c.name]));
  const unitNameByPlot = new Map((plotUnitRes.data ?? []).map((u) => [u.plot_id, u.name]));
  const issuedByUnit = new Map((selectionRes.data ?? []).map((s) => [s.unit_id, s.revision_no]));
  const budgetUnits = includeBudgets
    ? new Set((budgetRes.data ?? []).map((b) => b.unit_id).filter((id): id is string => !!id))
    : null;

  let updatedByName: string | null = null;
  if (project.updated_by) {
    const { data: editor } = await supabase
      .from("profiles")
      .select("full_name")
      .eq("id", project.updated_by)
      .maybeSingle();
    updatedByName = editor?.full_name ?? null;
  }

  return {
    project: project as ProjectRow,
    updatedByName,
    plots: plots.map((plot) => ({ ...plot, unitName: unitNameByPlot.get(plot.id) ?? null })),
    plotTotal: plotRes.count ?? 0,
    units: units.map((u) => ({
      id: u.id,
      name: u.name,
      code: u.code,
      status: u.status as UnitStatus,
      clientName: u.client_id ? (clientNames.get(u.client_id) ?? null) : null,
      issuedRevision: issuedByUnit.get(u.id) ?? null,
      budgetApproved: budgetUnits ? budgetUnits.has(u.id) : null,
    })),
    unitTotal: unitRes.count ?? 0,
    counts: {
      indents: indentRes.count ?? 0,
      pos: poRes.count ?? 0,
      bills: billRes.count ?? 0,
    },
  };
}
