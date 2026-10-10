import "server-only";

import { requireTool } from "@/lib/auth/access";
import { listWorkItems } from "@/lib/masters/works";
import { fetchAll } from "@/lib/supabase/fetch-all";
import { createClient } from "@/lib/supabase/server";

import type { WorkOrderRate } from "./labour-billing";
import { dayRatesFromLines, type DayRates } from "./lines";

/**
 * Reads for Send to Bill (0106, plan.md B7). Bills reads the labour logs
 * it bills — 0104 widened their one SELECT policy to /supervisors or
 * /bills — and the rate book's labour rate through the gated
 * work_labour_rate_facts. Contract table: Bills → labour_logs.
 */

export type UnbilledEntry = {
  id: string;
  log_date: string;
  kind: "nmr" | "pw_qty" | "pw_lump";
  plot_id: string;
  place: string;
  project_id: string;
  project_name: string;
  contractor_id: string;
  contractor_name: string;
  work_item_id: string;
  work_label: string;
  masons: number;
  helpers: number;
  others: number;
  quantity: number | null;
  uom: string | null;
  description: string | null;
  note: string | null;
};

export type UnbilledFilters = {
  projectId?: string;
  vendorId?: string;
  plotId?: string;
  from?: string;
  to?: string;
};

/** Every labour entry not yet on a bill, oldest day first, filtered. */
export async function listUnbilledLabour(filters: UnbilledFilters = {}): Promise<UnbilledEntry[]> {
  await requireTool("/bills");
  const supabase = await createClient();

  const [logs, works] = await Promise.all([
    fetchAll((from, to) => {
      let query = supabase
        .from("labour_logs")
        .select(
          "id, log_date, kind, plot_id, contractor_id, work_item_id, masons, helpers, others, quantity, uom, description, note, plots(name, project_id, projects(name), units!units_plot_id_fkey(name)), vendors(name)",
        )
        .is("bill_id", null);
      if (filters.vendorId) query = query.eq("contractor_id", filters.vendorId);
      if (filters.plotId) query = query.eq("plot_id", filters.plotId);
      if (filters.from) query = query.gte("log_date", filters.from);
      // log_date is a date: the "to" day is included as it is.
      if (filters.to) query = query.lte("log_date", filters.to);
      return query.order("log_date").order("id").range(from, to);
    }),
    listWorkItems(),
  ]);
  const workLabel = new Map(works.map((work) => [work.id, `${work.code} · ${work.name}`]));

  return logs
    .map((log) => {
      const plot = log.plots as {
        name: string;
        project_id: string;
        projects: { name: string } | null;
        units: { name: string }[] | { name: string } | null;
      } | null;
      const unit = Array.isArray(plot?.units) ? plot?.units[0] : plot?.units;
      return {
        id: log.id,
        log_date: log.log_date,
        kind: log.kind as UnbilledEntry["kind"],
        plot_id: log.plot_id,
        place: unit?.name ?? plot?.name ?? "—",
        project_id: plot?.project_id ?? "",
        project_name: plot?.projects?.name ?? "—",
        contractor_id: log.contractor_id,
        contractor_name: (log.vendors as { name: string } | null)?.name ?? "—",
        work_item_id: log.work_item_id,
        work_label: workLabel.get(log.work_item_id) ?? "A retired work",
        masons: log.masons,
        helpers: log.helpers,
        others: log.others,
        quantity: log.quantity,
        uom: log.uom,
        description: log.description,
        note: log.note,
      };
    })
    .filter((entry) => !filters.projectId || entry.project_id === filters.projectId);
}

export type BillableWorkOrder = {
  id: string;
  reference: string | null;
  vendor_id: string;
  project_id: string;
  description: string;
  lines: WorkOrderRate[];
};

export type LabourBillingOptions = {
  /** Approved, switched-on work orders, with their works' rates. */
  workOrders: BillableWorkOrder[];
  /** The rate book's labour rate per work. */
  rateBook: Record<string, number>;
  /** Each contractor's day rates on their last daily-wages bill. */
  dayRates: Record<string, DayRates>;
};

/** What Send to Bill offers for the contractors on screen. */
export async function getLabourBillingOptions(
  contractorIds: string[],
): Promise<LabourBillingOptions> {
  await requireTool("/bills");
  const supabase = await createClient();
  const ids = [...new Set(contractorIds)];

  const [orders, orderLines, rates, nmrBills] = await Promise.all([
    fetchAll((from, to) =>
      supabase
        .from("labour_contracts")
        .select("id, reference, vendor_id, project_id, description")
        .eq("status", "approved")
        .eq("is_active", true)
        .order("created_at", { ascending: false })
        .order("id")
        .range(from, to),
    ),
    fetchAll((from, to) =>
      supabase
        .from("labour_contract_lines")
        .select("contract_id, work_item_id, is_lump_sum, rate")
        .order("contract_id")
        .order("sort_order")
        .order("id")
        .range(from, to),
    ),
    fetchAll((from, to) =>
      supabase
        .from("work_labour_rate_facts")
        .select("work_item_id, labour_rate")
        .order("work_item_id")
        .range(from, to),
    ),
    ids.length
      ? fetchAll((from, to) =>
          supabase
            .from("bills")
            .select("vendor_id, created_at, bill_lines!inner(description, rate, line_kind)")
            .in("vendor_id", ids)
            .eq("kind", "nmr")
            .eq("bill_lines.line_kind", "nmr")
            .order("created_at", { ascending: false })
            .order("id")
            .range(from, to),
        )
      : Promise.resolve([]),
  ]);

  const linesByOrder = new Map<string, WorkOrderRate[]>();
  for (const line of orderLines) {
    const list = linesByOrder.get(line.contract_id) ?? [];
    list.push({ work_item_id: line.work_item_id, is_lump_sum: line.is_lump_sum, rate: line.rate });
    linesByOrder.set(line.contract_id, list);
  }

  // The newest daily-wages bill per contractor gives their day rates.
  const dayRates: Record<string, DayRates> = {};
  for (const bill of nmrBills) {
    if (!bill.vendor_id || dayRates[bill.vendor_id]) continue;
    dayRates[bill.vendor_id] = dayRatesFromLines(
      bill.bill_lines as { description: string; rate: number }[],
    );
  }

  return {
    workOrders: orders.map((order) => ({
      id: order.id,
      reference: order.reference,
      vendor_id: order.vendor_id,
      project_id: order.project_id,
      description: order.description,
      lines: linesByOrder.get(order.id) ?? [],
    })),
    rateBook: Object.fromEntries(
      rates.flatMap((rate) =>
        rate.work_item_id && rate.labour_rate != null
          ? [[rate.work_item_id, rate.labour_rate]]
          : [],
      ),
    ),
    dayRates,
  };
}
