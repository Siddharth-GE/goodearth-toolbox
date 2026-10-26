/** Reporter's saved reports and Dexter's projects and decks: their names, links and deletes. */
import type { Field, Value } from "../catalogue-fields";
import { defineEntries } from "./define";

const report: Field = {
  key: "report_id",
  label: "Report",
  kind: "id",
  table: "reports",
  record: true,
};
const project: Field = {
  key: "project_id",
  label: "Project",
  kind: "id",
  table: "dexter_projects",
  record: true,
};
const deck: Field = {
  key: "deck_id",
  label: "Deck",
  kind: "id",
  table: "dexter_decks",
  record: true,
};

const anyOf =
  (keys: string[], ask: string) =>
  (values: Record<string, Value>): string | undefined =>
    keys.some((key) => key in values) ? undefined : ask;

export const REPORTER_DEXTER = defineEntries([
  {
    key: "report_change",
    tool: "/reporter",
    title: "A saved report, renamed",
    description:
      "A saved report's name or description (empty clears the description). What it shows stays on Reporter's own builder.",
    form: { file: "lib/reporter/actions.ts", reader: "readName" },
    check: anyOf(["name", "description"], "Say what changes: the name or the description."),
    fields: [
      report,
      { key: "name", label: "Name", kind: "text", optional: true, keep: true, max: 120 },
      { key: "description", label: "Description", kind: "text", optional: true, max: 300 },
    ],
  },
  {
    key: "report_delete",
    tool: "/reporter",
    title: "A saved report, deleted",
    description: "Deletes a saved report; the data it read is untouched.",
    fields: [report],
  },
  {
    key: "dexter_project_new",
    tool: "/dexter",
    title: "A Dexter project, added",
    description:
      "A folder for a pitch's decks, by a name no other project has, and optionally the client's name. Decks are uploaded on Dexter's own screen.",
    adds: true,
    form: { file: "lib/dexter/actions.ts", reader: "createProject" },
    fields: [
      { key: "name", label: "Name", kind: "text", max: 120 },
      { key: "client_name", label: "Client", kind: "text", optional: true, max: 120 },
    ],
  },
  {
    key: "dexter_project_change",
    tool: "/dexter",
    title: "A Dexter project, renamed",
    description: "A project's name or client's name (empty clears the client).",
    check: anyOf(["name", "client_name"], "Say what changes: the name or the client."),
    fields: [
      project,
      { key: "name", label: "Name", kind: "text", optional: true, keep: true, max: 120 },
      { key: "client_name", label: "Client", kind: "text", optional: true, max: 120 },
    ],
  },
  {
    key: "dexter_project_delete",
    tool: "/dexter",
    title: "A Dexter project, deleted",
    description: "Deletes a project with no decks left in it.",
    fields: [project],
  },
  {
    key: "dexter_deck_rename",
    tool: "/dexter",
    title: "A Dexter deck, renamed",
    description: "A deck's title. Its link stays the same.",
    fields: [deck, { key: "title", label: "Title", kind: "text", max: 120 }],
  },
  {
    key: "dexter_deck_link",
    tool: "/dexter",
    title: "A Dexter deck's link, on or off",
    description:
      "Switches a deck's client link off (the link stops opening) or back on (the same link opens again).",
    fields: [deck, { key: "link_on", label: "Link on", kind: "yesno" }],
  },
  {
    key: "dexter_deck_new_link",
    tool: "/dexter",
    title: "A Dexter deck, given a new link",
    description:
      "Makes a new client link for a deck: the old one stops working at once, so whoever has it needs the new one.",
    fields: [deck],
  },
  {
    key: "dexter_deck_clear_answers",
    tool: "/dexter",
    title: "A Dexter deck's answers, cleared",
    description:
      "Clears every answer the client saved or sent on a deck; their page opens blank. It cannot be undone.",
    fields: [deck],
  },
  {
    key: "dexter_deck_delete",
    tool: "/dexter",
    title: "A Dexter deck, deleted",
    description: "Deletes a deck, its files and its answers; its link stops working.",
    fields: [deck],
  },
]);
