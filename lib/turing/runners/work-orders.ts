import "server-only";

import { approveLabourContract, setLabourContractActive } from "@/lib/bills/actions";
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
  unlessStatus,
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
  return (await unitRefused(lines, bookUnits(book))) ?? lines;
}

/** Works' names, retired or not. */
async function namesOf(ids: string[]): Promise<Map<string, string> | { error: string }> {
  if (ids.length === 0) return new Map();
  const supabase = await createClient();
  const { data, error } = await supabase.from("work_items").select("id, name").in("id", ids);
  if (error) return failed("work_items", error);
  return new Map(data.map((one) => [one.id, one.name]));
}

/** A work's rate-book unit, which picking it on screen fills in even after it is retired. */
const bookUnits = (book: Map<string, BookWork>) => [...book.values()].map((one) => one.uom);

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
  // The save replaces every work under a new id, so all of one order's changes go in one save.
  work_order_works_change: {
    lines: async (header, rows) => {
      const now = await orderNow(String(header.work_order_id));
      if ("error" in now) return now;
      const byId = new Map(rows.map((row) => [String(row.line_id), row]));
      if (byId.size < rows.length) return { error: "One work is named twice; give it one row." };
      if ([...byId.keys()].some((id) => !now.lines.some((line) => line.id === id))) {
        return {
          error: "A work is not on that work order as it stands now. Ask Turing to read it again.",
        };
      }
      const book = await bookOf(
        rows.flatMap((row) => (text(row, "work_item_id") ? [String(row.work_item_id)] : [])),
      );
      if ("error" in book) return book;
      // The names of works being re-picked away from, so a description still saying one follows the new work.
      const oldNames = await namesOf(
        now.lines.flatMap((line) =>
          line.workItemId && text(byId.get(line.id) ?? {}, "work_item_id") ? [line.workItemId] : [],
        ),
      );
      if ("error" in oldNames) return oldNames;

      const lines: Line[] = [];
      const changed: Line[] = [];
      const keeps = bookUnits(book);
      for (const line of now.lines) {
        const row = byId.get(line.id);
        if (!row) {
          lines.push(bare(line));
          continue;
        }
        if (row.remove === true) continue;
        keeps.push(line.uom);
        // Another work picked fills the line as the editor's pickWork does.
        const pickedId = text(row, "work_item_id");
        const picked = pickedId ? book.get(pickedId) : undefined;
        const repicked = picked && pickedId !== line.workItemId ? picked : undefined;
        const ownWords =
          line.description.trim() !== "" &&
          line.description !== (line.workItemId ? oldNames.get(line.workItemId) : undefined);
        const base = repicked
          ? {
              ...bare(line),
              workItemId: pickedId,
              description: ownWords ? line.description : repicked.name,
              uom: repicked.uom ?? line.uom,
              rate: repicked.labour_rate ?? line.rate,
            }
          : bare(line);
        const next = workLineOf(row, repicked, base);
        // A lump sum keeps no quantity or unit, so one given to it would be dropped unsaid.
        if (next.isLumpSum && (text(row, "quantity") || text(row, "uom"))) {
          return { error: "A lump sum has no quantity or unit: its rate is the whole amount." };
        }
        lines.push(next);
        changed.push(next);
      }
      if (lines.length === 0) return { error: "A work order keeps at least one work." };
      const refused = await unitRefused(changed, keeps);
      return refused ?? saveOrder(now, { lines });
    },
  },
  work_order_delete: async (v) => {
    const done = await saving(() => deleteWorkOrder(String(v.work_order_id)), "/bills/work-orders");
    return "error" in done ? done : undefined;
  },
  work_order_cancel: (v) => cancelWorkOrder(String(v.work_order_id), String(v.reason)),
  work_order_approve: async (v) =>
    (await unlessStatus(
      "labour_contracts",
      String(v.work_order_id),
      "pending_approval",
      "That work order is not waiting for approval.",
      "That work order is gone.",
    )) ?? approveLabourContract(String(v.work_order_id)),
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
