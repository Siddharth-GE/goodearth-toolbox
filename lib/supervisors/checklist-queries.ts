import "server-only";

import { requireTool } from "@/lib/auth/access";
import { fetchAll } from "@/lib/supabase/fetch-all";
import { readFailed } from "@/lib/supabase/read-failed";
import { createClient } from "@/lib/supabase/server";
import type { ChecklistOrigin } from "./checklist-workbook";
import { checklistProgress, checkStatusOf, type CheckStatus } from "./checklists";

/** Site checklists (0134): Supervisors' own tables. Templates are read by anyone signed in; a villa's checklists are /supervisors. */

const GRANT = "/supervisors";

const fail = (context: string, error: { message: string }): never =>
  readFailed("supervisors", context, error);

const originOf = (value: string): ChecklistOrigin =>
  value === "added" || value === "review" ? value : "source";

export type TemplateItemRow = {
  id: string;
  sortOrder: number;
  text: string;
  origin: ChecklistOrigin;
  reviewNote: string | null;
  isActive: boolean;
};

export type TemplateRow = {
  id: string;
  name: string;
  workRefs: string | null;
  note: string | null;
  isActive: boolean;
  items: TemplateItemRow[];
};

export async function listChecklistTemplates(): Promise<TemplateRow[]> {
  await requireTool(GRANT);
  const supabase = await createClient();
  const [{ data: templates, error }, items] = await Promise.all([
    supabase
      .from("checklist_templates")
      .select("id, name, work_refs, note, is_active, sort_order")
      .order("sort_order")
      .order("name"),
    fetchAll((from, to) =>
      supabase
        .from("checklist_template_items")
        .select("id, template_id, sort_order, text, origin, review_note, is_active")
        .order("template_id")
        .order("sort_order")
        .order("id")
        .range(from, to),
    ),
  ]);
  if (error) fail("checklist templates", error);

  return (templates ?? []).map((template) => ({
    id: template.id,
    name: template.name,
    workRefs: template.work_refs,
    note: template.note,
    isActive: template.is_active,
    items: items
      .filter((item) => item.template_id === template.id)
      .map((item) => ({
        id: item.id,
        sortOrder: item.sort_order,
        text: item.text,
        origin: originOf(item.origin),
        reviewNote: item.review_note,
        isActive: item.is_active,
      })),
  }));
}

export type VillaChecklistRow = {
  id: string;
  templateId: string;
  templateName: string;
  /** The stage it was started for (0137); null for one started before stages existed. */
  workGroupId: string | null;
  location: string | null;
  startedOn: string;
  status: "open" | "signed_off";
  signedOffAt: string | null;
  answered: number;
  total: number;
  failed: number;
};

export async function listVillaChecklists(plotId: string): Promise<VillaChecklistRow[]> {
  await requireTool(GRANT);
  const supabase = await createClient();
  const { data: checklists, error } = await supabase
    .from("site_checklists")
    .select(
      "id, template_id, work_group_id, location, started_on, status, signed_off_at, checklist_templates(name)",
    )
    .eq("plot_id", plotId)
    .order("started_on", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) fail("the villa's checklists", error);
  const ids = (checklists ?? []).map((checklist) => checklist.id);
  const items = ids.length
    ? await fetchAll((from, to) =>
        supabase
          .from("site_checklist_items")
          .select("id, checklist_id, status, remarks")
          .in("checklist_id", ids)
          .order("id")
          .range(from, to),
      )
    : [];

  return (checklists ?? []).map((checklist) => {
    const progress = checklistProgress(
      items
        .filter((item) => item.checklist_id === checklist.id)
        .map((item) => ({
          status: checkStatusOf(item.status) ?? "not_checked",
          remarks: item.remarks,
        })),
    );
    return {
      id: checklist.id,
      templateId: checklist.template_id,
      workGroupId: checklist.work_group_id,
      templateName: (checklist.checklist_templates as { name: string } | null)?.name ?? "—",
      location: checklist.location,
      startedOn: checklist.started_on,
      status: checklist.status === "signed_off" ? "signed_off" : "open",
      signedOffAt: checklist.signed_off_at,
      ...progress,
    };
  });
}

/** Which stages each checklist inspects (0137): template id → work group ids. */
export async function listTemplateGroups(): Promise<Map<string, string[]>> {
  await requireTool(GRANT);
  const supabase = await createClient();
  const links = await fetchAll((from, to) =>
    supabase
      .from("checklist_template_groups")
      .select("template_id, work_group_id")
      .order("id")
      .range(from, to),
  );
  const byTemplate = new Map<string, string[]>();
  for (const link of links) {
    byTemplate.set(link.template_id, [
      ...(byTemplate.get(link.template_id) ?? []),
      link.work_group_id,
    ]);
  }
  return byTemplate;
}

export type ChecklistItemRow = {
  id: string;
  sortOrder: number;
  text: string;
  origin: ChecklistOrigin;
  reviewNote: string | null;
  status: CheckStatus;
  remarks: string | null;
  /** The stored photo's name, used to version its link; null without one. */
  photo: string | null;
};

export type ChecklistDetail = {
  id: string;
  plotId: string;
  plotName: string;
  templateName: string;
  templateNote: string | null;
  workRefs: string | null;
  location: string | null;
  drawingRevision: string | null;
  startedOn: string;
  finishedOn: string | null;
  inspectedOn: string | null;
  note: string | null;
  status: "open" | "signed_off";
  signedOffAt: string | null;
  signedOffByName: string | null;
  createdByName: string | null;
  /** The stored attachment's name, used to version its link; null without one. */
  attachment: string | null;
  items: ChecklistItemRow[];
};

// A replacement is a new path; its name in the link keeps a browser from showing the old file from its cache.
const fileName = (path: string | null) => (path ? path.slice(path.lastIndexOf("/") + 1) : null);

export async function getChecklist(checklistId: string): Promise<ChecklistDetail | null> {
  await requireTool(GRANT);
  const supabase = await createClient();
  const [{ data: checklist, error }, items] = await Promise.all([
    supabase
      .from("site_checklists")
      .select(
        "id, plot_id, location, drawing_revision, started_on, finished_on, inspected_on, note, status, signed_off_at, signed_off_by, created_by, attachment_path, plots(name), checklist_templates(name, note, work_refs)",
      )
      .eq("id", checklistId)
      .maybeSingle(),
    fetchAll((from, to) =>
      supabase
        .from("site_checklist_items")
        .select(
          "id, status, remarks, photo_path, checklist_template_items(sort_order, text, origin, review_note)",
        )
        .eq("checklist_id", checklistId)
        .order("id")
        .range(from, to),
    ),
  ]);
  if (error) fail("the checklist", error);
  if (!checklist) return null;

  // One profiles read, not embeds (several FKs to profiles).
  const actorIds = [checklist.signed_off_by, checklist.created_by].filter(
    (id): id is string => id != null,
  );
  const { data: profiles, error: profilesError } = actorIds.length
    ? await supabase.from("profiles").select("id, full_name").in("id", actorIds)
    : { data: [], error: null };
  if (profilesError) fail("the checklist's people", profilesError);
  const nameOf = (id: string | null) =>
    id ? ((profiles ?? []).find((profile) => profile.id === id)?.full_name ?? null) : null;

  const template = checklist.checklist_templates as {
    name: string;
    note: string | null;
    work_refs: string | null;
  } | null;

  return {
    id: checklist.id,
    plotId: checklist.plot_id,
    plotName: (checklist.plots as { name: string } | null)?.name ?? "—",
    templateName: template?.name ?? "—",
    templateNote: template?.note ?? null,
    workRefs: template?.work_refs ?? null,
    location: checklist.location,
    drawingRevision: checklist.drawing_revision,
    startedOn: checklist.started_on,
    finishedOn: checklist.finished_on,
    inspectedOn: checklist.inspected_on,
    note: checklist.note,
    status: checklist.status === "signed_off" ? "signed_off" : "open",
    signedOffAt: checklist.signed_off_at,
    signedOffByName: nameOf(checklist.signed_off_by),
    createdByName: nameOf(checklist.created_by),
    attachment: fileName(checklist.attachment_path),
    items: items
      .map((item) => {
        const source = item.checklist_template_items as {
          sort_order: number;
          text: string;
          origin: string;
          review_note: string | null;
        } | null;
        return {
          id: item.id,
          sortOrder: source?.sort_order ?? 0,
          text: source?.text ?? "—",
          origin: originOf(source?.origin ?? "source"),
          reviewNote: source?.review_note ?? null,
          status: checkStatusOf(item.status) ?? "not_checked",
          remarks: item.remarks,
          photo: fileName(item.photo_path),
        };
      })
      .sort((a, b) => a.sortOrder - b.sortOrder),
  };
}
