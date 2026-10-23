import "server-only";

import { requireTool } from "@/lib/auth/access";
import { istDayEndExclusive, istDayStart, type Filterable } from "@/lib/list-params";
import { listPlots } from "@/lib/masters/plots";
import { listProjects } from "@/lib/masters/projects";
import { listWorkCategories, listWorkItems, workCategoryLabel } from "@/lib/masters/works";
import { listUnits } from "@/lib/masters/units";
import { fetchAll } from "@/lib/supabase/fetch-all";
import { assertRead } from "@/lib/supabase/read-failed";
import { createClient } from "@/lib/supabase/server";

import { stillToBuy, type IndentStatus } from "./workflow";

// Reads the tables directly under the /indents grant: another tool's queries open with their own requireTool and would redirect a site user.
// No money here: indents carry none, and interiors are read only through the approved_budgets views (0011 boundary).

const INDENTS_LIST_LIMIT = 50;

export type IndentListRow = {
  id: string;
  reference: string;
  status: IndentStatus;
  stage: string | null;
  required_by: string | null;
  is_urgent: boolean;
  created_at: string;
  project_name: string;
  unit_name: string | null;
  line_count: number;
  /** Lines still to buy: requested less live PO orders. Null unless approved. */
  lines_to_buy: number | null;
};

export type IndentListPage = {
  indents: IndentListRow[];
  total: number;
  page: number;
  pageCount: number;
  pageSize: number;
};

export async function getWelcomeCounts() {
  await requireTool("/indents");
  const supabase = await createClient();

  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);
  const since = startOfMonth.toISOString();

  const [submitted, drafts, approved, urgent] = await Promise.all([
    supabase.from("indents").select("id", { count: "exact", head: true }).eq("status", "submitted"),
    supabase.from("indents").select("id", { count: "exact", head: true }).eq("status", "draft"),
    supabase
      .from("indents")
      .select("id", { count: "exact", head: true })
      .eq("status", "approved")
      .gte("created_at", since),
    supabase
      .from("indents")
      .select("id", { count: "exact", head: true })
      .eq("status", "submitted")
      .eq("is_urgent", true),
  ]);

  assertRead(
    "indents",
    "the welcome counts",
    submitted.error ?? drafts.error ?? approved.error ?? urgent.error,
  );

  return {
    awaitingApproval: submitted.count ?? 0,
    drafts: drafts.count ?? 0,
    approvedThisMonth: approved.count ?? 0,
    urgentAwaiting: urgent.count ?? 0,
  };
}

export type IndentListFilters = {
  page?: number;
  status?: IndentStatus;
  projectId?: string;
  workItemId?: string;
  q?: string;
  from?: string;
  to?: string;
};

export async function listIndents({
  page = 1,
  status,
  projectId,
  workItemId,
  q,
  from,
  to,
}: IndentListFilters = {}): Promise<IndentListPage> {
  await requireTool("/indents");
  const supabase = await createClient();

  const pageSize = INDENTS_LIST_LIMIT;
  const currentPage = Math.max(1, page);

  // created_at is a timestamp, so the "to" day runs up to the day after it.
  const filtered = <T extends Filterable<T>>(query: T): T => {
    let next = query;
    // Cancelled indents show only when asked for by name.
    next = status ? next.eq("status", status) : next.neq("status", "cancelled");
    if (projectId) next = next.eq("project_id", projectId);
    if (workItemId) next = next.eq("work_item_id", workItemId);
    if (from) next = next.gte("created_at", istDayStart(from));
    if (to) next = next.lt("created_at", istDayEndExclusive(to));
    if (q) next = next.or(`reference.ilike.*${q}*`);
    return next;
  };

  const { data, count, error } = await filtered(
    supabase
      .from("indents")
      .select(
        "id, reference, status, stage, required_by, is_urgent, created_at, projects(name), units(name), indent_lines(count)",
        { count: "exact" },
      ),
  )
    // Urgent first in every list: the approver's emergencies, and site's own.
    .order("is_urgent", { ascending: false })
    .order("created_at", { ascending: false })
    .order("id")
    .range((currentPage - 1) * pageSize, currentPage * pageSize - 1);
  // A failed read is an error screen, never an empty list.
  if (error) {
    console.error("listIndents failed:", error);
    throw new Error("Could not read the indents.", { cause: error });
  }

  const linesToBuy = await countLinesToBuy(
    supabase,
    data.filter((row) => row.status === "approved").map((row) => row.id),
  );

  const total = count ?? 0;
  return {
    indents: data.map((row) => ({
      id: row.id,
      reference: row.reference ?? "—",
      status: row.status as IndentStatus,
      stage: row.stage,
      required_by: row.required_by,
      is_urgent: row.is_urgent,
      created_at: row.created_at,
      project_name: (row.projects as { name: string } | null)?.name ?? "—",
      unit_name: (row.units as { name: string } | null)?.name ?? null,
      line_count: (row.indent_lines as { count: number }[] | null)?.[0]?.count ?? 0,
      lines_to_buy: row.status === "approved" ? (linesToBuy.get(row.id) ?? 0) : null,
    })),
    total,
    page: currentPage,
    pageCount: Math.max(1, Math.ceil(total / pageSize)),
    pageSize,
  };
}

/** Lines still to buy per indent, from the money-free po_line_facts (0022). Summed, so fetchAll. */
async function countLinesToBuy(
  supabase: Awaited<ReturnType<typeof createClient>>,
  indentIds: string[],
): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  if (indentIds.length === 0) return counts;

  const lines = await fetchAll((rangeFrom, rangeTo) =>
    supabase
      .from("indent_lines")
      .select("id, indent_id, quantity")
      .in("indent_id", indentIds)
      .order("id")
      .range(rangeFrom, rangeTo),
  );
  const lineIds = lines.map((line) => line.id);
  const facts = lineIds.length
    ? await fetchAll((rangeFrom, rangeTo) =>
        supabase
          .from("po_line_facts")
          .select("indent_line_id, quantity, po_status")
          .in("indent_line_id", lineIds)
          .order("id")
          .range(rangeFrom, rangeTo),
      )
    : [];

  const ordered = new Map<string, number>();
  for (const fact of facts) {
    if (fact.po_status === "cancelled" || !fact.indent_line_id) continue;
    ordered.set(
      fact.indent_line_id,
      (ordered.get(fact.indent_line_id) ?? 0) + (fact.quantity ?? 0),
    );
  }

  for (const line of lines) {
    if (stillToBuy(line.quantity, ordered.get(line.id) ?? 0) > 0) {
      counts.set(line.indent_id, (counts.get(line.indent_id) ?? 0) + 1);
    }
  }
  return counts;
}

export async function getIndentFilterOptions(): Promise<{
  projects: { id: string; name: string }[];
  works: { id: string; label: string }[];
}> {
  await requireTool("/indents");
  const [projects, workItems] = await Promise.all([listProjects(), listWorkItems()]);
  return {
    projects: projects.map(({ id, name }) => ({ id, name })),
    works: workItems
      .filter((work) => work.is_active)
      .map((work) => ({ id: work.id, label: `${work.name} — ${work.code}` })),
  };
}

/** May the user decide on a submitted indent? Asks the database's can_approve_indents() (0034), as indents_guard() does. */
export async function isCurrentUserApprover(): Promise<{
  isAdmin: boolean;
  isApprover: boolean;
}> {
  const user = await requireTool("/indents");
  const supabase = await createClient();

  const isAdmin = user.profile?.role === "admin";
  if (isAdmin) return { isAdmin: true, isApprover: true };

  const { data, error } = await supabase.rpc("can_approve_indents", { uid: user.id });
  // Fail closed: a missing button is recoverable, a dead one isn't.
  if (error) {
    console.error("isCurrentUserApprover failed:", error);
    return { isAdmin: false, isApprover: false };
  }

  return { isAdmin: false, isApprover: data === true };
}

export type ProjectOption = { id: string; name: string; code: string | null };
export type ScopedOption = { id: string; project_id: string; name: string; code: string | null };

export type IndentFormOptions = {
  projects: ProjectOption[];
  plots: ScopedOption[];
  units: (ScopedOption & { plot_id: string | null })[];
  works: { id: string; code: string; name: string; category: string }[];
};

export async function getIndentFormOptions(): Promise<IndentFormOptions> {
  await requireTool("/indents");
  const [projects, plots, units, workItems, workCategories] = await Promise.all([
    listProjects(),
    listPlots(),
    listUnits(),
    listWorkItems(),
    listWorkCategories(),
  ]);
  const categoryNameById = new Map(workCategories.map((c) => [c.id, workCategoryLabel(c)]));
  return {
    projects: projects.map(({ id, name, code }) => ({ id, name, code })),
    plots: plots.map(({ id, project_id, name, code }) => ({ id, project_id, name, code })),
    units: units.map(({ id, project_id, plot_id, name, code }) => ({
      id,
      project_id,
      plot_id,
      name,
      code,
    })),
    works: workItems
      .filter((work) => work.is_active)
      .map((work) => ({
        id: work.id,
        code: work.code,
        name: work.name,
        category: categoryNameById.get(work.category_id) ?? "Other",
      })),
  };
}
