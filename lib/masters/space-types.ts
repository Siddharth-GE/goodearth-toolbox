import "server-only";

import { createClient } from "@/lib/supabase/server";

// Read-only in Phase 1 — a fixed, rarely-changing vocabulary seeded by
// the migration. Add a write function here (with the usual
// requireApp(user, "/masters") gate) if it ever needs to change from
// the app instead of a future migration.
export type SpaceTypeRow = {
  id: string;
  name: string;
  sort_order: number;
};

export async function listSpaceTypes(): Promise<SpaceTypeRow[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("space_types").select("*").order("sort_order");
  return (data ?? []) as SpaceTypeRow[];
}
