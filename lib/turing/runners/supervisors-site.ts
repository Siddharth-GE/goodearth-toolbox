import "server-only";

import { createIssueRequest, withdrawIssueRequest } from "@/lib/supervisors/actions";
import {
  addChecklistTemplateItem,
  answerChecklistItem,
  createChecklistTemplate,
  deleteChecklist,
  setChecklistTemplateActive,
  setChecklistTemplateItemActive,
  setTemplateStages,
  signOffChecklist,
  startChecklist,
  updateChecklistDetails,
  updateChecklistTemplate,
} from "@/lib/supervisors/checklist-actions";
import {
  addSequenceStage,
  moveSequenceStage,
  removeSequenceStage,
  setTypicalSqft,
  updateSequenceStage,
} from "@/lib/supervisors/sequence-actions";
import { confirmSiteReceipt } from "@/lib/supervisors/site-receipt-actions";
import { createClient } from "@/lib/supabase/server";

import { entryFor, formOf } from "../catalogue-fields";
import { receivedFor, type SUPERVISORS_SITE } from "../entries/supervisors-site";
import {
  failed,
  firstRefusal,
  given,
  recordNow,
  retired,
  saving,
  type RunResult,
  type Runners,
  type Values,
} from "./kit";

type Failure = { error: string };

const formFor = (
  key: Parameters<typeof entryFor>[0],
  values: Values,
  now?: Record<string, unknown>,
) => {
  const entry = entryFor(key);
  return entry ? formOf(entry, values, now) : new FormData();
};

/** A checklist as it stands; only an open one changes. */
async function openChecklist(
  checklistId: string,
): Promise<{ row: Record<string, unknown> } | Failure> {
  const now = await recordNow(
    "site_checklists",
    { column: "id", id: checklistId },
    ["status", "plot_id", "location", "drawing_revision", "finished_on", "inspected_on", "note"],
    "That checklist is gone.",
  );
  if ("error" in now) return now;
  if (now.row.status !== "open")
    return { error: "That checklist is signed off; a signed-off checklist never changes." };
  return now;
}

/** A work group the screens offer to add: there and active in Masters. */
async function groupActive(groupId: string): Promise<Failure | null> {
  const now = await recordNow(
    "work_groups",
    { column: "id", id: groupId },
    ["is_active"],
    "That stage is gone.",
  );
  if ("error" in now) return now;
  return now.row.is_active ? null : { error: "That stage is switched off in Masters." };
}

async function sequenceNow() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("site_sequence")
    .select("work_group_id, follows_group_id, link, wait_days, typical_days")
    .order("position")
    .order("id");
  if (error) return failed("site sequence", error);
  return { rows: data ?? [] };
}

/** A stage the site checks: which templates inspect it. */
async function linksOf(column: "template_id" | "work_group_id", id: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("checklist_template_groups")
    .select("template_id, work_group_id")
    .eq(column, id);
  if (error) return failed("checklist stages", error);
  return { rows: data ?? [] };
}

/** The site's confirmation, every line given, as the dialog sends it. */
async function confirming(
  kind: "issue" | "receipt",
  id: string,
  header: Values,
  lines: Values[],
): Promise<RunResult> {
  const supabase = await createClient();
  const sent =
    kind === "issue"
      ? await supabase.from("stock_issue_lines").select("id, quantity").eq("issue_id", id)
      : await supabase.from("goods_receipt_lines").select("id, quantity").eq("receipt_id", id);
  if (sent.error) return failed("lines sent", sent.error);
  const received = receivedFor(
    sent.data ?? [],
    lines.map((line) => ({ lineId: String(line.line_id), received: Number(line.received) })),
  );
  if ("error" in received) return received;
  return confirmSiteReceipt({
    kind,
    id,
    received: received.received,
    note: header.note ? String(header.note) : null,
  });
}

/** Each of the rest of Supervisors' entries, run through Supervisors' own action, as the admin. */
export const SUPERVISORS_SITE_RUNNERS: Runners<(typeof SUPERVISORS_SITE)[number]["key"]> = {
  sup_request_new: async (v) => {
    // The request form offers only active works and catalogue items.
    const refused = await firstRefusal([
      retired("work_items", String(v.work_item_id)),
      retired("items", String(v.item_id)),
    ]);
    if (refused) return refused;
    return createIssueRequest(undefined, formFor("sup_request_new", v));
  },
  sup_request_withdraw: async (v) => {
    const now = await recordNow(
      "issue_requests",
      { column: "id", id: String(v.request_id) },
      ["status"],
      "That request is gone.",
    );
    if ("error" in now) return now;
    if (now.row.status !== "requested")
      return { error: "The store has already answered this request — it can't be withdrawn now." };
    return withdrawIssueRequest(String(v.request_id));
  },
  sup_checklist_start: async (v) => {
    const plotId = String(v.plot_id);
    const templateId = String(v.template_id);
    const template = await recordNow(
      "checklist_templates",
      { column: "id", id: templateId },
      ["is_active"],
      "That checklist template is gone.",
    );
    if ("error" in template) return template;
    if (!template.row.is_active) return { error: "That checklist template is switched off." };
    const stageId = v.work_group_id ? String(v.work_group_id) : null;
    if (stageId) {
      // A stage's Start offers only its own checklists, and only while none of them is open there.
      const links = await linksOf("work_group_id", stageId);
      if ("error" in links) return links;
      const inspecting = links.rows.map((row) => row.template_id);
      if (!inspecting.includes(templateId))
        return { error: "That checklist is not set to inspect that stage." };
      const supabase = await createClient();
      const { data, error } = await supabase
        .from("site_checklists")
        .select("id")
        .eq("plot_id", plotId)
        .eq("status", "open")
        .in("template_id", inspecting)
        .or(`work_group_id.eq.${stageId},work_group_id.is.null`)
        .limit(1);
      if (error) return failed("open checklists", error);
      if ((data ?? []).length > 0)
        return { error: "A checklist of that stage is open on this villa; finish it first." };
    }
    const done = await saving(
      () => startChecklist(undefined, formFor("sup_checklist_start", v)),
      "/supervisors/villas/",
    );
    return "error" in done ? done : undefined;
  },
  sup_checklist_details: async (v) => {
    const id = String(v.checklist_id);
    const now = await openChecklist(id);
    if ("error" in now) return now;
    const keys = ["location", "drawing_revision", "finished_on", "inspected_on", "note"];
    const next = Object.fromEntries(
      keys.map((key) => [key, given(v, key, now.row[key] as string | null)]),
    );
    if (keys.every((key) => next[key] === String(now.row[key] ?? "")))
      return { error: "The checklist already says that." };
    return updateChecklistDetails(id, {
      location: next.location || null,
      drawingRevision: next.drawing_revision || null,
      finishedOn: next.finished_on || null,
      inspectedOn: next.inspected_on || null,
      note: next.note || null,
    });
  },
  sup_checklist_answer: async (v) => {
    const id = String(v.item_id);
    const now = await recordNow(
      "site_checklist_items",
      { column: "id", id },
      ["checklist_id", "status", "remarks"],
      "That check is gone.",
    );
    if ("error" in now) return now;
    const open = await openChecklist(String(now.row.checklist_id));
    if ("error" in open) return open;
    const status = given(v, "status", now.row.status as string);
    const remarks = given(v, "remarks", now.row.remarks as string | null);
    if (status === now.row.status && remarks === String(now.row.remarks ?? ""))
      return { error: "That check already has that answer." };
    return answerChecklistItem(id, { status, remarks: remarks || null });
  },
  sup_checklist_sign_off: async (v) => {
    const now = await openChecklist(String(v.checklist_id));
    if ("error" in now) return now;
    return signOffChecklist(String(v.checklist_id));
  },
  sup_checklist_delete: async (v) => {
    const id = String(v.checklist_id);
    const now = await openChecklist(id);
    if ("error" in now) return now;
    const done = await saving(
      () => deleteChecklist(id, String(now.row.plot_id)),
      "/supervisors/villas/",
    );
    return "error" in done ? done : undefined;
  },
  sup_template_new: (v) => createChecklistTemplate(undefined, formFor("sup_template_new", v)),
  sup_template_change: async (v) => {
    const id = String(v.template_id);
    const now = await recordNow(
      "checklist_templates",
      { column: "id", id },
      ["name", "work_refs", "note"],
      "That checklist template is gone.",
    );
    if ("error" in now) return now;
    if (
      ["name", "work_refs", "note"].every(
        (key) => given(v, key, now.row[key] as string | null) === String(now.row[key] ?? ""),
      )
    )
      return { error: "The template already says that." };
    const form = formFor("sup_template_change", v, now.row);
    form.set("id", id);
    return updateChecklistTemplate(undefined, form);
  },
  sup_template_active: async (v) => {
    const id = String(v.template_id);
    const now = await recordNow(
      "checklist_templates",
      { column: "id", id },
      ["is_active"],
      "That checklist template is gone.",
    );
    if ("error" in now) return now;
    if (now.row.is_active === v.active)
      return { error: `That template is already switched ${v.active ? "on" : "off"}.` };
    return setChecklistTemplateActive(id, v.active === true);
  },
  sup_template_check_add: async (v) => {
    const now = await recordNow(
      "checklist_templates",
      { column: "id", id: String(v.template_id) },
      ["id"],
      "That checklist template is gone.",
    );
    if ("error" in now) return now;
    return addChecklistTemplateItem(String(v.template_id), String(v.text));
  },
  sup_template_check_active: async (v) => {
    const id = String(v.check_id);
    const now = await recordNow(
      "checklist_template_items",
      { column: "id", id },
      ["is_active"],
      "That check is gone.",
    );
    if ("error" in now) return now;
    if (now.row.is_active === v.active)
      return { error: `That check is already switched ${v.active ? "on" : "off"}.` };
    return setChecklistTemplateItemActive(id, v.active === true);
  },
  sup_template_stage: async (v) => {
    const templateId = String(v.template_id);
    const groupId = String(v.group_id);
    const template = await recordNow(
      "checklist_templates",
      { column: "id", id: templateId },
      ["id"],
      "That checklist template is gone.",
    );
    if ("error" in template) return template;
    const links = await linksOf("template_id", templateId);
    if ("error" in links) return links;
    const have = links.rows.map((row) => row.work_group_id);
    if (v.inspects === true) {
      if (have.includes(groupId)) return { error: "That checklist already inspects that stage." };
      // The stage picker offers only active work groups; one already linked can always come off.
      const refused = await groupActive(groupId);
      if (refused) return refused;
      return setTemplateStages(templateId, [...have, groupId]);
    }
    if (!have.includes(groupId)) return { error: "That checklist does not inspect that stage." };
    return setTemplateStages(
      templateId,
      have.filter((id) => id !== groupId),
    );
  },
  sup_sequence_follows: async (v) => {
    const groupId = String(v.group_id);
    const sequence = await sequenceNow();
    if ("error" in sequence) return sequence;
    const now = sequence.rows.find((row) => row.work_group_id === groupId);
    if (!now) return { error: "That stage is not in the site sequence." };
    const follows = given(v, "follows_group_id", now.follows_group_id);
    // A villa's first stage follows nothing, so how it follows is "after", as the editor sends it.
    const link = follows ? given(v, "link", now.link) : "after";
    if (follows === (now.follows_group_id ?? "") && link === now.link)
      return { error: "That stage already follows that, that way." };
    return updateSequenceStage({
      groupId,
      followsGroupId: follows,
      link,
      waitDays: String(now.wait_days),
      typicalDays: now.typical_days === null ? "" : String(now.typical_days),
    });
  },
  sup_sequence_move: async (v) => {
    const sequence = await sequenceNow();
    if ("error" in sequence) return sequence;
    // The move does nothing at either end, or for a stage not in it, without a word; said here.
    const at = sequence.rows.findIndex((row) => row.work_group_id === v.group_id);
    if (at < 0) return { error: "That stage is not in the site sequence." };
    if (v.direction === "up" && at === 0) return { error: "That stage is already first." };
    if (v.direction === "down" && at === sequence.rows.length - 1)
      return { error: "That stage is already last." };
    return moveSequenceStage({
      groupId: String(v.group_id),
      direction: v.direction === "up" ? "up" : "down",
    });
  },
  sup_sequence_add: async (v) => {
    const refused = await groupActive(String(v.group_id));
    if (refused) return refused;
    return addSequenceStage({ groupId: String(v.group_id) });
  },
  sup_sequence_remove: async (v) => {
    const sequence = await sequenceNow();
    if ("error" in sequence) return sequence;
    // Taking out a stage not in it says nothing; said here.
    if (!sequence.rows.some((row) => row.work_group_id === v.group_id))
      return { error: "That stage is not in the site sequence." };
    return removeSequenceStage({ groupId: String(v.group_id) });
  },
  sup_typical_sqft: async (v) => {
    const now = await recordNow(
      "site_schedule_settings",
      { column: "singleton", id: "true" },
      ["typical_sqft"],
      "The schedule's settings are missing.",
    );
    if ("error" in now) return now;
    const sqft = String(v.sqft);
    const current = now.row.typical_sqft;
    if (sqft === "" ? current === null : Number(sqft) === Number(current))
      return { error: "The typical villa is already that size." };
    return setTypicalSqft({ sqft });
  },
  sup_issue_confirm: {
    lines: async (header, lines) => {
      const id = String(header.issue_id);
      const issue = await recordNow(
        "stock_issues",
        { column: "id", id },
        ["plot_id"],
        "That issue is gone.",
      );
      if ("error" in issue) return issue;
      if (!issue.row.plot_id)
        return {
          error: "That issue went to a store, not a villa; only a villa confirms what reached it.",
        };
      return confirming("issue", id, header, lines);
    },
  },
  sup_receipt_confirm: {
    lines: async (header, lines) => {
      const id = String(header.receipt_id);
      const receipt = await recordNow(
        "goods_receipts",
        { column: "id", id },
        ["plot_id", "to_site"],
        "That delivery is gone.",
      );
      if ("error" in receipt) return receipt;
      if (!receipt.row.to_site || !receipt.row.plot_id)
        return {
          error:
            "That delivery went to a store, not a villa; only a villa confirms what reached it.",
        };
      return confirming("receipt", id, header, lines);
    },
  },
};
