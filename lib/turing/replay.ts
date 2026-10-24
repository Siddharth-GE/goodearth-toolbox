/**
 * What of a stored conversation is sent back to Claude: every finished exchange whole, and of an
 * unfinished one (stopped, timed out, cut off mid-tool) only the question. Patching an unfinished
 * tail can never be right — a pending call from Claude's code accepts nothing but its results,
 * and only while its sandbox lives — so it is left out, the same way on every replay. Pure.
 */

type Block = { type?: unknown; id?: unknown; tool_use_id?: unknown };
type Stored = { role: string; content: unknown };

const blocksOf = (content: unknown): Block[] =>
  Array.isArray(content)
    ? (content.filter((b) => typeof b === "object" && b !== null) as Block[])
    : [];

/** An admin's question: a user message with something other than tool results in it. */
const isQuestion = (message: Stored) =>
  message.role === "user" &&
  (typeof message.content === "string" ||
    blocksOf(message.content).some((block) => block.type !== "tool_result"));

/** Claude's last word in a turn is final when it waits on no tool of ours and no tool of its own. */
function isFinal(message: Stored): boolean {
  if (message.role !== "assistant") return false;
  const blocks = blocksOf(message.content);
  if (blocks.some((block) => block.type === "tool_use")) return false;
  const answered = new Set(
    blocks.filter((block) => block.tool_use_id !== undefined).map((block) => block.tool_use_id),
  );
  return !blocks.some((block) => block.type === "server_tool_use" && !answered.has(block.id));
}

export function replayable<T extends Stored>(messages: T[]): T[] {
  const kept: T[] = [];
  let turn: T[] = [];
  const close = () => {
    if (turn.length === 0) return;
    kept.push(...(turn.length > 1 && isFinal(turn[turn.length - 1]) ? turn : turn.slice(0, 1)));
    turn = [];
  };
  for (const message of messages) {
    if (isQuestion(message)) close();
    if (turn.length > 0 || isQuestion(message)) turn.push(message);
  }
  close();
  return kept;
}
