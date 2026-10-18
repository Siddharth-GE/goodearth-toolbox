import "server-only";

import { createClient } from "@/lib/supabase/server";
import { assertRead, readFailed } from "@/lib/supabase/read-failed";
import type { ClientRow } from "./clients";
import type { UnitStatus, UnitType } from "./units";

// approved_budgets is gated to /budgets|/indents; without one the budget column is omitted, not shown blank.

export type ClientUnit = {
  id: string;
  name: string;
  code: string | null;
  unit_type: UnitType;
  status: UnitStatus;
  project_id: string;
  projectName: string;
  issuedRevision: number | null;
  issuedAt: string | null;
  budgetApproved: boolean | null;
};

export type ClientDetail = {
  client: ClientRow;
  updatedByName: string | null;
  units: ClientUnit[];
};

export async function getClientDetail(
  id: string,
  { includeBudgets }: { includeBudgets: boolean },
): Promise<ClientDetail | null> {
  const supabase = await createClient();

  const { data: client, error: clientError } = await supabase
    .from("clients")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (clientError) readFailed("Masters", "this client", clientError);
  if (!client) return null;

  const { data: unitRows, error: unitError } = await supabase
    .from("units")
    .select("id, name, code, unit_type, status, project_id")
    .eq("client_id", id)
    .order("name")
    .order("id");
  if (unitError) readFailed("Masters", "this client's units", unitError);
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
          error: null,
        }),
    includeBudgets && unitIds.length
      ? supabase.from("approved_budgets").select("unit_id").in("unit_id", unitIds)
      : Promise.resolve({ data: null, error: null }),
  ]);
  assertRead("Masters", "the projects", projectRes.error);
  assertRead("Masters", "this client's selections", selectionRes.error);
  assertRead("Masters", "this client's budgets", budgetRes.error);

  const projectNames = new Map((projectRes.data ?? []).map((p) => [p.id, p.name]));
  const issuedByUnit = new Map(
    (selectionRes.data ?? []).map((s) => [s.unit_id, { revision: s.revision_no, at: s.issued_at }]),
  );
  const budgetUnits = includeBudgets
    ? new Set((budgetRes.data ?? []).map((b) => b.unit_id).filter((id): id is string => !!id))
    : null;

  let updatedByName: string | null = null;
  if (client.updated_by) {
    const { data: editor, error: editorError } = await supabase
      .from("profiles")
      .select("full_name")
      .eq("id", client.updated_by)
      .maybeSingle();
    if (editorError) readFailed("Masters", "who last edited this client", editorError);
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
