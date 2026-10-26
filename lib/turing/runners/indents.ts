import "server-only";

import {
  addDirectLines,
  approveIndent,
  cancelIndent,
  createIndent,
  deleteIndent,
  rejectIndent,
  removeLine,
  submitIndent,
  updateIndentHeader,
  updateLine,
} from "@/lib/indents/actions";
import { createClient } from "@/lib/supabase/server";

import type { INDENTS } from "../entries/indents";
import { idFrom } from "../redirects";
import {
  given,
  recordNow,
  saving,
  siteOf,
  unlessStatus,
  type RunResult,
  type Runners,
  type Values,
} from "./kit";

type Key = (typeof INDENTS)[number]["key"];

const text = (values: Values, key: string) =>
  typeof values[key] === "string" && values[key] ? String(values[key]) : null;

/** The indent's number, for the result line. */
async function referenceOf(indentId: string): Promise<string> {
  const now = await recordNow("indents", { column: "id", id: indentId }, ["reference"], null);
  return "row" in now && now.row.reference ? String(now.row.reference) : "the indent";
}

type Direct = { id: string; item_id: string; quantity: number; uom: string; note: string | null };

/** The indent's lines outside the estimate (and any budget) for these items: the ones a reason is for. */
async function directLines(indentId: string, itemIds: string[]): Promise<Direct[] | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("indent_lines")
    .select("id, item_id, quantity, uom, note")
    .eq("indent_id", indentId)
    .is("estimate_id", null)
    .is("budget_id", null)
    .is("construction_line_id", null)
    .in("item_id", itemIds);
  if (error) {
    console.error("turing: indent lines read failed:", error);
    return null;
  }
  return data;
}

/**
 * Lines onto a draft indent through the screen's own add, which files each item on or off the
 * villa's official estimate; then the reason for each line it put outside, as the line's own save.
 * A reason goes only on a line this add made or grew, never on one already there untouched.
 */
async function addLines(indentId: string, lines: Values[]): Promise<RunResult> {
  // The same item twice is one line on the screen too: its quantities added.
  const totals = new Map<string, number>();
  for (const line of lines) {
    const itemId = String(line.item_id);
    totals.set(itemId, (totals.get(itemId) ?? 0) + Number(line.quantity));
  }
  const reasons = new Map(
    lines
      .filter((line) => text(line, "reason"))
      .map((line) => [String(line.item_id), String(line.reason)]),
  );
  const before = reasons.size > 0 ? await directLines(indentId, [...reasons.keys()]) : [];
  if (before === null) return { error: "Could not read the indent's lines. Try again." };

  const added = await addDirectLines(
    indentId,
    [...totals].map(([itemId, quantity]) => ({ itemId, quantity })),
  );
  // The add raises quantities one line at a time, so a refusal part-way may leave some raised.
  if (added?.error) return { error: `${added.error} Check the indent before asking again.` };
  if (reasons.size === 0) return undefined;

  const after = await directLines(indentId, [...reasons.keys()]);
  if (after === null)
    return { error: "The lines were added, but not their reasons. Add them on the indent." };
  const was = new Map(before.map((line) => [line.id, line.quantity]));
  // A reason for an item the add filed on the estimate has nothing to explain.
  const targets = after.filter((line) => was.get(line.id) !== line.quantity);
  const refused: string[] = [];
  for (const line of targets) {
    const saved = await updateLine(line.id, {
      quantity: line.quantity,
      uom: line.uom,
      note: line.note,
      reason: reasons.get(line.item_id) ?? null,
    });
    if (saved?.error) refused.push(saved.error);
  }
  if (refused.length === 0) return undefined;
  return {
    error: `The lines were added, but ${refused.length} of ${targets.length} reasons were refused: ${[...new Set(refused)].join(" ")}`,
  };
}

export const INDENT_RUNNERS: Runners<Key> = {
  indent_new: {
    lines: async (header, lines) => {
      const projectId = String(header.project_id);
      const site = await siteOf(projectId, text(header, "plot_id"));
      if ("error" in site) return site;
      const workItemId = text(header, "work_item_id");
      const isUrgent = header.is_urgent === true;
      const made = await saving(
        () =>
          createIndent({
            projectId,
            ...site,
            workItemId,
            requiredBy: text(header, "required_by"),
            note: text(header, "note"),
            isUrgent,
          }),
        "/indents/",
      );
      if ("error" in made) return made;
      const id = idFrom(made.path, "/indents/");
      if (!id) {
        return {
          error:
            "The indent may have been made, but Turing could not find it. Look in Indents before asking again.",
        };
      }
      const reference = await referenceOf(id);

      // The work and the urgent mark ride a second write the create only logs when it fails.
      const kept = await recordNow(
        "indents",
        { column: "id", id },
        ["work_item_id", "is_urgent"],
        null,
      );
      if (
        "error" in kept ||
        (kept.row.work_item_id ?? null) !== workItemId ||
        Boolean(kept.row.is_urgent) !== isUrgent
      ) {
        const fixed = await updateIndentHeader(id, {
          workItemId,
          requiredBy: text(header, "required_by"),
          note: text(header, "note"),
          isUrgent,
        });
        if (fixed?.error) {
          return {
            error: `${reference} was made as a draft without its work or urgent mark: ${fixed.error}`,
          };
        }
      }

      const added = await addLines(id, lines);
      if (added && "error" in added && added.error) {
        return { error: `${reference} was made as a draft, but: ${added.error}` };
      }
      if (header.submit === true) {
        const sent = await submitIndent(id);
        if (sent?.error)
          return { error: `${reference} was made as a draft, not sent: ${sent.error}` };
      }
      return { saved: reference };
    },
  },
  indent_lines_add: {
    lines: (header, lines) => addLines(String(header.indent_id), lines),
  },
  indent_change: async (v) => {
    const now = await recordNow(
      "indents",
      { column: "id", id: String(v.indent_id) },
      ["work_item_id", "required_by", "note", "is_urgent"],
      "That indent is gone.",
    );
    if ("error" in now) return now;
    const row = now.row as {
      work_item_id: string | null;
      required_by: string | null;
      note: string | null;
      is_urgent: boolean;
    };
    return updateIndentHeader(String(v.indent_id), {
      workItemId: given(v, "work_item_id", row.work_item_id) || null,
      requiredBy: given(v, "required_by", row.required_by) || null,
      note: given(v, "note", row.note) || null,
      isUrgent: "is_urgent" in v ? v.is_urgent === true : row.is_urgent,
    });
  },
  indent_line_change: async (v) => {
    const now = await recordNow(
      "indent_lines",
      { column: "id", id: String(v.line_id) },
      [
        "quantity",
        "uom",
        "note",
        "off_estimate_reason",
        "estimate_id",
        "budget_id",
        "construction_line_id",
      ],
      "That line is no longer on the indent.",
    );
    if ("error" in now) return now;
    const row = now.row as {
      quantity: number;
      uom: string;
      note: string | null;
      off_estimate_reason: string | null;
      estimate_id: string | null;
      budget_id: string | null;
      construction_line_id: string | null;
    };
    // The line's save keeps a reason only off the estimate; elsewhere it would be dropped unsaid.
    if (text(v, "reason") && (row.estimate_id || row.budget_id || row.construction_line_id)) {
      return { error: "That line is on the estimate or a budget, so it needs no reason." };
    }
    return updateLine(String(v.line_id), {
      quantity: Number(given(v, "quantity", row.quantity)),
      uom: row.uom,
      note: given(v, "note", row.note) || null,
      reason: given(v, "reason", row.off_estimate_reason) || null,
    });
  },
  indent_line_remove: async (v) => {
    // The remove says nothing when no line matched, so a line already gone is said here.
    const now = await recordNow(
      "indent_lines",
      { column: "id", id: String(v.line_id) },
      ["indent_id"],
      "That line is no longer on the indent.",
    );
    if ("error" in now) return now;
    return removeLine(String(now.row.indent_id), String(v.line_id));
  },
  indent_submit: (v) => submitIndent(String(v.indent_id)),
  indent_delete: async (v) => {
    const done = await saving(() => deleteIndent(String(v.indent_id)), "/indents/list");
    return "error" in done ? done : undefined;
  },
  indent_cancel: (v) => cancelIndent(String(v.indent_id), String(v.reason)),
  // The screen offers both only while it waits; the actions update by id alone.
  indent_approve: async (v) =>
    (await waiting(String(v.indent_id))) ?? approveIndent(String(v.indent_id)),
  indent_send_back: async (v) =>
    (await waiting(String(v.indent_id))) ?? rejectIndent(String(v.indent_id), String(v.note)),
};

const waiting = (indentId: string) =>
  unlessStatus(
    "indents",
    indentId,
    "submitted",
    "That indent is not waiting for approval.",
    "That indent is gone.",
  );
