import "server-only";

import {
  addReceipt,
  assignPlot,
  cancelReceipt,
  createClientRecord,
  saveMilestone,
  updateClientRecord,
} from "@/lib/client-relations/actions";
import {
  addNextStep,
  cancelNextStep,
  deleteNextStep,
  updateNextStep,
  updatePlot,
} from "@/lib/client-relations/next-steps-actions";
import { todayInIndia } from "@/lib/format";
import { actionRemoval } from "@/lib/next-steps/rules";
import { createClient } from "@/lib/supabase/server";

import { BOTTLENECK_VALUES, type CLIENT_RELATIONS } from "../entries/client-relations";
import { failed, given, recordNow, type Runners, type Values } from "./kit";

type Key = (typeof CLIENT_RELATIONS)[number]["key"];
type Refusal = { error: string } | null;

const text = (values: Values, key: string) =>
  typeof values[key] === "string" && values[key] ? String(values[key]).trim() : null;
const numberOf = (values: Values, key: string) => {
  const value = text(values, key);
  return value === null ? null : Number(value);
};
/** A field given (even empty) as the patch's value; left out, undefined — the save leaves it alone. */
const patchText = (values: Values, key: string) =>
  key in values ? (text(values, key) ?? null) : undefined;

/** Owners and handlers are people on the Client Relations team, as every picker offers. */
async function teamRefused(ids: (string | null)[]): Promise<Refusal> {
  const asked = ids.filter((id): id is string => Boolean(id));
  if (asked.length === 0) return null;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("client_relations_team");
  if (error) return failed("client_relations_team", error);
  const team = new Set((data ?? []).map((row) => row.id));
  return asked.every((id) => team.has(id))
    ? null
    : { error: "That person is not on the Client Relations team." };
}

type Plot = {
  unitId: string;
  clientId: string | null;
  engagementId: string | null;
  constructionOwner: string | null;
  interiorOwner: string | null;
};

/** A plot's villa and its Client Relations record, which hangs off the villa. */
async function plotOf(plotId: string): Promise<Plot | { error: string }> {
  const unit = await recordNow(
    "units",
    { column: "plot_id", id: plotId },
    ["id", "client_id"],
    "That plot has no villa in Masters yet.",
  );
  if ("error" in unit) return unit;
  const engagement = await recordNow(
    "client_engagements",
    { column: "unit_id", id: String(unit.row.id) },
    ["id", "crm_owner_id", "kaadal_owner_id"],
    null,
  );
  if ("error" in engagement) return engagement;
  return {
    unitId: String(unit.row.id),
    clientId: (unit.row.client_id as string | null) ?? null,
    engagementId: (engagement.row.id as string | undefined) ?? null,
    constructionOwner: (engagement.row.crm_owner_id as string | null | undefined) ?? null,
    interiorOwner: (engagement.row.kaadal_owner_id as string | null | undefined) ?? null,
  };
}

/** A plot's record in Client Relations: every villa has one (0050). */
async function recordOf(
  plotId: string,
): Promise<(Plot & { engagementId: string }) | { error: string }> {
  const found = await plotOf(plotId);
  if ("error" in found) return found;
  if (!found.engagementId) return { error: "That plot has no record in Client Relations yet." };
  return found as Plot & { engagementId: string };
}

/** The screen asks for a lost reason only once lost is picked, so one given otherwise would be dropped. */
const lostRefused = (stage: string, reason: string | null): Refusal =>
  reason && stage !== "lost" ? { error: "A reason goes only with a lost client." } : null;

/** The client form's email box takes only an address. */
const emailRefused = (email: string | null): Refusal =>
  email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)
    ? { error: `"${email}" is not an email address.` }
    : null;

export const CLIENT_RELATIONS_RUNNERS: Runners<Key> = {
  crm_client_new: async (v) => {
    const stage = text(v, "stage") ?? "prospect";
    const refused =
      lostRefused(stage, text(v, "lost_reason")) ??
      emailRefused(text(v, "email")) ??
      (await teamRefused([text(v, "owner_id")]));
    if (refused) return refused;
    return createClientRecord({
      name: String(v.name),
      mobile: text(v, "mobile"),
      email: text(v, "email"),
      stage,
      ownerId: text(v, "owner_id"),
      source: text(v, "source"),
      firstContactOn: text(v, "first_contact_on"),
      lostReason: text(v, "lost_reason"),
      notes: text(v, "notes"),
    });
  },
  crm_client_change: async (v) => {
    const now = await recordNow(
      "clients",
      { column: "id", id: String(v.client_id) },
      [
        "name",
        "mobile",
        "email",
        "stage",
        "crm_owner_id",
        "source",
        "first_contact_on",
        "lost_reason",
        "notes",
      ],
      "That client is gone.",
    );
    if ("error" in now) return now;
    const row = now.row as Record<string, string | null>;
    const stage = given(v, "stage", row.stage);
    const ownerId = given(v, "owner_id", row.crm_owner_id) || null;
    const lostReason = given(v, "lost_reason", row.lost_reason) || null;
    const refused =
      ("lost_reason" in v ? lostRefused(stage, text(v, "lost_reason")) : null) ??
      emailRefused(text(v, "email")) ??
      (ownerId !== row.crm_owner_id ? await teamRefused([ownerId]) : null);
    if (refused) return refused;
    return updateClientRecord(String(v.client_id), {
      name: given(v, "name", row.name),
      mobile: given(v, "mobile", row.mobile) || null,
      email: given(v, "email", row.email) || null,
      stage,
      ownerId,
      source: given(v, "source", row.source) || null,
      firstContactOn: given(v, "first_contact_on", row.first_contact_on) || null,
      lostReason,
      notes: given(v, "notes", row.notes) || null,
    });
  },
  crm_assign_plot: async (v) => {
    const found = await plotOf(String(v.plot_id));
    if ("error" in found) return found;
    // The dialog offers only villas nobody has.
    if (found.clientId) return { error: "That plot already has a buyer." };
    return assignPlot(String(v.client_id), found.unitId, v.status === "sold" ? "sold" : "reserved");
  },
  crm_plot_change: async (v) => {
    const found = await recordOf(String(v.plot_id));
    if ("error" in found) return found;
    const now = await recordNow(
      "client_engagements",
      { column: "id", id: found.engagementId },
      [
        "sale_deed_status",
        "ca_status",
        "progress_stage_id",
        "design_confirmed_on",
        "permit_on",
        "working_drawing_on",
      ],
      "That plot's record is gone.",
    );
    if ("error" in now) return now;
    const row = now.row as Record<string, string | null>;

    // The chips only save a change: a check already done keeps its date, an owner already set is not re-checked.
    const flag = (key: string, column: string) =>
      key in v && (v[key] === true) !== (row[column] !== null) ? v[key] === true : undefined;
    const owner = (key: string, current: string | null) => {
      const value = patchText(v, key);
      return value === current ? undefined : value;
    };
    const money = (key: string) => (key in v ? numberOf(v, key) : undefined);

    // A misspelt bottleneck would be dropped by the save, shrinking the set unsaid.
    const bottlenecks =
      "bottlenecks" in v
        ? (text(v, "bottlenecks") ?? "")
            .split(",")
            .map((one) => one.trim())
            .filter(Boolean)
        : undefined;
    const offList = bottlenecks?.find(
      (one) => !(BOTTLENECK_VALUES as readonly string[]).includes(one),
    );
    if (offList) return { error: `"${offList}" is not a bottleneck on the list.` };
    // The screen shows a signed-on date only once the document is signed.
    for (const [dateKey, statusKey] of [
      ["sale_deed_signed_on", "sale_deed_status"],
      ["ca_signed_on", "ca_status"],
    ] as const) {
      if (text(v, dateKey) && given(v, statusKey, row[statusKey]) !== "signed") {
        return { error: "A signed-on date goes only on a signed document; mark it signed too." };
      }
    }
    const stageId = text(v, "progress_stage_id");
    if (stageId && stageId !== row.progress_stage_id) {
      const stage = await recordNow(
        "progress_stages",
        { column: "id", id: stageId },
        ["is_active"],
        "That build stage is gone.",
      );
      if ("error" in stage) return stage;
      if (stage.row.is_active === false)
        return { error: "That build stage is switched off in Masters." };
    }

    return updatePlot(found.engagementId, {
      ownerId: owner("construction_owner_id", found.constructionOwner),
      kaadalOwnerId: owner("interior_owner_id", found.interiorOwner),
      saleDeedStatus: patchText(v, "sale_deed_status") ?? undefined,
      saleDeedOriginalWith: patchText(v, "sale_deed_original_with"),
      saleDeedAck: patchText(v, "sale_deed_ack"),
      saleDeedSignedOn: patchText(v, "sale_deed_signed_on"),
      caStatus: patchText(v, "ca_status") ?? undefined,
      caOriginalWith: patchText(v, "ca_original_with"),
      caAck: patchText(v, "ca_ack"),
      caSignedOn: patchText(v, "ca_signed_on"),
      bottlenecks,
      registrationStage: patchText(v, "registration_stage") ?? undefined,
      registrationNote: patchText(v, "registration_note"),
      registrationOn: patchText(v, "registration_on"),
      progressStageId: patchText(v, "progress_stage_id"),
      designConfirmed: flag("design_confirmed", "design_confirmed_on"),
      permit: flag("permit", "permit_on"),
      workingDrawing: flag("working_drawing", "working_drawing_on"),
      kaadalStage: patchText(v, "interior_stage"),
      kaadalNote: patchText(v, "interior_note"),
      designSupport: patchText(v, "design_support"),
      details: patchText(v, "details"),
      checkInOn: patchText(v, "check_in_on"),
      plotValue: money("plot_value"),
      constructionValue: money("construction_value"),
    });
  },
  crm_milestone: async (v) => {
    const found = await recordOf(String(v.plot_id));
    if ("error" in found) return found;
    const now = await recordNow(
      "client_payment_milestones",
      { column: "id", id: String(v.milestone_id) },
      ["due_amount", "due_on", "invoice_no", "invoiced_on", "note", "engagement_id"],
      "That payment stage is gone.",
    );
    if ("error" in now) return now;
    if (now.row.engagement_id !== found.engagementId) {
      return { error: "That payment stage is on another plot." };
    }
    const row = now.row as {
      due_amount: number | null;
      due_on: string | null;
      invoice_no: string | null;
      invoiced_on: string | null;
      note: string | null;
    };
    const amount = given(v, "due_amount", row.due_amount);
    return saveMilestone(String(v.milestone_id), {
      dueAmount: amount === "" ? null : Number(amount),
      dueOn: given(v, "due_on", row.due_on) || null,
      invoiceNo: given(v, "invoice_no", row.invoice_no) || null,
      invoicedOn: given(v, "invoiced_on", row.invoiced_on) || null,
      note: row.note,
    });
  },
  crm_receipt: async (v) => {
    const found = await recordOf(String(v.plot_id));
    if ("error" in found) return found;
    const milestoneId = text(v, "milestone_id");
    if (milestoneId) {
      const stage = await recordNow(
        "client_payment_milestones",
        { column: "id", id: milestoneId },
        ["engagement_id"],
        "That payment stage is gone.",
      );
      if ("error" in stage) return stage;
      if (stage.row.engagement_id !== found.engagementId) {
        return { error: "That payment stage is on another plot." };
      }
    }
    return addReceipt({
      engagementId: found.engagementId,
      milestoneId,
      amount: Number(v.amount),
      receivedOn: text(v, "received_on") ?? todayInIndia(),
      mode: text(v, "mode") ?? "bank",
      reference: text(v, "reference"),
      note: text(v, "note"),
    });
  },
  crm_receipt_cancel: (v) => cancelReceipt(String(v.receipt_id), String(v.reason)),
  crm_action_new: async (v) => {
    const interior = v.side === "interior";
    const plotId = text(v, "plot_id");
    let engagementId: string | null = null;
    let ownerId = text(v, "owner_id");
    if (plotId) {
      const found = await recordOf(plotId);
      if ("error" in found) return found;
      engagementId = found.engagementId;
      // A step on a plot is its side's owner's, as the composer shows (0125).
      const sideOwner = interior ? found.interiorOwner : found.constructionOwner;
      if (!sideOwner) {
        return {
          error: `That plot's ${interior ? "Interior" : "Construction"} side has no owner yet; set one first.`,
        };
      }
      if (ownerId && ownerId !== sideOwner) {
        return { error: "A step on a plot is its side's owner's; change the owner on the plot." };
      }
      ownerId = sideOwner;
    } else {
      if (!ownerId) return { error: "Say who owns an action that is on no plot." };
      const refused = await teamRefused([ownerId]);
      if (refused) return refused;
    }
    return addNextStep({
      engagementId,
      action: String(v.action),
      ownerId,
      dueOn: text(v, "due_on"),
      track: interior ? "kaadal" : "sales",
    });
  },
  crm_action_change: async (v) => {
    const now = await recordNow(
      "client_actions",
      { column: "id", id: String(v.action_id) },
      ["engagement_id", "owner_id"],
      "That action is gone.",
    );
    if ("error" in now) return now;
    // An owner restated as it is changes nothing.
    const ownerGiven = "owner_id" in v && String(v.owner_id) !== now.row.owner_id;
    let engagementId: string | null | undefined;
    if ("plot_id" in v) {
      const plotId = text(v, "plot_id");
      if (plotId) {
        const found = await recordOf(plotId);
        if ("error" in found) return found;
        engagementId = found.engagementId;
      } else {
        engagementId = null;
      }
    }
    const onPlot = engagementId !== undefined ? engagementId : now.row.engagement_id;
    if (ownerGiven && onPlot) {
      return { error: "A step on a plot is its side's owner's; change the owner on the plot." };
    }
    return updateNextStep(String(v.action_id), {
      action: "action" in v ? String(v.action) : undefined,
      ownerId: ownerGiven ? String(v.owner_id) : undefined,
      dueOn: "due_on" in v ? text(v, "due_on") : undefined,
      status: "status" in v ? String(v.status) : undefined,
      track: "side" in v ? (v.side === "interior" ? "kaadal" : "sales") : undefined,
      notes: patchText(v, "notes"),
      engagementId,
    });
  },
  crm_action_delete: (v) => deleteNextStep(String(v.action_id)),
  crm_action_cancel: async (v) => {
    const now = await recordNow(
      "client_actions",
      { column: "id", id: String(v.action_id) },
      ["created_by", "owner_id", "status", "created_at", "updated_at"],
      "That action is gone.",
    );
    if ("error" in now) return now;
    const row = now.row as Record<string, string>;
    // As on screen: one nobody has changed is deleted, not cancelled; a closed one neither.
    const way = actionRemoval(
      {
        createdBy: row.created_by,
        ownerId: row.owner_id,
        status: row.status,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      },
      { id: "", isManager: true },
    );
    if (way === null) return { error: "That action is already closed." };
    if (way === "delete")
      return {
        error:
          "Nobody has changed that action since it was added, so it is deleted instead (crm_action_delete).",
      };
    return cancelNextStep(String(v.action_id), String(v.reason));
  },
};
