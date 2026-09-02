import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { fetchAll } from "@/lib/supabase/fetch-all";
import { projectLabel, unitLabel, type MatchProject, type MatchUnit } from "./space-match";

/**
 * Which villa or project a chat space is for: the four things the door
 * does with `google_chat_spaces`, and the two name reads that give the
 * bot something to match against.
 *
 * Admin-client use, sanctioned in SECURITY.md alongside identity.ts:
 * `google_chat_spaces` is a deny-all table (`0094`) that only this door
 * owns — RLS on, zero policies, every privilege revoked from the client
 * roles — so the service-role client is the only thing that can reach
 * it. The project and unit names read here are visible to every
 * signed-in person anyway; the door simply has no browser session to
 * read them with.
 *
 * Nothing here throws. The door must always answer Google with a card
 * within its ~30 seconds, so a failed read comes back as null and a
 * failed write as false, each already logged — and the door says a
 * plain sentence rather than showing a raw error in the space.
 */

/** Everything the /link dropdown and the join match are built from. */
export type LinkTargets = { projects: MatchProject[]; units: MatchUnit[] };

/** A space's current link, with the label the bot uses to say it out loud. */
export type SpaceLink = { projectId: string; unitId: string | null; label: string };

/**
 * Every project and every villa, by name. Read to completion — the
 * dropdown and the join match are both only correct when they see all
 * of them, and a silently truncated page would link a space to the
 * wrong villa or to none at all. Null means the read failed.
 */
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

/**
 * What this space is linked to, or null when it is linked to nothing —
 * and also null when the read failed, which the log distinguishes. Both
 * mean the same thing to the door: treat the space as unlinked, which
 * is the safe answer in every case (commands span everything).
 *
 * The units embed names its foreign key: `google_chat_spaces` has two
 * of them pointing at `units` (the plain one and the 0036 composite),
 * and PostgREST refuses an ambiguous embed outright (BUGCATCHER #2).
 */
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

/**
 * Link this space to a project, or to one villa of it. One row per
 * space, so re-linking overwrites rather than piling up: the space id
 * is the primary key and Google keeps it stable across renames.
 *
 * `linkedBy` is null when the bot did this itself on joining, and the
 * person when /link did. False means the write failed and the door says
 * so; it never throws.
 */
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

/**
 * Forget this space's link — commands here go back to spanning
 * everything. Deleting a space that was never linked is a success, not
 * an error: the person asked for "not linked" and that is what they now
 * have.
 */
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
