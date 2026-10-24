/** A conversation as the admin sees it: what they asked, what Turing answered, the pages it made. Pure. */

export type StoredMessage = { role: string; content: unknown };

export type Turn =
  | { role: "user"; text: string; files: string[] }
  | { role: "assistant"; text: string; pages: { id: string; title: string }[] };

/** Each admin turn starts with a line the server adds (date, who); it is not theirs to read back. */
export const CONTEXT_PREFIX = "<context>";

export const pageToken = (id: string) => `[page:${id}]`;
const PAGE_TOKEN = /\[page:([0-9a-f-]{36})\]/g;

type Block = { type?: unknown; text?: unknown; content?: unknown; source?: { file_id?: unknown } };

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

export function conversationTurns(
  messages: StoredMessage[],
  fileNames: Map<string, string>,
  pageTitles: Map<string, string>,
): Turn[] {
  const turns: Turn[] = [];
  const answering = (): Extract<Turn, { role: "assistant" }> => {
    const last = turns.at(-1);
    if (last?.role === "assistant") return last;
    const turn: Turn = { role: "assistant", text: "", pages: [] };
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
