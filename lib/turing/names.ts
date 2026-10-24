import "server-only";

import { formatDate } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

import type { IdTable } from "./catalogue-fields";

/**
 * Each id a proposal names, as the admin knows it: a plot's code, a stage's or work's code and
 * name, a person's or vendor's name, a labour log's day, villa, work and contractor. Read through
 * the admin's own session; an id missing from the answer names nothing they can see.
 */
export async function namesFor(ids: Map<IdTable, Set<string>>): Promise<Record<string, string>> {
  const supabase = await createClient();
  const names: Record<string, string> = {};
  const lists = new Map<IdTable, Set<string>>(
    [...ids].map(([table, set]) => [table, new Set(set)]),
  );
  const add = (table: IdTable, id: string) => {
    if (!lists.has(table)) lists.set(table, new Set());
    lists.get(table)?.add(id);
  };
  const list = (table: IdTable) => [...(lists.get(table) ?? [])];
  const failed = (error: unknown) => {
    console.error("turing: names not read:", error);
    return new Error("Could not read the names in the proposal.", { cause: error });
  };

  // A log is named by what it points at, so its villa, work and contractor are read with the rest.
  const logs = list("labour_logs").length
    ? await supabase
        .from("labour_logs")
        .select("id, log_date, plot_id, work_item_id, contractor_id")
        .in("id", list("labour_logs"))
    : null;
  if (logs?.error) throw failed(logs.error);
  for (const entry of logs?.data ?? []) {
    add("plots", entry.plot_id);
    add("work_items", entry.work_item_id);
    add("vendors", entry.contractor_id);
  }

  const reads = await Promise.all([
    list("plots").length
      ? supabase.from("plots").select("id, code, name").in("id", list("plots"))
      : null,
    list("work_groups").length
      ? supabase.from("work_groups").select("id, code, name").in("id", list("work_groups"))
      : null,
    list("work_items").length
      ? supabase.from("work_items").select("id, code, name").in("id", list("work_items"))
      : null,
    list("profiles").length
      ? supabase.from("profiles").select("id, full_name").in("id", list("profiles"))
      : null,
    list("vendors").length
      ? supabase.from("vendors").select("id, name").in("id", list("vendors"))
      : null,
  ]);
  const [plots, groups, works, people, vendors] = reads;
  for (const read of reads) if (read?.error) throw failed(read.error);
  for (const plot of plots?.data ?? []) names[plot.id] = plot.code || plot.name;
  for (const group of groups?.data ?? []) names[group.id] = `${group.code} ${group.name}`;
  for (const work of works?.data ?? []) names[work.id] = `${work.code} ${work.name}`;
  for (const person of people?.data ?? []) names[person.id] = person.full_name || "A person";
  for (const vendor of vendors?.data ?? []) names[vendor.id] = vendor.name;
  for (const entry of logs?.data ?? []) {
    names[entry.id] = [
      formatDate(entry.log_date),
      names[entry.plot_id],
      names[entry.work_item_id],
      names[entry.contractor_id],
    ]
      .filter(Boolean)
      .join(" · ");
  }
  return names;
}
