import "server-only";

import {
  addDirectLines,
  cancelIndent,
  createIndent,
  deleteIndent,
  removeLine,
  submitIndent,
  updateIndentHeader,
  updateLine,
} from "@/lib/indents/actions";
import { createClient } from "@/lib/supabase/server";

import type { INDENTS } from "../entries/indents";
import { idFrom } from "../redirects";
import { failed, given, recordNow, saving, type RunResult, type Runners, type Values } from "./kit";

type Key = (typeof INDENTS)[number]["key"];

const text = (values: Values, key: string) =>
  typeof values[key] === "string" && values[key] ? String(values[key]) : null;

/** The indent's number, for the result line; the id if it can't be read. */
async function referenceOf(indentId: string): Promise<string> {
  const now = await recordNow("indents", { column: "id", id: indentId }, ["reference"], null);
  return "row" in now && now.row.reference ? String(now.row.reference) : "the indent";
}

/**
 * Lines onto a draft indent through the screen's own add, which files each item on or off the
 * villa's official estimate; then the reason for each line it put outside, as the line's own save.
 */
async function addLines(indentId: string, lines: Values[]): Promise<RunResult> {
  // The same item twice is one line on the screen too: its quantities added.
  const totals = new Map<string, number>();
  for (const line of lines) {
    const itemId = String(line.item_id);
    totals.set(itemId, (totals.get(itemId) ?? 0) + Number(line.quantity));
  }
  const added = await addDirectLines(
    indentId,
    [...totals].map(([itemId, quantity]) => ({ itemId, quantity })),
  );
  if (added?.error) return added;

  const reasons = new Map(
    lines
      .filter((line) => text(line, "reason"))
      .map((line) => [String(line.item_id), text(line, "reason")]),
  );
  if (reasons.size === 0) return undefined;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("indent_lines")
    .select("id, item_id, quantity, uom, note")
    .eq("indent_id", indentId)
    .is("estimate_id", null)
    .is("budget_id", null)
    .is("construction_line_id", null)
    .in("item_id", [...reasons.keys()]);
  if (error) {
    failed("indent lines", error);
    return { error: "The lines were added, but their reasons were not. Add them on the indent." };
  }
  // A reason for an item that turned out to be on the estimate has nothing to explain.
  for (const row of data ?? []) {
    const saved = await updateLine(row.id, {
      quantity: row.quantity,
      uom: row.uom,
      note: row.note,
      reason: reasons.get(row.item_id) ?? null,
    });
    if (saved?.error)
      return { error: `The lines were added, but a reason was refused: ${saved.error}` };
  }
  return undefined;
}

export const INDENT_RUNNERS: Runners<Key> = {
  indent_new: {
    lines: async (header, lines) => {
      // As the screen does: a plot with its unit is the unit; a plot without one is the plot.
      const plotId = text(header, "plot_id");
      let unitId: string | null = null;
      if (plotId) {
        const unit = await recordNow("units", { column: "plot_id", id: plotId }, ["id"], null);
        if ("error" in unit) return unit;
        unitId = unit.row.id ? String(unit.row.id) : null;
      }
      const made = await saving(() =>
        createIndent({
          projectId: String(header.project_id),
          plotId: unitId ? null : plotId,
          unitId,
          workItemId: text(header, "work_item_id"),
          requiredBy: text(header, "required_by"),
          note: text(header, "note"),
          isUrgent: header.is_urgent === true,
        }),
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
      ["quantity", "uom", "note", "off_estimate_reason"],
      "That line is no longer on the indent.",
    );
    if ("error" in now) return now;
    const row = now.row as {
      quantity: number;
      uom: string;
      note: string | null;
      off_estimate_reason: string | null;
    };
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
    const done = await saving(() => deleteIndent(String(v.indent_id)));
    return "error" in done ? done : undefined;
  },
  indent_cancel: (v) => cancelIndent(String(v.indent_id), String(v.reason)),
};
