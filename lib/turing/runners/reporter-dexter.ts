import "server-only";

import {
  clearDeckAnswers,
  createProject,
  deleteDeck,
  deleteProject,
  reissueDeckLink,
  renameDeck,
  renameProject,
  setDeckSharing,
} from "@/lib/dexter/actions";
import { deleteReport, renameReport } from "@/lib/reporter/actions";

import { entryFor, formOf } from "../catalogue-fields";
import type { REPORTER_DEXTER } from "../entries/reporter-dexter";
import { failed, given, recordNow, type Runners } from "./kit";
import { createClient } from "@/lib/supabase/server";

const deckNow = (id: string, columns: string[]) =>
  recordNow("dexter_decks", { column: "id", id }, columns, "That deck is gone.");

/** Each Reporter and Dexter entry, run through the tool's own action, as the admin. */
export const REPORTER_DEXTER_RUNNERS: Runners<(typeof REPORTER_DEXTER)[number]["key"]> = {
  report_change: async (v) => {
    const id = String(v.report_id);
    const now = await recordNow(
      "reports",
      { column: "id", id },
      ["name", "description"],
      "That report is gone.",
    );
    if ("error" in now) return now;
    if (
      ["name", "description"].every(
        (key) => given(v, key, now.row[key] as string | null) === String(now.row[key] ?? ""),
      )
    )
      return { error: "The report already says that." };
    const entry = entryFor("report_change");
    if (!entry) return { error: "Turing does not know that change." };
    return renameReport(id, undefined, formOf(entry, v, now.row));
  },
  report_delete: async (v) => {
    const now = await recordNow(
      "reports",
      { column: "id", id: String(v.report_id) },
      ["id"],
      "That report is gone.",
    );
    if ("error" in now) return now;
    return deleteReport(String(v.report_id));
  },
  dexter_project_new: (v) => {
    const entry = entryFor("dexter_project_new");
    return createProject(undefined, entry ? formOf(entry, v) : new FormData());
  },
  dexter_project_change: async (v) => {
    const id = String(v.project_id);
    const now = await recordNow(
      "dexter_projects",
      { column: "id", id },
      ["name", "client_name"],
      "That project is gone.",
    );
    if ("error" in now) return now;
    const name = given(v, "name", now.row.name as string);
    const client = given(v, "client_name", now.row.client_name as string | null);
    if (name === now.row.name && client === String(now.row.client_name ?? ""))
      return { error: "The project already says that." };
    return renameProject(id, name, client || null);
  },
  dexter_project_delete: async (v) => {
    const id = String(v.project_id);
    const now = await recordNow(
      "dexter_projects",
      { column: "id", id },
      ["id"],
      "That project is gone.",
    );
    if ("error" in now) return now;
    return deleteProject(id);
  },
  dexter_deck_rename: async (v) => {
    const now = await deckNow(String(v.deck_id), ["title"]);
    if ("error" in now) return now;
    if (now.row.title === v.title) return { error: "That is the deck's title already." };
    return renameDeck(String(v.deck_id), String(v.title));
  },
  dexter_deck_link: async (v) => {
    const now = await deckNow(String(v.deck_id), ["share_enabled"]);
    if ("error" in now) return now;
    if (now.row.share_enabled === v.link_on)
      return { error: `The deck's link is ${v.link_on ? "on" : "off"} already.` };
    return setDeckSharing(String(v.deck_id), v.link_on === true);
  },
  dexter_deck_new_link: async (v) => {
    const now = await deckNow(String(v.deck_id), ["id"]);
    if ("error" in now) return now;
    return reissueDeckLink(String(v.deck_id));
  },
  dexter_deck_clear_answers: async (v) => {
    const id = String(v.deck_id);
    const now = await deckNow(id, ["id"]);
    if ("error" in now) return now;
    const supabase = await createClient();
    const { count, error } = await supabase
      .from("dexter_answers")
      .select("deck_id", { count: "exact", head: true })
      .eq("deck_id", id);
    if (error) return failed("dexter_answers", error);
    if (!count) return { error: "That deck has no saved answers." };
    return clearDeckAnswers(id);
  },
  dexter_deck_delete: async (v) => {
    const now = await deckNow(String(v.deck_id), ["id"]);
    if ("error" in now) return now;
    return deleteDeck(String(v.deck_id));
  },
};
