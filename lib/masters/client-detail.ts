import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { ClientRow } from "./clients";
import type { UnitStatus, UnitType } from "./units";

// Reads only open surfaces: units/projects/selections are readable by
// every authenticated user. approved_budgets is grant-gated to
// /budgets|/indents — the caller says whether the viewer holds one, and
// without it the budget column is omitted entirely rather than shown
// as a misleading blank.

export type ClientUnit = {
  id: string;
  name: string;
  code: string | null;
  unit_type: UnitType;
  status: UnitStatus;
  project_id: string;
  projectName: string;
  /** Latest issued selection revision, null when nothing issued yet. */
  issuedRevision: number | null;
  issuedAt: string | null;
  /** Only meaningful when includeBudgets was true; null otherwise. */
  budgetApproved: boolean | null;
};

export type ClientDetail = {
  client: ClientRow;
  /** Who last edited the client, when updated_by is stamped. */
  updatedByName: string | null;
  units: ClientUnit[];
};

export async function getClientDetail(
  id: string,
  { includeBudgets }: { includeBudgets: boolean },
): Promise<ClientDetail | null> {
  const supabase = await createClient();

  const { data: client } = await supabase.from("clients").select("*").eq("id", id).maybeSingle();
  if (!client) return null;

  const { data: unitRows } = await supabase
    .from("units")
    .select("id, name, code, unit_type, status, project_id")
    .eq("client_id", id)
    .order("name")
    .order("id");
  const units = unitRows ?? [];
  const unitIds = units.map((u) => u.id);

  const [projectRes, selectionRes, budgetRes] = await Promise.all([
    supabase.from("projects").select("id, name"),
    unitIds.length
      ? supabase
          .from("selections")
          .select("unit_id, revision_no, issued_at")
          .in("unit_id", unitIds)
          .eq("status", "issued")
      : Promise.resolve({
          data: [] as { unit_id: string; revision_no: number; issued_at: string | null }[],
        }),
    includeBudgets && unitIds.length
      ? supabase.from("approved_budgets").select("unit_id").in("unit_id", unitIds)
      : Promise.resolve({ data: null }),
  ]);

  const projectNames = new Map((projectRes.data ?? []).map((p) => [p.id, p.name]));
  const issuedByUnit = new Map(
    (selectionRes.data ?? []).map((s) => [s.unit_id, { revision: s.revision_no, at: s.issued_at }]),
  );
  const budgetUnits = includeBudgets
    ? new Set((budgetRes.data ?? []).map((b) => b.unit_id).filter((id): id is string => !!id))
    : null;

  let updatedByName: string | null = null;
  if (client.updated_by) {
    const { data: editor } = await supabase
      .from("profiles")
      .select("full_name")
      .eq("id", client.updated_by)
      .maybeSingle();
    updatedByName = editor?.full_name ?? null;
  }

  return {
    client: client as ClientRow,
    updatedByName,
    units: units.map((u) => ({
      id: u.id,
      name: u.name,
      code: u.code,
      unit_type: u.unit_type as UnitType,
      status: u.status as UnitStatus,
      project_id: u.project_id,
      projectName: projectNames.get(u.project_id) ?? "—",
      issuedRevision: issuedByUnit.get(u.id)?.revision ?? null,
      issuedAt: issuedByUnit.get(u.id)?.at ?? null,
      budgetApproved: budgetUnits ? budgetUnits.has(u.id) : null,
    })),
  };
}
