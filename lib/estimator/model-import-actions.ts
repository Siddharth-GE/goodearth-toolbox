"use server";

import { requireTool } from "@/lib/auth/access";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import {
  getVillaForModel,
  getWorkingEstimateForModel,
  listWorksForModel,
} from "./model-import-queries";
import { parseTakeoff, planImport, type ImportPlan, type Takeoff } from "./model-takeoff";
import { GRANT } from "./shared";
import { syncLineQty } from "./sheet-sync";

/**
 * Importing a SketchUp takeoff into a villa's working estimate (0118;
 * root plan.md, sixth piece). Two steps, the Birdwing Books upload's
 * shape: a preview that writes nothing, then the import — which reads the
 * file again, here, and plans again against the database as it is now.
 * What the browser showed is never trusted.
 *
 * The file is untrusted input: model-takeoff.ts reads and checks it, and
 * nothing in it decides identity or access — the villa is the person's
 * choice, the grant is /estimator, RLS is the boundary underneath.
 */

/** What the page shows before anything is written. */
export type ModelImportPreview = {
  villa: { unitId: string; name: string };
  /** The villa has no working estimate yet — Import starts a blank one. */
  startsEstimate: boolean;
  /** The plan without its payload: the rows stay on the server. */
  plan: Omit<ImportPlan, "payload">;
};

export type ModelImportResult = {
  estimateId: string;
  villa: { unitId: string; name: string };
  counts: ImportPlan["counts"];
  rows: number;
  /** Works whose quantity could not be re-summed — sending again fixes it. */
  unsynced: number;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Inputs =
  | { error: string }
  | {
      takeoff: Takeoff;
      villa: { unitId: string; name: string };
      works: Awaited<ReturnType<typeof listWorksForModel>>;
      working: Awaited<ReturnType<typeof getWorkingEstimateForModel>>;
    };

/** The file read and checked, the villa found, the rate book and the
 * villa's working estimate read — or the one sentence saying why not. */
async function readInputs(text: unknown, unitId: unknown): Promise<Inputs> {
  if (typeof unitId !== "string" || !UUID.test(unitId)) return { error: "Pick the villa first." };
  const parsed = parseTakeoff(text);
  if (parsed.problem !== undefined) return { error: parsed.problem };

  try {
    const [villa, works, working] = await Promise.all([
      getVillaForModel(unitId),
      listWorksForModel(),
      getWorkingEstimateForModel(unitId),
    ]);
    if (!villa) return { error: "That villa no longer exists — pick another." };
    return { takeoff: parsed.takeoff, villa, works, working };
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

  const plan = planImport(inputs.takeoff, inputs.works, inputs.working);
  return {
    preview: {
      villa: inputs.villa,
      startsEstimate: !inputs.working,
      plan: {
        entries: plan.entries,
        removals: plan.removals,
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
  const { takeoff, villa, works } = inputs;
  const supabase = await createClient();

  // A villa with no working estimate gets a blank one first (0098). Two
  // imports racing for the same villa: the second finds the first's.
  let working = inputs.working;
  if (!working) {
    if (!planImport(takeoff, works, null).canImport) {
      return { error: "Nothing in this takeoff can be imported — see why beside each work." };
    }
    const { error } = await supabase.rpc("start_villa_estimate", {
      p_unit: villa.unitId,
      // Null starts it blank; the generated types can't say an argument
      // may be null.
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

  const plan = planImport(takeoff, works, working);
  if (!plan.canImport) {
    return { error: "Nothing in this takeoff can be imported — see why beside each work." };
  }

  const { data: touched, error } = await supabase.rpc("import_model_rows", {
    p_estimate: working.estimateId,
    p_lines: plan.payload,
    p_model: { file: takeoff.model.file, guid: takeoff.model.guid },
  });
  if (error) {
    if (error.code === "P0001") return { error: error.message };
    console.error("importModelTakeoff (rows) failed:", error);
    return { error: "Could not import the takeoff. Nothing was changed — try again." };
  }

  // The quantities: every touched line re-summed through calc.ts, the
  // same as after a row typed by hand. A few at a time.
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
