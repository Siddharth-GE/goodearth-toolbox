/** A conversation as the admin sees it: what they asked, what Turing answered, the pages and proposals it made. Pure. */
import { checkProposal, type Row, type Value } from "./catalogue-fields";

export type StoredMessage = { role: string; content: unknown };

/** One row's outcome, with the values it was saved with (the admin may have changed Claude's). */
export type SaveResult = {
  row: number;
  ok: boolean;
  message: string;
  values?: Record<string, Value>;
};
/** A proposal saved: when Save was pressed, and each row's result once they have all run. */
export type Saved = { at: string; results: SaveResult[] | null; interrupted: boolean };

export type ShownProposal = {
  id: string;
  action: string;
  title: string;
  rows: Row[];
  saved: Saved | null;
  /** Each id the rows name, as the admin knows it. */
  names: Record<string, string>;
};

export type Turn =
  | { role: "user"; text: string; files: string[] }
  | {
      role: "assistant";
      text: string;
      pages: { id: string; title: string }[];
      proposals: ShownProposal[];
    };

/** Each admin turn starts with a line the server adds (date, who); it is not theirs to read back. */
export const CONTEXT_PREFIX = "<context>";

export const pageToken = (id: string) => `[page:${id}]`;
const PAGE_TOKEN = /\[page:([0-9a-f-]{36})\]/g;

export const proposalToken = (id: string) => `[proposal:${id}]`;

type Block = {
  type?: unknown;
  text?: unknown;
  content?: unknown;
  source?: { file_id?: unknown };
  id?: unknown;
  name?: unknown;
  input?: unknown;
  tool_use_id?: unknown;
  is_error?: unknown;
};

const blocksOf = (content: unknown): Block[] =>
  Array.isArray(content)
    ? (content.filter((b) => typeof b === "object" && b !== null) as Block[])
    : [];

const textOf = (content: unknown): string =>
  typeof content === "string"
    ? content
    : blocksOf(content)
        .map((block) => (typeof block.text === "string" ? block.text : ""))
        .join("");

/**
 * Every proposal Turing showed in a conversation, by its call id: a propose_changes call whose
 * result was not an error. What the Save action trusts, so it never takes rows from the screen alone.
 */
export function shownProposals(
  messages: StoredMessage[],
): Map<string, Omit<ShownProposal, "saved" | "names">> {
  const calls = new Map<string, unknown>();
  const shown = new Map<string, Omit<ShownProposal, "saved" | "names">>();
  for (const message of messages) {
    for (const block of blocksOf(message.content)) {
      if (
        message.role === "assistant" &&
        block.type === "tool_use" &&
        block.name === "propose_changes"
      ) {
        calls.set(String(block.id), block.input);
        continue;
      }
      const id = String(block.tool_use_id);
      if (
        message.role === "user" &&
        block.type === "tool_result" &&
        block.is_error !== true &&
        calls.has(id) &&
        textOf(block.content).includes(proposalToken(id))
      ) {
        const proposal = checkProposal(calls.get(id));
        if (proposal.ok) {
          const { entry, title, rows } = proposal.value;
          shown.set(id, { id, action: entry.key, title, rows });
        }
      }
    }
  }
  return shown;
}

export function conversationTurns(
  messages: StoredMessage[],
  fileNames: Map<string, string>,
  pageTitles: Map<string, string>,
  saves: Map<string, Saved> = new Map(),
  names: Record<string, string> = {},
): Turn[] {
  const turns: Turn[] = [];
  const proposals = shownProposals(messages);
  const answering = (): Extract<Turn, { role: "assistant" }> => {
    const last = turns.at(-1);
    if (last?.role === "assistant") return last;
    const turn: Turn = { role: "assistant", text: "", pages: [], proposals: [] };
    turns.push(turn);
    return turn;
  };

  for (const message of messages) {
    const blocks = blocksOf(message.content);
    if (message.role === "assistant") {
      const text = blocks
        .filter((block) => block.type === "text" && typeof block.text === "string")
        .map((block) => block.text as string)
        .join("");
      if (text) {
        const turn = answering();
        turn.text = turn.text ? `${turn.text}\n\n${text}` : text;
      }
      continue;
    }

    const results = blocks.filter((block) => block.type === "tool_result");
    for (const result of results) {
      for (const match of textOf(result.content).matchAll(PAGE_TOKEN)) {
        const title = pageTitles.get(match[1]);
        // A page since deleted leaves no link behind.
        if (title !== undefined) answering().pages.push({ id: match[1], title });
      }
      const proposal = proposals.get(String(result.tool_use_id));
      if (proposal) {
        answering().proposals.push({ ...proposal, saved: saves.get(proposal.id) ?? null, names });
      }
    }
    if (results.length === blocks.length && blocks.length > 0) continue;

    const text = blocks
      .filter((block) => block.type === "text" && typeof block.text === "string")
      .map((block) => block.text as string)
      .filter((part) => !part.startsWith(CONTEXT_PREFIX))
      .join("\n");
    const files = blocks
      .filter((block) => (block.type === "document" || block.type === "image") && block.source)
      .map((block) => fileNames.get(String(block.source?.file_id)) ?? "A file");
    turns.push({ role: "user", text, files });
  }

  return turns;
}

/** A conversation's title from the first thing asked: one line, at most sixty characters. */
export function titleFrom(text: string): string {
  const line = text.replace(/\s+/g, " ").trim();
  if (!line) return "Files";
  return line.length > 60 ? `${line.slice(0, 57).trimEnd()}…` : line;
}
