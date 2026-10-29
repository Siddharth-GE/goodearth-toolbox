"use server";

import { requireTool } from "@/lib/auth/access";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import {
  getVillaForModel,
  getWorkingEstimateForModel,
  listMixesForModel,
  listWorksForModel,
} from "./model-import-queries";
import { listUomNames } from "./shared";
import { parseTakeoff, planImport, type ImportPlan, type Takeoff } from "./model-takeoff";
import { GRANT } from "./shared";
import { syncLineQty } from "./sheet-sync";

/** Import a SketchUp takeoff into a villa's working estimate (0118): a preview that writes nothing, then the import,
 * which re-reads the file and re-plans against the database as it is now. The file is untrusted; the grant and RLS are the boundary. */

export type ModelImportPreview = {
  villa: { unitId: string; name: string };
  startsEstimate: boolean;
  plan: Omit<ImportPlan, "payload" | "materialsPayload" | "otherCostsPayload">;
};

export type ModelImportResult = {
  estimateId: string;
  villa: { unitId: string; name: string };
  counts: ImportPlan["counts"];
  rows: number;
  unsynced: number;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Inputs =
  | { error: string }
  | {
      takeoff: Takeoff;
      villa: { unitId: string; name: string };
      works: Awaited<ReturnType<typeof listWorksForModel>>;
      mixes: Awaited<ReturnType<typeof listMixesForModel>>;
      units: string[];
      working: Awaited<ReturnType<typeof getWorkingEstimateForModel>>;
    };

async function readInputs(text: unknown, unitId: unknown): Promise<Inputs> {
  if (typeof unitId !== "string" || !UUID.test(unitId)) return { error: "Pick the villa first." };
  const parsed = parseTakeoff(text);
  if (parsed.problem !== undefined) return { error: parsed.problem };

  try {
    const [villa, works, mixes, units, working] = await Promise.all([
      getVillaForModel(unitId),
      listWorksForModel(),
      listMixesForModel(),
      listUomNames(),
      getWorkingEstimateForModel(unitId),
    ]);
    if (!villa) return { error: "That villa no longer exists — pick another." };
    return { takeoff: parsed.takeoff, villa, works, mixes, units, working };
  } catch (error) {
    console.error("model import (read) failed:", error);
    return { error: "Could not read the rate book or the villa's estimate. Try again." };
  }
}

export async function previewModelImport(
  text: string,
  unitId: string,
): Promise<{ error?: string; preview?: ModelImportPreview }> {
  await requireTool(GRANT);
  const inputs = await readInputs(text, unitId);
  if ("error" in inputs) return { error: inputs.error };

  const plan = planImport(inputs.takeoff, inputs.works, inputs.working, inputs.mixes, inputs.units);
  return {
    preview: {
      villa: inputs.villa,
      startsEstimate: !inputs.working,
      plan: {
        entries: plan.entries,
        removals: plan.removals,
        materials: plan.materials,
        newMixes: plan.newMixes,
        otherCosts: plan.otherCosts,
        differentModel: plan.differentModel,
        counts: plan.counts,
        canImport: plan.canImport,
      },
    },
  };
}

export async function importModelTakeoff(
  text: string,
  unitId: string,
): Promise<{ error?: string; imported?: ModelImportResult }> {
  const user = await requireTool(GRANT);
  const inputs = await readInputs(text, unitId);
  if ("error" in inputs) return { error: inputs.error };
  const { takeoff, villa, works, mixes, units } = inputs;
  const supabase = await createClient();

  // A villa with no working estimate gets a blank one first (0098); in a race, the second import finds the first's.
  let working = inputs.working;
  if (!working) {
    if (!planImport(takeoff, works, null, mixes, units).canImport) {
      return { error: "Nothing in this takeoff can be imported — see why beside each work." };
    }
    const { error } = await supabase.rpc("start_villa_estimate", {
      p_unit: villa.unitId,
      // Null starts it blank; the generated types cannot say an argument may be null.
      p_source: null as unknown as string,
      p_everything: false,
      p_name: null as unknown as string,
    });
    if (error && error.code !== "23505" && !error.message.includes("already has a working")) {
      if (error.code === "P0001") return { error: error.message };
      console.error("importModelTakeoff (start) failed:", error);
      return { error: "Could not start the villa's estimate. Try again." };
    }
    try {
      working = await getWorkingEstimateForModel(villa.unitId);
    } catch (readError) {
      console.error("importModelTakeoff (re-read) failed:", readError);
      return { error: "The estimate was started, but could not be read. Press Import again." };
    }
    if (!working) return { error: "Could not start the villa's estimate. Try again." };
  }

  const plan = planImport(takeoff, works, working, mixes, units);
  if (!plan.canImport) {
    return { error: "Nothing in this takeoff can be imported — see why beside each work." };
  }

  const { data: touched, error } = await supabase.rpc("import_model_takeoff", {
    p_estimate: working.estimateId,
    p_lines: plan.payload,
    p_model: {
      file: takeoff.model.file,
      guid: takeoff.model.guid,
      settings: takeoff.settings,
      bua_sqft: takeoff.buaSqft,
    },
    p_materials: plan.materialsPayload,
    p_other_costs: plan.otherCostsPayload,
  });
  if (error) {
    if (error.code === "P0001") return { error: error.message };
    console.error("importModelTakeoff (rows) failed:", error);
    return { error: "Could not import the takeoff. Nothing was changed — try again." };
  }

  // Every touched line is re-summed through calc.ts, as after a hand-typed row.
  const lineIds = touched ?? [];
  let unsynced = 0;
  for (let index = 0; index < lineIds.length; index += 8) {
    const results = await Promise.all(
      lineIds.slice(index, index + 8).map((lineId) => syncLineQty(supabase, lineId, user.id)),
    );
    unsynced += results.filter(Boolean).length;
  }

  revalidatePath("/estimator", "layout");
  return {
    imported: {
      estimateId: working.estimateId,
      villa,
      counts: plan.counts,
      rows: plan.payload.reduce((sum, line) => sum + line.rows.length, 0),
      unsynced,
    },
  };
}
