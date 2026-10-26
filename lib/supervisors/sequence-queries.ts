import "server-only";

import { requireTool } from "@/lib/auth/access";
import { listWorkCategories, listWorkGroups } from "@/lib/masters/works";
import { fetchAll } from "@/lib/supabase/fetch-all";
import { readFailed } from "@/lib/supabase/read-failed";
import { createClient } from "@/lib/supabase/server";
import { isSequenceLink, type SequenceLink } from "./schedule";

/** The site sequence (0137): one order of stages for every villa, and the typical days the schedule starts from. */

const GRANT = "/supervisors";

export type SequenceRow = {
  groupId: string;
  code: string;
  name: string;
  position: number;
  followsGroupId: string | null;
  followsLabel: string | null;
  link: SequenceLink;
  waitDays: number;
  typicalDays: number | null;
  /** Stand-in days for the site team to replace. */
  daysToConfirm: boolean;
};

export type SiteSequence = {
  rows: SequenceRow[];
  /** Active work groups the sequence does not have yet. */
  missing: { id: string; code: string; name: string }[];
  typicalSqft: number | null;
};

export async function getSiteSequence(): Promise<SiteSequence> {
  await requireTool(GRANT);
  const supabase = await createClient();
  const [groups, sequence, settings] = await Promise.all([
    listWorkGroups(),
    fetchAll((from, to) =>
      supabase
        .from("site_sequence")
        .select(
          "work_group_id, position, follows_group_id, link, wait_days, typical_days, days_to_confirm",
        )
        .order("position")
        .order("id")
        .range(from, to),
    ),
    supabase.from("site_schedule_settings").select("typical_sqft").maybeSingle(),
  ]);
  if (settings.error) readFailed("supervisors", "the schedule settings", settings.error);

  const groupById = new Map(groups.map((group) => [group.id, group]));
  const label = (id: string | null) => {
    const group = id ? groupById.get(id) : null;
    return group ? `${group.code} ${group.name}` : null;
  };
  const inSequence = new Set(sequence.map((entry) => entry.work_group_id));

  return {
    rows: sequence.flatMap((entry) => {
      const group = groupById.get(entry.work_group_id);
      if (!group) return [];
      return [
        {
          groupId: entry.work_group_id,
          code: group.code,
          name: group.name,
          position: entry.position,
          followsGroupId: entry.follows_group_id,
          followsLabel: label(entry.follows_group_id),
          link: isSequenceLink(entry.link) ? entry.link : "after",
          waitDays: entry.wait_days,
          typicalDays: entry.typical_days,
          daysToConfirm: entry.days_to_confirm,
        },
      ];
    }),
    missing: groups
      .filter((group) => group.is_active && !inSequence.has(group.id))
      .map((group) => ({ id: group.id, code: group.code, name: group.name })),
    typicalSqft: settings.data?.typical_sqft ?? null,
  };
}

export type CategoryLead = {
  categoryId: string;
  code: string;
  name: string;
  ownerId: string | null;
};

/** Each active work category and its lead (0158), with everyone who may lead one. */
export async function getCategoryLeads(): Promise<{
  categories: CategoryLead[];
  people: { id: string; name: string }[];
}> {
  await requireTool(GRANT);
  const supabase = await createClient();
  const [categories, leads, people] = await Promise.all([
    listWorkCategories(),
    supabase.from("site_category_owners").select("category_id, owner_id"),
    fetchAll((from, to) =>
      supabase
        .from("profiles")
        .select("id, full_name")
        .eq("is_active", true)
        .order("full_name")
        .order("id")
        .range(from, to),
    ),
  ]);
  if (leads.error) readFailed("supervisors", "the category leads", leads.error);
  const leadOf = new Map((leads.data ?? []).map((row) => [row.category_id, row.owner_id]));
  return {
    categories: categories
      .filter((category) => category.is_active)
      .map((category) => ({
        categoryId: category.id,
        code: category.code,
        name: category.name,
        ownerId: leadOf.get(category.id) ?? null,
      })),
    people: people.map((person) => ({ id: person.id, name: person.full_name ?? "—" })),
  };
}
