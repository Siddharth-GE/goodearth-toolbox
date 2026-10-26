import "server-only";

import { requireTool } from "@/lib/auth/access";
import { fetchAll } from "@/lib/supabase/fetch-all";
import { createClient } from "@/lib/supabase/server";
import type { ReconciliationApproval } from "./estimate-queries";
import { fail, GRANT } from "./shared";

/* Indent lines outside the estimate (0113): the indent waits for the estimator's yes. Indents' tables are open to every signed-in person (0019),
 * so these are plain reads; the answer is written through decide_indent_line(). A DIRECT line has no budget, construction or estimate anchor (same test as indents_guard). */

type Client = Awaited<ReturnType<typeof createClient>>;

export type IndentLineForEstimator = {
  id: string;
  item_id: string;
  item_name: string;
  item_code: string | null;
  quantity: number;
  uom: string;
  reason: string | null;
  decision: "approved" | "refused" | null;
  decided_by_name: string | null;
  decided_at: string | null;
  note: string | null;
};

export type IndentForEstimator = {
  id: string;
  reference: string;
  project_name: string;
  villa: string | null;
  work_label: string | null;
  submitted_by_name: string | null;
  submitted_at: string | null;
  working_estimate_id: string | null;
  lines: IndentLineForEstimator[];
};

const DIRECT_LINE = <T extends { is: (column: string, value: null) => T }>(query: T): T =>
  query.is("budget_id", null).is("construction_line_id", null).is("estimate_id", null);

async function submittedIndents(supabase: Client) {
  return fetchAll<{
    id: string;
    reference: string | null;
    plot_id: string | null;
    unit_id: string | null;
    work_item_id: string | null;
    work_group_id: string | null;
    submitted_by: string | null;
    submitted_at: string | null;
    projects: { name: string } | null;
    plots: { name: string } | null;
    units: { name: string } | null;
  }>((from, to) =>
    supabase
      .from("indents")
      .select(
        "id, reference, plot_id, unit_id, work_item_id, work_group_id, submitted_by, submitted_at, projects(name), plots(name), units(name)",
      )
      .eq("status", "submitted")
      .order("submitted_at")
      .order("id")
      .range(from, to),
  );
}

/** Submitted indents with lines outside the estimate, oldest first; answered lines stay until the indent moves on. */
export async function getIndentsForEstimator(): Promise<IndentForEstimator[]> {
  await requireTool(GRANT);
  const supabase = await createClient();

  const indents = await submittedIndents(supabase);
  if (indents.length === 0) return [];

  const lines = await fetchAll<{
    id: string;
    indent_id: string;
    item_id: string;
    quantity: number;
    uom: string;
    off_estimate_reason: string | null;
    estimator_decision: string | null;
    estimator_decided_by: string | null;
    estimator_decided_at: string | null;
    estimator_note: string | null;
    items: { name: string; code: string | null } | null;
  }>((from, to) =>
    DIRECT_LINE(
      supabase
        .from("indent_lines")
        .select(
          "id, indent_id, item_id, quantity, uom, off_estimate_reason, estimator_decision, estimator_decided_by, estimator_decided_at, estimator_note, items(name, code)",
        )
        .in(
          "indent_id",
          indents.map((indent) => indent.id),
        ),
    )
      .order("created_at")
      .order("id")
      .range(from, to),
  );
  if (lines.length === 0) return [];

  const waiting = indents.filter((indent) => lines.some((line) => line.indent_id === indent.id));

  const personIds = [
    ...new Set(
      [
        ...waiting.map((indent) => indent.submitted_by),
        ...lines.map((line) => line.estimator_decided_by),
      ].filter((id): id is string => id !== null),
    ),
  ];
  const workIds = [
    ...new Set(waiting.map((indent) => indent.work_item_id).filter((id) => id !== null)),
  ] as string[];
  const plotIds = [
    ...new Set(waiting.filter((indent) => !indent.unit_id && indent.plot_id).map((i) => i.plot_id)),
  ] as string[];

  const groupIds = [
    ...new Set(waiting.map((indent) => indent.work_group_id).filter((id) => id !== null)),
  ] as string[];
  const [profiles, works, plotUnits, groups] = await Promise.all([
    personIds.length
      ? supabase.from("profiles").select("id, full_name").in("id", personIds)
      : Promise.resolve({ data: [], error: null }),
    workIds.length
      ? supabase.from("work_items").select("id, code, name").in("id", workIds)
      : Promise.resolve({ data: [], error: null }),
    plotIds.length
      ? supabase.from("units").select("id, plot_id").in("plot_id", plotIds)
      : Promise.resolve({ data: [], error: null }),
    groupIds.length
      ? supabase.from("work_groups").select("id, code, name").in("id", groupIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (profiles.error) fail("the names on the indents", profiles.error);
  if (groups.error) fail("the indents' stages", groups.error);
  const groupById = new Map(
    (groups.data ?? []).map((row) => [row.id, `${row.code} — ${row.name}`] as const),
  );
  if (works.error) fail("the indents' works", works.error);
  if (plotUnits.error) fail("the indents' villas", plotUnits.error);

  const nameById = new Map((profiles.data ?? []).map((row) => [row.id, row.full_name]));
  const workById = new Map(
    (works.data ?? []).map((row) => [row.id, `${row.code} — ${row.name}`] as const),
  );
  const unitByPlot = new Map(
    (plotUnits.data ?? []).map((row) => [row.plot_id as string, row.id] as const),
  );
  const unitOf = (indent: (typeof waiting)[number]) =>
    indent.unit_id ?? (indent.plot_id ? (unitByPlot.get(indent.plot_id) ?? null) : null);

  const unitIds = [...new Set(waiting.map(unitOf).filter((id) => id !== null))] as string[];
  const { data: working, error: workingError } = unitIds.length
    ? await supabase
        .from("estimator_estimates")
        .select("id, unit_id")
        .eq("is_working", true)
        .in("unit_id", unitIds)
    : { data: [], error: null };
  if (workingError) fail("the villas' working estimates", workingError);
  const workingByUnit = new Map((working ?? []).map((row) => [row.unit_id, row.id]));

  return waiting.map((indent) => {
    const unitId = unitOf(indent);
    return {
      id: indent.id,
      reference: indent.reference ?? "—",
      project_name: indent.projects?.name ?? "—",
      villa: indent.units?.name ?? indent.plots?.name ?? null,
      work_label: indent.work_group_id
        ? (groupById.get(indent.work_group_id) ?? null)
        : indent.work_item_id
          ? (workById.get(indent.work_item_id) ?? null)
          : null,
      submitted_by_name: indent.submitted_by ? (nameById.get(indent.submitted_by) ?? null) : null,
      submitted_at: indent.submitted_at,
      working_estimate_id: unitId ? (workingByUnit.get(unitId) ?? null) : null,
      lines: lines
        .filter((line) => line.indent_id === indent.id)
        .map((line) => ({
          id: line.id,
          item_id: line.item_id,
          item_name: line.items?.name ?? "An item",
          item_code: line.items?.code ?? null,
          quantity: line.quantity,
          uom: line.uom,
          reason: line.off_estimate_reason,
          decision:
            line.estimator_decision === "approved" || line.estimator_decision === "refused"
              ? line.estimator_decision
              : null,
          decided_by_name: line.estimator_decided_by
            ? (nameById.get(line.estimator_decided_by) ?? null)
            : null,
          decided_at: line.estimator_decided_at,
          note: line.estimator_note,
        })),
    };
  });
}

export async function countIndentLinesWaiting(): Promise<number> {
  await requireTool(GRANT);
  const supabase = await createClient();

  const indents = await submittedIndents(supabase);
  if (indents.length === 0) return 0;
  const { count, error } = await DIRECT_LINE(
    supabase
      .from("indent_lines")
      .select("id", { count: "exact", head: true })
      .in(
        "indent_id",
        indents.map((indent) => indent.id),
      ),
  ).is("estimator_decision", null);
  if (error) fail("the indent lines waiting", error);
  return count ?? 0;
}

/** Lines the estimator approved at the indent, keyed "unitId work item" like getApprovalsFor, so Site check does not ask again. */
export async function getIndentApprovalsFor(
  units: { id: string; plot_id: string | null }[],
): Promise<Map<string, ReconciliationApproval>> {
  await requireTool(GRANT);
  if (units.length === 0) return new Map();
  const supabase = await createClient();

  const villaUnits = new Set(units.map((unit) => unit.id));
  const unitByPlot = new Map(
    units.flatMap((unit) => (unit.plot_id ? [[unit.plot_id, unit.id] as const] : [])),
  );

  // Approved lines first (few), then only their indents, so no request carries a long id list.
  const lines = await fetchAll<{
    indent_id: string;
    item_id: string;
    estimator_decided_by: string | null;
    estimator_decided_at: string | null;
    estimator_note: string | null;
  }>((from, to) =>
    DIRECT_LINE(
      supabase
        .from("indent_lines")
        .select("indent_id, item_id, estimator_decided_by, estimator_decided_at, estimator_note")
        .eq("estimator_decision", "approved"),
    )
      .order("id")
      .range(from, to),
  );
  if (lines.length === 0) return new Map();

  const indents = await fetchAll<{
    id: string;
    reference: string | null;
    unit_id: string | null;
    plot_id: string | null;
    work_item_id: string | null;
    work_group_id: string | null;
  }>((from, to) =>
    supabase
      .from("indents")
      .select("id, reference, unit_id, plot_id, work_item_id, work_group_id")
      .in("id", [...new Set(lines.map((line) => line.indent_id))])
      // A cancelled indent (0143) bought nothing, so its answers settle nothing.
      .neq("status", "cancelled")
      .order("id")
      .range(from, to),
  );

  const approverIds = [
    ...new Set(lines.map((line) => line.estimator_decided_by).filter((id) => id !== null)),
  ] as string[];
  const { data: approvers, error } = approverIds.length
    ? await supabase.from("profiles").select("id, full_name").in("id", approverIds)
    : { data: [], error: null };
  if (error) fail("the approvers' names", error);
  const nameById = new Map((approvers ?? []).map((row) => [row.id, row.full_name]));

  // A stage indent's yes covers the item on every work of that stage (0158).
  const stageIds = [
    ...new Set(indents.map((indent) => indent.work_group_id).filter((id) => id !== null)),
  ] as string[];
  const stageWorks = stageIds.length
    ? await fetchAll<{ id: string; group_id: string | null }>((from, to) =>
        supabase
          .from("work_items")
          .select("id, group_id")
          .in("group_id", stageIds)
          .order("id")
          .range(from, to),
      )
    : [];
  const worksOfStage = new Map<string, string[]>();
  for (const work of stageWorks) {
    if (work.group_id)
      worksOfStage.set(work.group_id, [...(worksOfStage.get(work.group_id) ?? []), work.id]);
  }

  const indentById = new Map(indents.map((indent) => [indent.id, indent]));
  const approvals = new Map<string, ReconciliationApproval>();
  for (const line of lines) {
    const indent = indentById.get(line.indent_id);
    if (!indent) continue;
    const unitId =
      indent.unit_id ?? (indent.plot_id ? (unitByPlot.get(indent.plot_id) ?? null) : null);
    if (!unitId || !villaUnits.has(unitId)) continue;
    const workIds: (string | null)[] = indent.work_group_id
      ? (worksOfStage.get(indent.work_group_id) ?? [])
      : [indent.work_item_id];
    for (const workItemId of workIds)
      approvals.set(`${unitId} ${workItemId ?? ""} ${line.item_id}`, {
        workItemId,
        itemId: line.item_id,
        note: [`At indent ${indent.reference ?? ""}`.trim(), line.estimator_note]
          .filter(Boolean)
          .join(" — "),
        approvedByName:
          (line.estimator_decided_by ? nameById.get(line.estimator_decided_by) : null) ??
          "a colleague",
        approvedAt: line.estimator_decided_at ?? "",
      });
  }
  return approvals;
}
