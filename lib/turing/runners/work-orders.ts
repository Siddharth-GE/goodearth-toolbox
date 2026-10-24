import "server-only";

import { setLabourContractActive } from "@/lib/bills/actions";
import {
  cancelWorkOrder,
  createWorkOrder,
  deleteWorkOrder,
  saveWorkOrder,
  saveWorkOrderAsTemplate,
  setWorkOrderTemplateActive,
} from "@/lib/bills/work-order-actions";
import { getDefaultTerms } from "@/lib/masters/terms";
import { listActiveUomNames } from "@/lib/masters/uoms";
import { fetchAll } from "@/lib/supabase/fetch-all";
import { createClient } from "@/lib/supabase/server";

import { workLineOf, type BookWork, type WORK_ORDERS } from "../entries/work-orders";
import { idFrom } from "../redirects";
import {
  failed,
  given,
  recordNow,
  saving,
  siteOf,
  type RunResult,
  type Runners,
  type Values,
} from "./kit";

type Key = (typeof WORK_ORDERS)[number]["key"];
type Refusal = { error: string } | null;
type Line = ReturnType<typeof workLineOf>;

const text = (values: Values, key: string) =>
  typeof values[key] === "string" && values[key] ? String(values[key]) : null;

/** The works named, as the editor offers them: active, with the rate book's unit and labour rate. */
async function bookOf(ids: string[]): Promise<Map<string, BookWork> | { error: string }> {
  const wanted = [...new Set(ids)];
  if (wanted.length === 0) return new Map();
  const supabase = await createClient();
  let works;
  let rates;
  try {
    [works, rates] = await Promise.all([
      fetchAll((from, to) =>
        supabase
          .from("work_items")
          .select("id, name, is_active")
          .in("id", wanted)
          .order("id")
          .range(from, to),
      ),
      fetchAll((from, to) =>
        supabase
          .from("work_labour_rate_facts")
          .select("work_item_id, uom, labour_rate")
          .in("work_item_id", wanted)
          .order("work_item_id")
          .range(from, to),
      ),
    ]);
  } catch (error) {
    return failed("work_items", error);
  }
  if (works.length < wanted.length) return { error: "A work is gone from the works list." };
  if (works.some((one) => !one.is_active)) return { error: "A work is retired in Masters." };
  const rateOf = new Map(rates.map((one) => [one.work_item_id, one]));
  return new Map(
    works.map((one) => [
      one.id,
      {
        name: one.name,
        uom: rateOf.get(one.id)?.uom ?? null,
        labour_rate: rateOf.get(one.id)?.labour_rate ?? null,
      },
    ]),
  );
}

/** The editor offers the active units, and keeps a line's own after it is retired. */
async function unitRefused(lines: Line[], keeps: (string | null)[] = []): Promise<Refusal> {
  const asked = lines
    .map((line) => line.uom)
    .filter((unit): unit is string => Boolean(unit) && !keeps.includes(unit));
  if (asked.length === 0) return null;
  let units: string[];
  try {
    units = await listActiveUomNames();
  } catch (error) {
    return failed("uoms", error);
  }
  const off = asked.find((unit) => !units.includes(unit));
  return off ? { error: `"${off}" is not a unit in Masters.` } : null;
}

/** The new rows as editor lines, each work filled from the rate book. */
async function linesOf(rows: Values[]): Promise<Line[] | { error: string }> {
  const book = await bookOf(
    rows.flatMap((row) => (text(row, "work_item_id") ? [String(row.work_item_id)] : [])),
  );
  if ("error" in book) return book;
  const lines = rows.map((row) =>
    workLineOf(row, text(row, "work_item_id") ? book.get(String(row.work_item_id)) : undefined),
  );
  return (await unitRefused(lines)) ?? lines;
}

/** The editor sends a contractor that is active and marked as one; an order's own stays on a change. */
async function contractorRefused(vendorId: string): Promise<Refusal> {
  const now = await recordNow(
    "vendors",
    { column: "id", id: vendorId },
    ["is_active", "is_contractor"],
    "That vendor is gone.",
  );
  if ("error" in now) return now;
  if (now.row.is_contractor !== true)
    return { error: "That vendor is not marked as a contractor." };
  return now.row.is_active === false ? { error: "That contractor is retired in Masters." } : null;
}

type OrderNow = {
  id: string;
  status: string;
  vendor_id: string;
  project_id: string;
  plot_id: string | null;
  unit_id: string | null;
  description: string;
  terms: string | null;
  lines: (Line & { id: string })[];
};

/** A work order as it stands, works in order — only one waiting for approval can change. */
async function orderNow(id: string): Promise<OrderNow | { error: string }> {
  const head = await recordNow(
    "labour_contracts",
    { column: "id", id },
    ["id", "status", "vendor_id", "project_id", "plot_id", "unit_id", "description", "terms"],
    "That work order is gone.",
  );
  if ("error" in head) return head;
  if (head.row.status !== "pending_approval") {
    return { error: "Only a work order waiting for approval can change." };
  }
  const supabase = await createClient();
  let rows;
  try {
    rows = await fetchAll((from, to) =>
      supabase
        .from("labour_contract_lines")
        .select("id, work_item_id, description, is_lump_sum, quantity, uom, rate")
        .eq("contract_id", id)
        .order("sort_order")
        .order("created_at")
        .order("id")
        .range(from, to),
    );
  } catch (error) {
    return failed("labour_contract_lines", error);
  }
  return {
    ...(head.row as Omit<OrderNow, "lines">),
    lines: rows.map((row) => ({
      id: row.id,
      workItemId: row.work_item_id,
      description: row.description,
      isLumpSum: row.is_lump_sum,
      quantity: row.quantity,
      uom: row.uom,
      rate: row.rate,
    })),
  };
}

const bare = ({ workItemId, description, isLumpSum, quantity, uom, rate }: Line): Line => ({
  workItemId,
  description,
  isLumpSum,
  quantity,
  uom,
  rate,
});

/** The editor's save: the order as it stands, with `changes` over it. */
const saveOrder = (now: OrderNow, changes: Partial<Parameters<typeof saveWorkOrder>[1]>) =>
  saveWorkOrder(now.id, {
    vendorId: now.vendor_id,
    projectId: now.project_id,
    plotId: now.plot_id,
    unitId: now.unit_id,
    description: now.description,
    terms: now.terms,
    lines: now.lines.map(bare),
    ...changes,
  });

/** The order a work is on, as it stands. */
async function orderOfLine(lineId: string): Promise<OrderNow | { error: string }> {
  const line = await recordNow(
    "labour_contract_lines",
    { column: "id", id: lineId },
    ["contract_id"],
    "That work is no longer on the work order.",
  );
  if ("error" in line) return line;
  return orderNow(String(line.row.contract_id));
}

export const WORK_ORDER_RUNNERS: Runners<Key> = {
  work_order_new: {
    lines: async (header, rows): Promise<RunResult> => {
      const projectId = String(header.project_id);
      const vendorId = String(header.vendor_id);
      const site = await siteOf(projectId, text(header, "plot_id"));
      if ("error" in site) return site;
      const refused = await contractorRefused(vendorId);
      if (refused) return refused;
      const lines = await linesOf(rows);
      if ("error" in lines) return lines;
      let terms: string | null;
      try {
        terms = "terms" in header ? text(header, "terms") : await getDefaultTerms("work_order");
      } catch {
        return { error: "Could not read the default terms. Try again." };
      }
      const done = await saving(
        () =>
          createWorkOrder({
            vendorId,
            projectId,
            ...site,
            description: String(header.description),
            terms,
            lines,
          }),
        "/bills/work-orders/",
      );
      if ("error" in done) return done;
      const id = idFrom(done.path, "/bills/work-orders/");
      if (!id) return undefined;
      const made = await recordNow("labour_contracts", { column: "id", id }, ["reference"], null);
      return "row" in made && made.row.reference
        ? { saved: String(made.row.reference) }
        : undefined;
    },
  },
  work_order_works_add: {
    lines: async (header, rows) => {
      const now = await orderNow(String(header.work_order_id));
      if ("error" in now) return now;
      const lines = await linesOf(rows);
      if ("error" in lines) return lines;
      return saveOrder(now, { lines: [...now.lines.map(bare), ...lines] });
    },
  },
  work_order_change: async (v) => {
    const now = await orderNow(String(v.work_order_id));
    if ("error" in now) return now;
    const vendorId = given(v, "vendor_id", now.vendor_id);
    const refused = vendorId !== now.vendor_id ? await contractorRefused(vendorId) : null;
    if (refused) return refused;
    let site = { plotId: now.plot_id, unitId: now.unit_id };
    if ("plot_id" in v) {
      const picked = await siteOf(now.project_id, text(v, "plot_id"));
      if ("error" in picked) return picked;
      site = picked;
    }
    return saveOrder(now, {
      vendorId,
      ...site,
      description: given(v, "description", now.description),
      terms: given(v, "terms", now.terms) || null,
    });
  },
  work_order_work_change: async (v) => {
    const now = await orderOfLine(String(v.line_id));
    if ("error" in now) return now;
    const at = now.lines.findIndex((line) => line.id === String(v.line_id));
    if (at < 0) return { error: "That work is no longer on the work order." };
    const changed = workLineOf(v, undefined, now.lines[at]);
    const refused = await unitRefused([changed], [now.lines[at].uom]);
    if (refused) return refused;
    const lines = now.lines.map(bare);
    lines[at] = changed;
    return saveOrder(now, { lines });
  },
  work_order_work_remove: async (v) => {
    const now = await orderOfLine(String(v.line_id));
    if ("error" in now) return now;
    const lines = now.lines.filter((line) => line.id !== String(v.line_id)).map(bare);
    if (lines.length === now.lines.length)
      return { error: "That work is no longer on the work order." };
    return saveOrder(now, { lines });
  },
  work_order_delete: async (v) => {
    const done = await saving(() => deleteWorkOrder(String(v.work_order_id)), "/bills/work-orders");
    return "error" in done ? done : undefined;
  },
  work_order_cancel: (v) => cancelWorkOrder(String(v.work_order_id), String(v.reason)),
  work_order_active: async (v) => {
    const now = await recordNow(
      "labour_contracts",
      { column: "id", id: String(v.work_order_id) },
      ["status"],
      "That work order is gone.",
    );
    if ("error" in now) return now;
    if (now.row.status === "cancelled") return { error: "A cancelled work order stays off." };
    return setLabourContractActive(String(v.work_order_id), v.is_active === true);
  },
  work_order_template_new: (v) => saveWorkOrderAsTemplate(String(v.work_order_id), String(v.name)),
  work_order_template_active: (v) =>
    setWorkOrderTemplateActive(String(v.template_id), v.is_active === true),
};
