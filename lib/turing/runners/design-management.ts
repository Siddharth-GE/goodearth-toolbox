import "server-only";

import {
  addDesignAction,
  addStepPerson,
  cancelDesignAction,
  deleteDesignAction,
  passStep,
  removeStepPerson,
  setStepNote,
  setStepStatus,
  setWhereItIs,
  startStep,
  updateDesignAction,
} from "@/lib/design-management/board-actions";
import {
  setDraftDrawingsLink,
  setDraftRevisionNumber,
  setDrawingRevisionWorks,
  updateDraftRevisionNote,
} from "@/lib/design-management/revision-actions";
import {
  addDesignStage,
  renameDesignStage,
  reorderDesignStages,
  setDesignStageActive,
  setDesignStageCode,
  setDesignStageOnBoard,
} from "@/lib/design-management/stage-actions";
import {
  deleteDraftTransmittal,
  issueTransmittal,
  setDraftTransmittalNote,
  startTransmittal,
} from "@/lib/design-management/transmittal-actions";
import type { ActionState } from "@/lib/action-state";
import { actionRemoval } from "@/lib/next-steps/rules";
import { fetchAll } from "@/lib/supabase/fetch-all";
import { createClient } from "@/lib/supabase/server";

import { movedStage, passTargetIds, type DESIGN_MANAGEMENT } from "../entries/design-management";
import { failed, recordNow, saving, type Runners, type Values } from "./kit";

type Key = (typeof DESIGN_MANAGEMENT)[number]["key"];
type Failure = { error: string };
type Refusal = Failure | null;

const text = (values: Values, key: string) =>
  typeof values[key] === "string" && values[key] ? String(values[key]).trim() : null;

/** People on a stage and owners of actions hold Design Management: design_team(), as every picker offers. */
async function teamRefused(ids: (string | null)[]): Promise<Refusal> {
  const asked = ids.filter((id): id is string => Boolean(id));
  if (asked.length === 0) return null;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("design_team");
  if (error) return failed("design_team", error);
  const team = new Set((data ?? []).map((row) => row.id));
  return asked.every((id) => team.has(id))
    ? null
    : { error: "That person does not hold Design Management." };
}

const twice = (ids: string[]): Refusal =>
  new Set(ids).size < ids.length
    ? { error: "One person is named twice; give them one row." }
    : null;

type Stage = { id: string; on_board: boolean; is_active: boolean };

/** The stage list in the order the screens show it, every stage. */
async function stagesInOrder(): Promise<Stage[] | Failure> {
  const supabase = await createClient();
  try {
    return await fetchAll<Stage>((from, to) =>
      supabase
        .from("design_stages")
        .select("id, on_board, is_active")
        .order("sort_order")
        .order("name")
        .order("id")
        .range(from, to),
    );
  } catch (error) {
    return failed("design_stages", error);
  }
}

/** The board's columns: stages on the board and in use, in order. */
async function boardIds(): Promise<string[] | Failure> {
  const stages = await stagesInOrder();
  if ("error" in stages) return stages;
  return stages.filter((stage) => stage.on_board && stage.is_active).map((stage) => stage.id);
}

const offBoard = (board: string[], stageId: string): Refusal =>
  board.includes(stageId) ? null : { error: "That stage is not on the design board." };

type Step = { id: string; design_stage_id: string; status: string };

/** A villa's steps, one per board stage it has ever touched. */
async function stepsOf(unitId: string): Promise<Step[] | Failure> {
  const supabase = await createClient();
  try {
    return await fetchAll<Step>((from, to) =>
      supabase
        .from("design_steps")
        .select("id, design_stage_id, status")
        .eq("unit_id", unitId)
        .order("id")
        .range(from, to),
    );
  } catch (error) {
    return failed("design_steps", error);
  }
}

const startedIds = (steps: Step[]) =>
  new Set(
    steps.filter((step) => step.status !== "not_started").map((step) => step.design_stage_id),
  );

/** The villa page shows a stage's status, note and people only once it has started, and only for board stages. */
async function startedStep(unitId: string, stageId: string): Promise<Step | Failure> {
  const [board, steps] = await Promise.all([boardIds(), stepsOf(unitId)]);
  if ("error" in board) return board;
  if ("error" in steps) return steps;
  const refused = offBoard(board, stageId);
  if (refused) return refused;
  const step = steps.find((one) => one.design_stage_id === stageId);
  return step && step.status !== "not_started"
    ? step
    : { error: "That stage has not started on this villa; start it first (design_stage_start)." };
}

const peopleOf = (lines: Values[]) => lines.map((line) => String(line.person_id));

/** A transmittal still a draft: what went to site never changes. */
async function stillDraft(transmittalId: string): Promise<Refusal> {
  const header = await recordNow(
    "transmittals",
    { column: "id", id: transmittalId },
    ["status"],
    "That transmittal is gone.",
  );
  if ("error" in header) return header;
  if (header.row.status !== "draft") {
    return { error: "That transmittal is issued; what went to site never changes." };
  }
  return null;
}

type Draft = { revisionId: string; revisionNo: number; link: string | null };

/** A draft transmittal's drawing revision, still a draft, which its number, what changed, link and works belong to. */
async function draftOf(transmittalId: string): Promise<Draft | Failure> {
  const refused = await stillDraft(transmittalId);
  if (refused) return refused;
  const line = await recordNow(
    "transmittal_lines",
    { column: "transmittal_id", id: transmittalId },
    ["drawing_revision_id"],
    "That transmittal carries no drawing set.",
  );
  if ("error" in line) return line;
  const revisionId = String(line.row.drawing_revision_id);
  const revision = await recordNow(
    "drawing_revisions",
    { column: "id", id: revisionId },
    ["status", "revision_no", "drawings_url"],
    "That transmittal's drawings are gone.",
  );
  if ("error" in revision) return revision;
  // The page shows no editor for one already released: its saves would match nothing and still say done.
  if (revision.row.status !== "draft") {
    return {
      error:
        "That transmittal's drawings have already gone to site; delete this draft and start a new transmittal.",
    };
  }
  return {
    revisionId,
    revisionNo: Number(revision.row.revision_no),
    link: (revision.row.drawings_url as string | null) ?? null,
  };
}

/** Several saves for one row, in order: one that refuses after others stood says what already saved. */
async function inTurn(steps: [string, () => Promise<ActionState>][]): Promise<ActionState> {
  const done: string[] = [];
  for (const [what, call] of steps) {
    const result = await call();
    if (result?.error) {
      return {
        error:
          done.length > 0 ? `${done.join(" and ")} saved, then: ${result.error}` : result.error,
      };
    }
    done.push(what);
  }
  return undefined;
}

/** at_start, after another stage, or (for a new stage) the end. */
async function placeOf(values: Values, stageId?: string): Promise<string | Failure> {
  if (values.at_start === true) return "start";
  const after = text(values, "after_stage_id");
  if (!after) return "end";
  if (after === stageId) return { error: "A stage cannot go after itself." };
  const found = await recordNow(
    "design_stages",
    { column: "id", id: after },
    ["id"],
    "The stage it follows is gone.",
  );
  return "error" in found ? found : after;
}

export const DESIGN_MANAGEMENT_RUNNERS: Runners<Key> = {
  design_stage_start: {
    lines: async (header, lines) => {
      const unitId = String(header.unit_id);
      const stageId = String(header.stage_id);
      const [board, steps] = await Promise.all([boardIds(), stepsOf(unitId)]);
      if ("error" in board) return board;
      if ("error" in steps) return steps;
      const people = peopleOf(lines);
      const refused =
        offBoard(board, stageId) ??
        (startedIds(steps).has(stageId)
          ? { error: "That stage has already started on this villa; put people on it instead." }
          : null) ??
        twice(people) ??
        (await teamRefused(people));
      if (refused) return refused;
      return startStep(unitId, stageId, people);
    },
  },
  design_pass: {
    lines: async (header, lines) => {
      const unitId = String(header.unit_id);
      const fromId = String(header.from_stage_id);
      const toId = String(header.to_stage_id);
      const [board, steps] = await Promise.all([boardIds(), stepsOf(unitId)]);
      if ("error" in board) return board;
      if ("error" in steps) return steps;
      const people = peopleOf(lines);
      const targets = passTargetIds(board, startedIds(steps), fromId);
      const refused =
        offBoard(board, fromId) ??
        offBoard(board, toId) ??
        (targets.length === 0
          ? { error: "Only the stage the villa sits at (the furthest started) passes on." }
          : null) ??
        (targets.includes(toId) ? null : { error: "It passes on only to a later board stage." }) ??
        twice(people) ??
        (await teamRefused(people));
      if (refused) return refused;
      return passStep({
        unitId,
        fromStageId: fromId,
        toStageId: toId,
        peopleIds: people,
        note: text(header, "note") ?? "",
      });
    },
  },
  design_set_where: {
    lines: async (header, lines) => {
      const unitId = String(header.unit_id);
      const stageId = String(header.stage_id);
      const [board, steps] = await Promise.all([boardIds(), stepsOf(unitId)]);
      if ("error" in board) return board;
      if ("error" in steps) return steps;
      const people = peopleOf(lines);
      const refused =
        offBoard(board, stageId) ??
        (startedIds(steps).size > 0
          ? { error: "This villa has already started; move its stages one by one." }
          : null) ??
        twice(people) ??
        (await teamRefused(people));
      if (refused) return refused;
      return setWhereItIs(unitId, stageId, people);
    },
  },
  design_step_status: async (v) => {
    const step = await startedStep(String(v.unit_id), String(v.stage_id));
    if ("error" in step) return step;
    return setStepStatus(
      String(v.unit_id),
      String(v.stage_id),
      String(v.status),
      text(v, "reason") ?? undefined,
    );
  },
  design_step_note: async (v) => {
    const step = await startedStep(String(v.unit_id), String(v.stage_id));
    if ("error" in step) return step;
    return setStepNote(step.id, text(v, "note") ?? "");
  },
  design_person_on: async (v) => {
    const step = await startedStep(String(v.unit_id), String(v.stage_id));
    if ("error" in step) return step;
    const refused = await teamRefused([String(v.person_id)]);
    if (refused) return refused;
    return addStepPerson(step.id, String(v.person_id));
  },
  design_person_off: async (v) => {
    const step = await startedStep(String(v.unit_id), String(v.stage_id));
    if ("error" in step) return step;
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("design_step_people")
      .select("id")
      .eq("step_id", step.id)
      .eq("profile_id", String(v.person_id))
      .maybeSingle();
    if (error) return failed("design_step_people", error);
    // The delete would otherwise take nobody off and still say done.
    if (!data) return { error: "They are not on that stage." };
    return removeStepPerson(step.id, String(v.person_id));
  },
  design_action_new: async (v) => {
    const stageId = text(v, "stage_id");
    if (stageId) {
      const board = await boardIds();
      if ("error" in board) return board;
      const refused = offBoard(board, stageId);
      if (refused) return refused;
    }
    const refused = await teamRefused([String(v.owner_id)]);
    if (refused) return refused;
    return addDesignAction({
      unitId: text(v, "unit_id"),
      stageId,
      action: String(v.action),
      ownerId: String(v.owner_id),
      dueOn: text(v, "due_on"),
    });
  },
  design_action_change: async (v) => {
    const now = await recordNow(
      "design_actions",
      { column: "id", id: String(v.action_id) },
      ["owner_id", "design_stage_id"],
      "That action is gone.",
    );
    if ("error" in now) return now;
    // An owner or stage restated as it is changes nothing, so it is not checked again.
    const ownerId = "owner_id" in v && v.owner_id !== now.row.owner_id ? String(v.owner_id) : null;
    const stageId = text(v, "stage_id");
    if (stageId && stageId !== now.row.design_stage_id) {
      const board = await boardIds();
      if ("error" in board) return board;
      const refused = offBoard(board, stageId);
      if (refused) return refused;
    }
    const refused = await teamRefused([ownerId]);
    if (refused) return refused;
    return updateDesignAction(String(v.action_id), {
      action: "action" in v ? String(v.action) : undefined,
      ownerId: ownerId ?? undefined,
      dueOn: "due_on" in v ? text(v, "due_on") : undefined,
      status: "status" in v ? String(v.status) : undefined,
      notes: "notes" in v ? text(v, "notes") : undefined,
      unitId: "unit_id" in v ? text(v, "unit_id") : undefined,
      stageId: "stage_id" in v ? stageId : undefined,
    });
  },
  design_action_delete: (v) => deleteDesignAction(String(v.action_id)),
  design_action_cancel: async (v) => {
    const now = await recordNow(
      "design_actions",
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
          "Nobody has changed that action since it was added, so it is deleted instead (design_action_delete).",
      };
    return cancelDesignAction(String(v.action_id), String(v.reason));
  },
  design_stage_new: async (v) => {
    const after = await placeOf(v);
    if (typeof after !== "string") return after;
    const form = new FormData();
    form.set("name", String(v.name));
    form.set("after", after);
    return addDesignStage(undefined, form);
  },
  design_stage_change: async (v) => {
    const id = String(v.stage_id);
    const now = await recordNow(
      "design_stages",
      { column: "id", id },
      ["name", "code", "is_active", "on_board"],
      "That stage is gone.",
    );
    if ("error" in now) return now;
    const steps: [string, () => Promise<ActionState>][] = [];
    if ("name" in v && v.name !== now.row.name)
      steps.push(["The name", () => renameDesignStage(id, String(v.name))]);
    if ("code" in v && String(v.code).toUpperCase() !== now.row.code)
      steps.push(["The code", () => setDesignStageCode(id, String(v.code))]);
    if ("is_active" in v && v.is_active !== now.row.is_active)
      steps.push(["In use", () => setDesignStageActive(id, v.is_active === true)]);
    if ("on_board" in v && v.on_board !== now.row.on_board) {
      // The board switch is off for a retired stage.
      const inUse = "is_active" in v ? v.is_active === true : now.row.is_active === true;
      if (!inUse)
        return { error: "A retired stage goes on or off the board only once it is in use." };
      steps.push(["On the board", () => setDesignStageOnBoard(id, v.on_board === true)]);
    }
    return inTurn(steps);
  },
  design_stage_move: async (v) => {
    const id = String(v.stage_id);
    const after = await placeOf(v, id);
    if (typeof after !== "string") return after;
    const stages = await stagesInOrder();
    if ("error" in stages) return stages;
    const ids = stages.map((stage) => stage.id);
    if (!ids.includes(id)) return { error: "That stage is gone." };
    return reorderDesignStages(movedStage(ids, id, after === "start" ? null : after));
  },
  design_transmittal_new: async (v) => {
    const unitId = String(v.unit_id);
    const stageId = String(v.stage_id);
    const setId = text(v, "set_id");
    if (setId) {
      // The dialog offers only the villa's own sets: one a revision of it lives on.
      const supabase = await createClient();
      const { data, error } = await supabase
        .from("drawing_revisions")
        .select("id")
        .eq("unit_id", unitId)
        .eq("drawing_set_id", setId)
        .limit(1);
      if (error) return failed("drawing_revisions", error);
      if (!data?.length) return { error: "That drawing set is not one of this villa's." };
    }
    const done = await saving(
      () =>
        startTransmittal(unitId, stageId, setId ? { setId } : { newSetName: String(v.set_name) }),
      "/design-management/transmittals/",
    );
    return "error" in done ? done : { saved: "a draft" };
  },
  design_transmittal_change: async (v) => {
    const transmittalId = String(v.transmittal_id);
    const steps: [string, () => Promise<ActionState>][] = [];
    // The note is the transmittal's own, so it changes on any draft, even one with no drawing set.
    if (["revision_no", "what_changed", "drawings_url"].some((key) => key in v)) {
      const draft = await draftOf(transmittalId);
      if ("error" in draft) return draft;
      if ("revision_no" in v && Number(v.revision_no) !== draft.revisionNo)
        steps.push([
          "The revision number",
          () => setDraftRevisionNumber(draft.revisionId, Number(v.revision_no)),
        ]);
      if ("what_changed" in v)
        steps.push([
          "What changed",
          () => updateDraftRevisionNote(draft.revisionId, String(v.what_changed)),
        ]);
      if ("drawings_url" in v && (text(v, "drawings_url") ?? null) !== draft.link)
        steps.push([
          "The link",
          () => setDraftDrawingsLink(draft.revisionId, String(v.drawings_url)),
        ]);
    } else {
      const refused = await stillDraft(transmittalId);
      if (refused) return refused;
    }
    if ("note" in v)
      steps.unshift(["The note", () => setDraftTransmittalNote(transmittalId, String(v.note))]);
    return inTurn(steps);
  },
  design_transmittal_works: {
    lines: async (header, lines) => {
      const draft = await draftOf(String(header.transmittal_id));
      if ("error" in draft) return draft;
      const works = lines.map((line) => String(line.work_item_id));
      if (new Set(works).size < works.length)
        return { error: "One work is named twice; give it one row." };
      return setDrawingRevisionWorks(draft.revisionId, works);
    },
  },
  design_transmittal_issue: async (v) => {
    const transmittalId = String(v.transmittal_id);
    const refused = await stillDraft(transmittalId);
    if (refused) return refused;
    const done = await saving(
      () => issueTransmittal(transmittalId),
      `/design-management/transmittals/${transmittalId}`,
    );
    if ("error" in done) return done;
    const number = done.path
      ? new URL(done.path, "https://toolbox.invalid").searchParams.get("issued")
      : null;
    return number ? { saved: number } : undefined;
  },
  design_transmittal_delete: async (v) => {
    const transmittalId = String(v.transmittal_id);
    const refused = await stillDraft(transmittalId);
    if (refused) return refused;
    const done = await saving(
      () => deleteDraftTransmittal(transmittalId),
      "/design-management/villas",
    );
    return "error" in done ? done : undefined;
  },
};
