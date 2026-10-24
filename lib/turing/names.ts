import "server-only";

import { formatDate, formatMoney, formatQuantity } from "@/lib/format";
import { fetchAll } from "@/lib/supabase/fetch-all";
import { createClient } from "@/lib/supabase/server";

import type { Entry, IdTable, Row } from "./catalogue-fields";
import { lookAlikes, type Known } from "./look-alike";

/** Ids per read: a conversation's labour logs can run to hundreds, and each id lengthens the URL. */
const CHUNK = 100;

const failed = (error: unknown) => {
  console.error("turing: names not read:", error);
  return new Error("Could not read the names in the proposal.", { cause: error });
};

async function readIn<T>(
  ids: string[],
  read: (chunk: string[]) => PromiseLike<{ data: T[] | null; error: unknown }>,
): Promise<T[]> {
  const rows: T[] = [];
  for (let at = 0; at < ids.length; at += CHUNK) {
    const { data, error } = await read(ids.slice(at, at + CHUNK));
    if (error) throw failed(error);
    rows.push(...(data ?? []));
  }
  return rows;
}

/** How each table's records read to the admin: a plot by its code, a work by code and name. */
const NAMED_BY: Record<
  Exclude<
    IdTable,
    | "profiles"
    | "labour_logs"
    | "indents"
    | "indent_lines"
    | "purchase_orders"
    | "purchase_order_lines"
    | "goods_receipts"
    | "goods_receipt_lines"
    | "stock_issues"
    | "issue_requests"
    | "labour_contracts"
    | "labour_contract_lines"
    | "bills"
    | "bill_lines"
    | "client_actions"
    | "client_payment_milestones"
    | "client_receipts"
  >,
  "name" | "code name" | "code or name"
> = {
  work_order_templates: "name",
  plots: "code or name",
  projects: "code or name",
  units: "code or name",
  work_groups: "code name",
  work_items: "code name",
  work_categories: "code name",
  items: "name",
  vendors: "name",
  brands: "name",
  item_categories: "name",
  clients: "name",
  companies: "name",
  stores: "name",
  document_terms: "name",
  uoms: "name",
  construction_stages: "name",
  progress_stages: "name",
};

/** What a log holds, so the admin sees what a change overrides: "2 masons, 1 helper", "12 cum". */
function labourSummary(log: {
  kind: string;
  masons: number;
  helpers: number;
  others: number;
  quantity: number | null;
  uom: string | null;
}): string {
  if (log.kind === "pw_qty") return `${formatQuantity(log.quantity)} ${log.uom ?? ""}`.trim();
  if (log.kind === "pw_lump") return "lump sum";
  const heads = (count: number, one: string) =>
    count ? `${count} ${one}${count === 1 ? "" : "s"}` : "";
  return [heads(log.masons, "mason"), heads(log.helpers, "helper"), heads(log.others, "other")]
    .filter(Boolean)
    .join(", ");
}

/**
 * Each id a proposal names, as the admin knows it: a plot's code, a stage's or work's code and
 * name, a person's or vendor's name, a labour log's day, villa, work, contractor and heads or
 * quantity. Read through the admin's own session; an id missing from the answer names nothing
 * they can see.
 */
export async function namesFor(ids: Map<IdTable, Set<string>>): Promise<Record<string, string>> {
  const supabase = await createClient();
  const names: Record<string, string> = {};
  const lists = new Map<IdTable, Set<string>>(
    [...ids].map(([table, set]) => [table, new Set(set)]),
  );
  const list = (table: IdTable) => [...(lists.get(table) ?? [])];
  const add = (table: IdTable, id: string) => {
    if (!lists.has(table)) lists.set(table, new Set());
    lists.get(table)?.add(id);
  };

  // A log is named by what it points at, so its villa, work and contractor are read with the rest.
  const logs = await readIn(list("labour_logs"), (chunk) =>
    supabase
      .from("labour_logs")
      .select(
        "id, log_date, plot_id, work_item_id, contractor_id, kind, masons, helpers, others, quantity, uom",
      )
      .in("id", chunk),
  );
  for (const log of logs) {
    add("plots", log.plot_id);
    add("work_items", log.work_item_id);
    add("vendors", log.contractor_id);
  }
  // An indent line likewise, by its indent and item.
  const lines = await readIn(list("indent_lines"), (chunk) =>
    supabase.from("indent_lines").select("id, indent_id, item_id, quantity, uom").in("id", chunk),
  );
  for (const line of lines) {
    add("indents", line.indent_id);
    add("items", line.item_id);
  }
  // And a PO line, by its PO and item.
  const poLines = await readIn(list("purchase_order_lines"), (chunk) =>
    supabase
      .from("purchase_order_lines")
      .select("id, po_id, item_id, quantity, uom")
      .in("id", chunk),
  );
  for (const line of poLines) {
    add("purchase_orders", line.po_id);
    add("items", line.item_id);
  }
  // A delivered line by its delivery and item; a site's request by its villa and item; a work by its order.
  const [receiptLines, requests, orderWorks, billLines] = await Promise.all([
    readIn(list("goods_receipt_lines"), (chunk) =>
      supabase
        .from("goods_receipt_lines")
        .select("id, receipt_id, item_id, quantity, uom")
        .in("id", chunk),
    ),
    readIn(list("issue_requests"), (chunk) =>
      supabase
        .from("issue_requests")
        .select("id, plot_id, item_id, quantity, status")
        .in("id", chunk),
    ),
    readIn(list("labour_contract_lines"), (chunk) =>
      supabase
        .from("labour_contract_lines")
        .select("id, contract_id, description, is_lump_sum, quantity, uom")
        .in("id", chunk),
    ),
    readIn(list("bill_lines"), (chunk) =>
      supabase
        .from("bill_lines")
        .select("id, bill_id, description, line_kind, quantity, uom")
        .in("id", chunk),
    ),
  ]);
  for (const work of orderWorks) add("labour_contracts", work.contract_id);
  for (const line of billLines) add("bills", line.bill_id);
  for (const line of receiptLines) {
    add("goods_receipts", line.receipt_id);
    add("items", line.item_id);
  }
  for (const request of requests) {
    add("plots", request.plot_id);
    add("items", request.item_id);
  }

  const [crmActions, crmStages, crmReceipts] = await Promise.all([
    readIn(list("client_actions"), (chunk) =>
      supabase.from("client_actions").select("id, action, status").in("id", chunk),
    ),
    readIn(list("client_payment_milestones"), (chunk) =>
      supabase
        .from("client_payment_milestones")
        .select("id, stage, due_amount, engagement_id")
        .in("id", chunk),
    ),
    readIn(list("client_receipts"), (chunk) =>
      supabase
        .from("client_receipts")
        .select("id, amount, received_on, cancel_reason, engagement_id")
        .in("id", chunk),
    ),
  ]);
  for (const one of crmActions) {
    const words = one.action.length > 60 ? `${one.action.slice(0, 57)}…` : one.action;
    names[one.id] = `${words} (${one.status.replace(/_/g, " ")})`;
  }
  // Money in is named with its plot and client: every plot has a Booking stage, so the stage alone says nothing.
  const engagements = await readIn(
    [...new Set([...crmStages, ...crmReceipts].map((one) => one.engagement_id))],
    (chunk) => supabase.from("client_engagements").select("id, unit_id").in("id", chunk),
  );
  const villas = await readIn(
    engagements.map((one) => one.unit_id),
    (chunk) => supabase.from("units").select("id, plot_id, client_id").in("id", chunk),
  );
  const villaOf = new Map(villas.map((one) => [one.id, one]));
  const plotOfEngagement = new Map(engagements.map((one) => [one.id, villaOf.get(one.unit_id)]));
  for (const villa of villas) {
    if (villa.plot_id) add("plots", villa.plot_id);
    if (villa.client_id) add("clients", villa.client_id);
  }

  const [people, indents, orders, receipts, issues, workOrders, bills] = await Promise.all([
    readIn(list("profiles"), (chunk) =>
      supabase.from("profiles").select("id, full_name").in("id", chunk),
    ),
    readIn(list("indents"), (chunk) =>
      supabase.from("indents").select("id, reference, status").in("id", chunk),
    ),
    readIn(list("purchase_orders"), (chunk) =>
      supabase.from("purchase_orders").select("id, reference, status").in("id", chunk),
    ),
    readIn(list("goods_receipts"), (chunk) =>
      supabase.from("goods_receipts").select("id, reference").in("id", chunk),
    ),
    readIn(list("stock_issues"), (chunk) =>
      supabase.from("stock_issues").select("id, reference").in("id", chunk),
    ),
    readIn(list("labour_contracts"), (chunk) =>
      supabase.from("labour_contracts").select("id, reference, status").in("id", chunk),
    ),
    readIn(list("bills"), (chunk) =>
      supabase.from("bills").select("id, reference, status").in("id", chunk),
    ),
  ]);
  for (const one of bills) names[one.id] = `${one.reference} (${one.status})`;
  for (const line of billLines) {
    names[line.id] = [
      names[line.bill_id],
      line.description,
      line.line_kind === "pw_lump"
        ? "lump sum"
        : `${formatQuantity(line.quantity)} ${line.uom ?? ""}`.trim(),
    ]
      .filter(Boolean)
      .join(" · ");
  }
  for (const record of [...receipts, ...issues]) names[record.id] = record.reference;
  for (const order of workOrders)
    names[order.id] = `${order.reference ?? "Work order"} (${order.status.replace(/_/g, " ")})`;
  for (const work of orderWorks) {
    names[work.id] = [
      names[work.contract_id],
      work.description,
      work.is_lump_sum ? "lump sum" : `${formatQuantity(work.quantity)} ${work.uom ?? ""}`.trim(),
    ]
      .filter(Boolean)
      .join(" · ");
  }
  for (const person of people) names[person.id] = person.full_name || "A person";
  for (const indent of indents) names[indent.id] = `${indent.reference} (${indent.status})`;
  for (const order of orders)
    names[order.id] = `${order.reference} (${order.status.replace(/_/g, " ")})`;
  await Promise.all(
    (Object.keys(NAMED_BY) as (keyof typeof NAMED_BY)[]).map(async (table) => {
      const rows = await readIn(list(table), (chunk) =>
        supabase
          .from(table as "plots")
          .select(NAMED_BY[table] === "name" ? "id, name" : "id, code, name")
          .in("id", chunk),
      );
      for (const row of rows as unknown as { id: string; name: string; code?: string | null }[]) {
        names[row.id] =
          NAMED_BY[table] === "code name"
            ? `${row.code} ${row.name}`
            : NAMED_BY[table] === "code or name"
              ? row.code || row.name
              : row.name;
      }
    }),
  );
  const whose = (engagementId: string) => {
    const villa = plotOfEngagement.get(engagementId);
    return villa ? [names[villa.plot_id ?? ""], names[villa.client_id ?? ""]] : [];
  };
  for (const one of crmStages) {
    names[one.id] = [
      ...whose(one.engagement_id),
      one.stage.replace(/_/g, " "),
      one.due_amount === null ? null : formatMoney(one.due_amount),
    ]
      .filter(Boolean)
      .join(" · ");
  }
  for (const one of crmReceipts) {
    names[one.id] = [
      ...whose(one.engagement_id),
      formatMoney(one.amount),
      formatDate(one.received_on),
      one.cancel_reason ? "cancelled" : null,
    ]
      .filter(Boolean)
      .join(" · ");
  }
  for (const log of logs) {
    names[log.id] = [
      formatDate(log.log_date),
      names[log.plot_id],
      names[log.work_item_id],
      names[log.contractor_id],
      labourSummary(log),
    ]
      .filter(Boolean)
      .join(" · ");
  }
  for (const line of [
    ...lines.map((one) => ({ ...one, of: one.indent_id })),
    ...poLines.map((one) => ({ ...one, of: one.po_id })),
    ...receiptLines.map((one) => ({ ...one, of: one.receipt_id })),
  ]) {
    names[line.id] = [
      names[line.of],
      names[line.item_id],
      `${formatQuantity(line.quantity)} ${line.uom}`,
    ]
      .filter(Boolean)
      .join(" · ");
  }
  for (const request of requests) {
    names[request.id] = [
      names[request.plot_id],
      names[request.item_id],
      formatQuantity(request.quantity),
      `(${request.status})`,
    ]
      .filter(Boolean)
      .join(" · ");
  }
  return names;
}

/**
 * For an entry that adds a Masters record: each row's warning that it may already be there, read
 * against the whole table as the admin. Undefined for any other entry.
 */
export async function alikeFor(entry: Entry, rows: Row[]): Promise<(string | null)[] | undefined> {
  const alike = entry.alike;
  if (!entry.adds || !alike) return undefined;
  const columns = ["name", alike.tax, alike.phone, alike.code].filter((column): column is string =>
    Boolean(column),
  );
  const supabase = await createClient();
  const existing = await fetchAll((from, to) =>
    supabase
      .from(alike.table as "vendors")
      .select(["id", ...columns].join(", "))
      .order("id")
      .range(from, to),
  );
  const known = (record: Record<string, unknown>): Known => {
    const text = (column?: string) => (column && record[column] ? String(record[column]) : null);
    return {
      name: String(record.name ?? ""),
      tax: text(alike.tax),
      phone: text(alike.phone),
      code: text(alike.code),
    };
  };
  return lookAlikes(
    rows.map((row) => known(row.values)),
    (existing as unknown as Record<string, unknown>[]).map(known),
  );
}
