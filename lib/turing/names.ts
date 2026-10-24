import "server-only";

import { createClient } from "@/lib/supabase/server";

import type { IdTable } from "./catalogue-fields";

/**
 * Each id a proposal names, as the admin knows it: a plot's code, a stage's code and name, a
 * person's or vendor's name. Read through the admin's own session; an id missing from the answer
 * names nothing they can see.
 */
export async function namesFor(ids: Map<IdTable, Set<string>>): Promise<Record<string, string>> {
  const supabase = await createClient();
  const names: Record<string, string> = {};
  const list = (table: IdTable) => [...(ids.get(table) ?? [])];

  const reads = await Promise.all([
    list("plots").length
      ? supabase.from("plots").select("id, code, name").in("id", list("plots"))
      : null,
    list("work_groups").length
      ? supabase.from("work_groups").select("id, code, name").in("id", list("work_groups"))
      : null,
    list("profiles").length
      ? supabase.from("profiles").select("id, full_name").in("id", list("profiles"))
      : null,
    list("vendors").length
      ? supabase.from("vendors").select("id, name").in("id", list("vendors"))
      : null,
  ]);
  const [plots, groups, people, vendors] = reads;
  for (const read of reads) {
    if (read?.error) {
      console.error("turing: names not read:", read.error);
      throw new Error("Could not read the names in the proposal.", { cause: read.error });
    }
  }
  for (const plot of plots?.data ?? []) names[plot.id] = plot.code || plot.name;
  for (const group of groups?.data ?? []) names[group.id] = `${group.code} ${group.name}`;
  for (const person of people?.data ?? []) names[person.id] = person.full_name || "A person";
  for (const vendor of vendors?.data ?? []) names[vendor.id] = vendor.name;
  return names;
}
