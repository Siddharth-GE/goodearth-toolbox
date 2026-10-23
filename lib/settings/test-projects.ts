import "server-only";

import { requireAdmin } from "@/lib/auth/access";
import { requireUser } from "@/lib/auth/dal";
import { readFailed } from "@/lib/supabase/read-failed";
import { createClient } from "@/lib/supabase/server";

/** Projects marked test (0142) — made by scripts/seed-test-project.ts, never from the app — with what hangs off them. */

export type TestProject = {
  id: string;
  name: string;
  villas: string[];
  indents: number;
  purchaseOrders: number;
  bills: number;
};

export async function listTestProjects(): Promise<TestProject[]> {
  const user = await requireUser();
  await requireAdmin(user);
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("projects")
    .select("id, name, units(name), indents(count), purchase_orders(count), bills(count)")
    .eq("is_test", true)
    .order("name");
  if (error) readFailed("settings", "the test projects", error);
  return (data ?? []).map((project) => ({
    id: project.id,
    name: project.name,
    villas: project.units.map((unit) => unit.name),
    indents: project.indents[0]?.count ?? 0,
    purchaseOrders: project.purchase_orders[0]?.count ?? 0,
    bills: project.bills[0]?.count ?? 0,
  }));
}
