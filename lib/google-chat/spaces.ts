import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { fetchAll } from "@/lib/supabase/fetch-all";
import { projectLabel, unitLabel, type MatchProject, type MatchUnit } from "./space-match";

// Admin client, sanctioned in SECURITY.md: google_chat_spaces is a deny-all table (0094) only this
// door owns (RLS on, no policies, client privileges revoked). Project and unit names are visible
// to everyone, but the door has no session. Nothing throws: a failed read is null, a failed write
// false, already logged.

export type LinkTargets = { projects: MatchProject[]; units: MatchUnit[] };

export type SpaceLink = { projectId: string; unitId: string | null; label: string };

// Read to completion (fetchAll): a truncated page would link a space to the wrong villa.
export async function listLinkTargets(): Promise<LinkTargets | null> {
  try {
    const admin = createAdminClient();

    const projects = await fetchAll(async (from, to) =>
      admin.from("projects").select("id, name, code").order("id").range(from, to),
    );
    const units = await fetchAll(async (from, to) =>
      admin.from("units").select("id, name, code, project_id").order("id").range(from, to),
    );

    return {
      projects,
      units: units.map((unit) => ({
        id: unit.id,
        name: unit.name,
        code: unit.code,
        projectId: unit.project_id,
      })),
    };
  } catch (error) {
    console.error("google-chat spaces: link targets read failed", error);
    return null;
  }
}

// Null on a failed read too (the log tells them apart); either way the space is treated as
// unlinked, the safe answer. The units embed names its FK: two point at `units` (plain and 0036
// composite) and PostgREST refuses the ambiguity (BUGCATCHER #2).
export async function getSpaceLink(spaceId: string): Promise<SpaceLink | null> {
  if (!spaceId) return null;

  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("google_chat_spaces")
      .select(
        "project_id, unit_id, projects!google_chat_spaces_project_id_fkey(name), units!google_chat_spaces_unit_id_fkey(name)",
      )
      .eq("space_id", spaceId)
      .maybeSingle();

    if (error) {
      console.error("google-chat spaces: link read failed", error);
      return null;
    }
    if (!data) return null;

    const projectName = data.projects?.name ?? "";
    const unitName = data.units?.name ?? "";
    return {
      projectId: data.project_id,
      unitId: data.unit_id,
      label:
        data.unit_id && unitName ? unitLabel(projectName, unitName) : projectLabel(projectName),
    };
  } catch (error) {
    console.error("google-chat spaces: link read broke", error);
    return null;
  }
}

// One row per space (the id is the primary key and survives renames), so re-linking overwrites.
// `linkedBy` is null when the bot linked it on joining.
export async function linkSpace({
  spaceId,
  spaceName,
  projectId,
  unitId,
  linkedBy,
}: {
  spaceId: string;
  spaceName: string | null;
  projectId: string;
  unitId: string | null;
  linkedBy: string | null;
}): Promise<boolean> {
  try {
    const admin = createAdminClient();
    const { error } = await admin.from("google_chat_spaces").upsert(
      {
        space_id: spaceId,
        space_name: spaceName,
        project_id: projectId,
        unit_id: unitId,
        linked_by: linkedBy,
        linked_at: new Date().toISOString(),
      },
      { onConflict: "space_id" },
    );

    if (error) {
      console.error("google-chat spaces: link write failed", error);
      return false;
    }
    return true;
  } catch (error) {
    console.error("google-chat spaces: link write broke", error);
    return false;
  }
}

// Deleting a never-linked space is a success: they asked for "not linked".
export async function unlinkSpace(spaceId: string): Promise<boolean> {
  try {
    const admin = createAdminClient();
    const { error } = await admin.from("google_chat_spaces").delete().eq("space_id", spaceId);

    if (error) {
      console.error("google-chat spaces: unlink failed", error);
      return false;
    }
    return true;
  } catch (error) {
    console.error("google-chat spaces: unlink broke", error);
    return false;
  }
}
