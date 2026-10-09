import "server-only";

import { requireTool } from "@/lib/auth/access";
import { getProjectCompany, type CompanyRow } from "@/lib/masters/companies";
import { listPlots } from "@/lib/masters/plots";
import { listProjects } from "@/lib/masters/projects";
import { getDefaultTerms } from "@/lib/masters/terms";
import { listUnits } from "@/lib/masters/units";
import { listActiveUomNames } from "@/lib/masters/uoms";
import { listVendors } from "@/lib/masters/vendors";
import { listWorkCategories, listWorkItems } from "@/lib/masters/works";
import { fetchAll } from "@/lib/supabase/fetch-all";
import { createClient } from "@/lib/supabase/server";

import { billedByContractTotals } from "./queries";
import type { ContractStatus } from "./workflow";

/**
 * Work orders (0105, plan.md B6) — the labour contract made richer and
 * renamed on every screen: a number, terms, and its works. The table is
 * still labour_contracts, so bills.kind = 'contract', Financial
 * Management and Reporter are untouched. All of it is /bills-gated; the
 * rate book's labour rate comes through work_labour_rate_facts, a money
 * view WHERE-gated to /bills or /estimator (0105).
 */

const CONTRACT_COLUMNS =
  "id, reference, vendor_id, project_id, plot_id, unit_id, description, contract_value, terms, status, is_active, approved_by, approved_at, created_by, created_at, vendors(name), projects(name), plots(name), units(name)";

type ContractRow = {
  id: string;
  reference: string | null;
  vendor_id: string;
  project_id: string;
  plot_id: string | null;
  unit_id: string | null;
  description: string;
  contract_value: number;
  terms: string | null;
  status: string;
  is_active: boolean;
  approved_by: string | null;
  approved_at: string | null;
  created_by: string | null;
  created_at: string;
  vendors: { name: string } | null;
  projects: { name: string } | null;
  plots: { name: string } | null;
  units: { name: string } | null;
};

export type WorkOrderRow = {
  id: string;
  /** WO/SAA/004 — null only for an old contract whose project has no code. */
  reference: string | null;
  vendor_id: string;
  vendor_name: string;
  project_id: string;
  project_name: string;
  plot_id: string | null;
  unit_id: string | null;
  /** The villa — its unit or plot — or "General". */
  place: string;
  description: string;
  contract_value: number;
  status: ContractStatus;
  is_active: boolean;
  billed_total: number;
  created_at: string;
};

const toRow = (contract: ContractRow, billed: Map<string, number>): WorkOrderRow => ({
  id: contract.id,
  reference: contract.reference,
  vendor_id: contract.vendor_id,
  vendor_name: contract.vendors?.name ?? "—",
  project_id: contract.project_id,
  project_name: contract.projects?.name ?? "—",
  plot_id: contract.plot_id,
  unit_id: contract.unit_id,
  place: contract.units?.name ?? contract.plots?.name ?? "General",
  description: contract.description,
  contract_value: contract.contract_value,
  status: contract.status as ContractStatus,
  is_active: contract.is_active,
  billed_total: billed.get(contract.id) ?? 0,
  created_at: contract.created_at,
});

export type WorkOrderFilters = {
  q?: string;
  projectId?: string;
  vendorId?: string;
  status?: ContractStatus;
};

/**
 * Every work order, newest first, with what has been billed against
 * each. The filters run here over the full list — a few hundred orders
 * at most — so the count under the list is always the real one.
 */
export async function listWorkOrders(filters: WorkOrderFilters = {}): Promise<WorkOrderRow[]> {
  await requireTool("/bills");
  const supabase = await createClient();
  const [contracts, billed] = await Promise.all([
    fetchAll((from, to) =>
      supabase
        .from("labour_contracts")
        .select(CONTRACT_COLUMNS)
        .order("created_at", { ascending: false })
        .order("id")
        .range(from, to),
    ),
    billedByContractTotals(),
  ]);

  const needle = filters.q?.toLowerCase();
  return (contracts as unknown as ContractRow[])
    .map((contract) => toRow(contract, billed))
    .filter((row) => !filters.projectId || row.project_id === filters.projectId)
    .filter((row) => !filters.vendorId || row.vendor_id === filters.vendorId)
    .filter((row) => !filters.status || row.status === filters.status)
    .filter(
      (row) =>
        !needle ||
        [row.reference ?? "", row.vendor_name, row.description, row.place].some((text) =>
          text.toLowerCase().includes(needle),
        ),
    );
}

export type WorkOrderLineRow = {
  id: string;
  work_item_id: string | null;
  /** "FD.15 · Footing", from the Masters works list. */
  work_label: string | null;
  description: string;
  is_lump_sum: boolean;
  quantity: number | null;
  uom: string | null;
  rate: number;
};

export type WorkOrderDetail = WorkOrderRow & {
  terms: string | null;
  approved_by_name: string | null;
  approved_at: string | null;
  created_by_name: string | null;
  lines: WorkOrderLineRow[];
  /** The project's company, for the letterhead; null → placeholder. */
  company: CompanyRow | null;
};

/** One work order with its works, or null when it does not exist. */
export async function getWorkOrder(id: string): Promise<WorkOrderDetail | null> {
  await requireTool("/bills");
  const supabase = await createClient();

  const [{ data, error }, lines, billed, works] = await Promise.all([
    supabase.from("labour_contracts").select(CONTRACT_COLUMNS).eq("id", id).maybeSingle(),
    fetchAll((from, to) =>
      supabase
        .from("labour_contract_lines")
        .select("id, work_item_id, description, is_lump_sum, quantity, uom, rate")
        .eq("contract_id", id)
        .order("sort_order")
        .order("created_at")
        .order("id")
        .range(from, to),
    ),
    billedByContractTotals(),
    listWorkItems(),
  ]);
  if (error) {
    console.error("getWorkOrder failed:", error);
    throw new Error("Could not read the work order.", { cause: error });
  }
  if (!data) return null;
  const contract = data as unknown as ContractRow;

  const people = [contract.approved_by, contract.created_by].filter(
    (person): person is string => person != null,
  );
  const [profiles, company] = await Promise.all([
    people.length
      ? supabase.from("profiles").select("id, full_name").in("id", people)
      : Promise.resolve({ data: [], error: null }),
    getProjectCompany(contract.project_id),
  ]);
  if (profiles.error) {
    console.error("getWorkOrder names failed:", profiles.error);
    throw new Error("Could not read the work order.", { cause: profiles.error });
  }
  const names = new Map((profiles.data ?? []).map((person) => [person.id, person.full_name]));
  const workById = new Map(works.map((work) => [work.id, `${work.code} · ${work.name}`]));

  return {
    ...toRow(contract, billed),
    terms: contract.terms,
    approved_by_name: contract.approved_by ? (names.get(contract.approved_by) ?? null) : null,
    approved_at: contract.approved_at,
    created_by_name: contract.created_by ? (names.get(contract.created_by) ?? null) : null,
    lines: lines.map((line) => ({
      id: line.id,
      work_item_id: line.work_item_id,
      work_label: line.work_item_id ? (workById.get(line.work_item_id) ?? null) : null,
      description: line.description,
      is_lump_sum: line.is_lump_sum,
      quantity: line.quantity,
      uom: line.uom,
      rate: line.rate,
    })),
    company,
  };
}

export type WorkPick = {
  id: string;
  label: string;
  name: string;
  category: string;
  /** From the rate book (work_labour_rate_facts) — null when it has none. */
  uom: string | null;
  labour_rate: number | null;
};

export type WorkOrderTemplate = {
  id: string;
  name: string;
  terms: string | null;
  lines: {
    work_item_id: string | null;
    description: string;
    is_lump_sum: boolean;
    uom: string | null;
  }[];
};

export type WorkOrderFormOptions = {
  contractors: { id: string; name: string }[];
  projects: { id: string; name: string; code: string | null }[];
  plots: { id: string; project_id: string; name: string; code: string | null }[];
  units: {
    id: string;
    project_id: string;
    plot_id: string | null;
    name: string;
    code: string | null;
  }[];
  works: WorkPick[];
  uoms: string[];
  templates: WorkOrderTemplate[];
  /** The default work-order terms from Masters → Terms, or null. */
  defaultTerms: string | null;
};

/**
 * Everything the work-order editor needs, in one gated call: the
 * contractors (vendors marked as contractors, plus `keepVendorId` when
 * an old order names another vendor), the Masters works with the rate
 * book's unit and labour rate, the active templates with their works,
 * and the default terms.
 */
export async function getWorkOrderFormOptions(
  keepVendorId?: string,
): Promise<WorkOrderFormOptions> {
  await requireTool("/bills");
  const supabase = await createClient();

  const [
    vendors,
    projects,
    plots,
    units,
    workItems,
    categories,
    rates,
    uoms,
    templates,
    templateLines,
    defaultTerms,
  ] = await Promise.all([
    listVendors(),
    listProjects(),
    listPlots(),
    listUnits(),
    listWorkItems(),
    listWorkCategories(),
    fetchAll((from, to) =>
      supabase
        .from("work_labour_rate_facts")
        .select("work_item_id, uom, labour_rate")
        .order("work_item_id")
        .range(from, to),
    ),
    listActiveUomNames(),
    fetchAll((from, to) =>
      supabase
        .from("work_order_templates")
        .select("id, name, terms")
        .eq("is_active", true)
        .order("name")
        .order("id")
        .range(from, to),
    ),
    fetchAll((from, to) =>
      supabase
        .from("work_order_template_lines")
        .select("template_id, work_item_id, description, is_lump_sum, uom, sort_order")
        .order("sort_order")
        .order("created_at")
        .order("id")
        .range(from, to),
    ),
    getDefaultTerms("work_order"),
  ]);

  const categoryName = new Map(categories.map((category) => [category.id, category.name]));
  const rateByWork = new Map(rates.map((rate) => [rate.work_item_id, rate]));
  const linesByTemplate = new Map<string, WorkOrderTemplate["lines"]>();
  for (const line of templateLines) {
    const list = linesByTemplate.get(line.template_id) ?? [];
    list.push({
      work_item_id: line.work_item_id,
      description: line.description,
      is_lump_sum: line.is_lump_sum,
      uom: line.uom,
    });
    linesByTemplate.set(line.template_id, list);
  }

  return {
    contractors: vendors
      .filter((vendor) => (vendor.is_contractor && vendor.is_active) || vendor.id === keepVendorId)
      .map(({ id, name }) => ({ id, name })),
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
        label: `${work.code} · ${work.name}`,
        name: work.name,
        category: categoryName.get(work.category_id) ?? "—",
        uom: rateByWork.get(work.id)?.uom ?? null,
        labour_rate: rateByWork.get(work.id)?.labour_rate ?? null,
      })),
    uoms,
    templates: templates.map((template) => ({
      id: template.id,
      name: template.name,
      terms: template.terms,
      lines: linesByTemplate.get(template.id) ?? [],
    })),
    defaultTerms,
  };
}

/** The templates, active or not, for the templates screen. */
export async function listWorkOrderTemplates(): Promise<
  (WorkOrderTemplate & { is_active: boolean })[]
> {
  await requireTool("/bills");
  const supabase = await createClient();
  const [templates, lines] = await Promise.all([
    fetchAll((from, to) =>
      supabase
        .from("work_order_templates")
        .select("id, name, terms, is_active")
        .order("name")
        .order("id")
        .range(from, to),
    ),
    fetchAll((from, to) =>
      supabase
        .from("work_order_template_lines")
        .select("template_id, work_item_id, description, is_lump_sum, uom, sort_order")
        .order("sort_order")
        .order("created_at")
        .order("id")
        .range(from, to),
    ),
  ]);
  return templates.map((template) => ({
    id: template.id,
    name: template.name,
    terms: template.terms,
    is_active: template.is_active,
    lines: lines
      .filter((line) => line.template_id === template.id)
      .map((line) => ({
        work_item_id: line.work_item_id,
        description: line.description,
        is_lump_sum: line.is_lump_sum,
        uom: line.uom,
      })),
  }));
}
