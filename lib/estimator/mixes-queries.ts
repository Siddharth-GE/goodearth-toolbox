import "server-only";

import { requireTool } from "@/lib/auth/access";
import { fetchAll } from "@/lib/supabase/fetch-all";
import { createClient } from "@/lib/supabase/server";
import { fail, GRANT, itemDefsByIds, listMaterialsRaw } from "./shared";

// ---------------------------------------------------------------------
// Mixes
// ---------------------------------------------------------------------

export type MixRow = {
  id: string;
  name: string;
  uom: string;
  description: string | null;
  isActive: boolean;
  componentCount: number;
  /** How many work recipes use it. */
  useCount: number;
};

export async function listMixes(): Promise<MixRow[]> {
  await requireTool(GRANT);
  const supabase = await createClient();

  const [mixes, components, workUses] = await Promise.all([
    fetchAll<{
      id: string;
      name: string;
      uom: string;
      description: string | null;
      is_active: boolean;
    }>((from, to) =>
      supabase
        .from("estimator_mixes")
        .select("id, name, uom, description, is_active")
        .order("name")
        .order("id")
        .range(from, to),
    ),
    fetchAll<{ mix_id: string }>((from, to) =>
      supabase.from("estimator_mix_components").select("mix_id").order("id").range(from, to),
    ),
    fetchAll<{ mix_id: string | null }>((from, to) =>
      supabase
        .from("estimator_work_components")
        .select("mix_id")
        .not("mix_id", "is", null)
        .order("id")
        .range(from, to),
    ),
  ]);

  const counts = new Map<string, number>();
  for (const row of components) counts.set(row.mix_id, (counts.get(row.mix_id) ?? 0) + 1);
  const uses = new Map<string, number>();
  for (const row of workUses) {
    if (row.mix_id) uses.set(row.mix_id, (uses.get(row.mix_id) ?? 0) + 1);
  }

  return mixes.map((mix) => ({
    id: mix.id,
    name: mix.name,
    uom: mix.uom,
    description: mix.description,
    isActive: mix.is_active,
    componentCount: counts.get(mix.id) ?? 0,
    useCount: uses.get(mix.id) ?? 0,
  }));
}

export type MixComponentRow = {
  id: string;
  /** The item id since 0086; a legacy estimator_materials id before. */
  materialId: string;
  materialName: string;
  materialUom: string;
  materialRate: number | null;
  qtyPerUnit: number;
  /** true = a pre-0086 row still priced off the retired materials list. */
  legacy: boolean;
};

export type MixDetail = {
  id: string;
  name: string;
  uom: string;
  description: string | null;
  isActive: boolean;
  components: MixComponentRow[];
};

export async function getMix(mixId: string): Promise<MixDetail | null> {
  await requireTool(GRANT);
  const supabase = await createClient();

  const { data: mix, error } = await supabase
    .from("estimator_mixes")
    .select("id, name, uom, description, is_active")
    .eq("id", mixId)
    .maybeSingle();
  if (error) fail("the mix", error);
  if (!mix) return null;

  const [components, legacyMaterials] = await Promise.all([
    fetchAll<{
      id: string;
      material_id: string | null;
      item_id: string | null;
      qty_per_unit: number;
    }>((from, to) =>
      supabase
        .from("estimator_mix_components")
        .select("id, material_id, item_id, qty_per_unit")
        .eq("mix_id", mixId)
        .order("id")
        .range(from, to),
    ),
    listMaterialsRaw(supabase),
  ]);
  const itemDefs = await itemDefsByIds(supabase, [
    ...new Set(components.flatMap((c) => (c.item_id ? [c.item_id] : []))),
  ]);
  const legacyById = new Map(legacyMaterials.map((m) => [m.id, m]));

  return {
    id: mix.id,
    name: mix.name,
    uom: mix.uom,
    description: mix.description,
    isActive: mix.is_active,
    components: components
      .map((component) => {
        const def = component.item_id
          ? itemDefs.get(component.item_id)
          : legacyById.get(component.material_id ?? "");
        return {
          id: component.id,
          materialId: component.item_id ?? component.material_id ?? "",
          materialName: def?.name ?? "Unknown material",
          materialUom: def?.uom ?? "",
          materialRate: def?.rate ?? null,
          qtyPerUnit: component.qty_per_unit,
          legacy: component.item_id === null,
        };
      })
      .sort((a, b) => a.materialName.localeCompare(b.materialName)),
  };
}
