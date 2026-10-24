import "server-only";

import { formatDate, formatQuantity } from "@/lib/format";
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
  Exclude<IdTable, "profiles" | "labour_logs" | "indents" | "indent_lines">,
  "name" | "code name" | "code or name"
> = {
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

  const [people, indents] = await Promise.all([
    readIn(list("profiles"), (chunk) =>
      supabase.from("profiles").select("id, full_name").in("id", chunk),
    ),
    readIn(list("indents"), (chunk) =>
      supabase.from("indents").select("id, reference, status").in("id", chunk),
    ),
  ]);
  for (const person of people) names[person.id] = person.full_name || "A person";
  for (const indent of indents) names[indent.id] = `${indent.reference} (${indent.status})`;
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
  for (const line of lines) {
    names[line.id] = [
      names[line.indent_id],
      names[line.item_id],
      `${formatQuantity(line.quantity)} ${line.uom}`,
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
