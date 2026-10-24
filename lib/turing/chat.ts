import "server-only";

import Anthropic from "@anthropic-ai/sdk";

import { createClient } from "@/lib/supabase/server";
import { fetchAll } from "@/lib/supabase/fetch-all";

import { anthropicClient, MODEL, SYSTEM_PROMPT, TURING_TOOLS } from "./claude";
import { claudeFailure, CUT_OFF, NO_KEY, REFUSED, TOO_MANY_STEPS } from "./errors";
import { runTool } from "./tools";

type MessageParam = Anthropic.Beta.Messages.BetaMessageParam;
type ContentParam = Anthropic.Beta.Messages.BetaContentBlockParam;
type Message = Anthropic.Beta.Messages.BetaMessage;

export type TuringEvent =
  | { type: "conversation"; id: string }
  | { type: "text"; text: string }
  | { type: "status"; label: string }
  | { type: "page"; id: string; title: string }
  | { type: "error"; message: string }
  | { type: "done" };

/** Enough for any one question; a loop past it is stuck, not thorough. */
const MAX_STEPS = 24;

function statusFor(name: string, input: unknown): string {
  const table = (input as { table?: unknown } | null)?.table;
  const what = typeof table === "string" ? table.replace(/_/g, " ") : "the toolbox";
  switch (name) {
    case "read_rows":
    case "fetch_rows":
      return `Reading ${what}…`;
    case "make_page":
      return "Building the page…";
    case "code_execution":
      return "Working it out in code…";
    default:
      return "Looking through the toolbox…";
  }
}

async function loadHistory(conversationId: string): Promise<MessageParam[]> {
  const supabase = await createClient();
  const rows = await fetchAll((from, to) =>
    supabase
      .from("turing_messages")
      .select("id, role, content")
      .eq("conversation_id", conversationId)
      .order("id")
      .range(from, to),
  );
  return rows.map((row): MessageParam => ({
    role: row.role === "assistant" ? "assistant" : "user",
    content: row.content as unknown as ContentParam[],
  }));
}

async function saveMessage(
  conversationId: string,
  message: MessageParam,
  usage?: Message["usage"],
): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.from("turing_messages").insert({
    conversation_id: conversationId,
    role: message.role,
    content: message.content as never,
    input_tokens: usage?.input_tokens ?? null,
    output_tokens: usage?.output_tokens ?? null,
    cache_read_tokens: usage?.cache_read_input_tokens ?? null,
    cache_write_tokens: usage?.cache_creation_input_tokens ?? null,
  });
  if (error) {
    console.error("turing: message save failed:", error);
    throw new Error("Could not save the conversation.", { cause: error });
  }
}

/** A turn stopped mid-tool (the admin left, or the answer was cut) is closed before the next one. */
function unanswered(history: MessageParam[]): ContentParam[] {
  const last = history.at(-1);
  if (!last || last.role !== "assistant" || typeof last.content === "string") return [];
  return last.content
    .filter(
      (block): block is Anthropic.Beta.Messages.BetaToolUseBlockParam => block.type === "tool_use",
    )
    .map((block) => ({
      type: "tool_result" as const,
      tool_use_id: block.id,
      is_error: true,
      content: "Stopped before this ran.",
    }));
}

/**
 * One admin turn: the message is saved, then Claude answers, calling tools until it is done.
 * Every message is saved as it lands, append-only, so the conversation replays exactly.
 */
export async function* converse({
  conversationId,
  container,
  userContent,
  signal,
}: {
  conversationId: string;
  container: { id: string; expiresAt: string } | null;
  userContent: ContentParam[];
  signal: AbortSignal;
}): AsyncGenerator<TuringEvent> {
  const client = anthropicClient();
  if (!client) {
    yield { type: "error", message: NO_KEY };
    return;
  }

  const history = await loadHistory(conversationId);
  const closing = unanswered(history);
  if (closing.length > 0) {
    const close: MessageParam = { role: "user", content: closing };
    await saveMessage(conversationId, close);
    history.push(close);
  }
  const ask: MessageParam = { role: "user", content: userContent };
  await saveMessage(conversationId, ask);
  history.push(ask);

  let containerId =
    container && Date.parse(container.expiresAt) > Date.now() + 30_000 ? container.id : null;
  let jsonRetries = 0;

  for (let step = 0; step < MAX_STEPS; step++) {
    let message: Message;
    try {
      const stream = client.beta.messages.stream(
        {
          model: MODEL,
          max_tokens: 64000,
          system: SYSTEM_PROMPT,
          tools: TURING_TOOLS,
          messages: history,
          output_config: { effort: "medium" },
          cache_control: { type: "ephemeral" },
          ...(containerId ? { container: containerId } : {}),
          betas: ["server-side-fallback-2026-07-01"],
          fallbacks: "default",
        },
        { signal },
      );
      for await (const event of stream) {
        if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
          yield { type: "text", text: event.delta.text };
        } else if (
          event.type === "content_block_start" &&
          (event.content_block.type === "tool_use" ||
            event.content_block.type === "server_tool_use")
        ) {
          yield { type: "status", label: statusFor(event.content_block.name, null) };
        }
      }
      message = await stream.finalMessage();
      jsonRetries = 0;
    } catch (error) {
      if (signal.aborted) return;
      if (error instanceof Anthropic.APIError) {
        console.error("turing: Claude failed:", error.status, error.message);
        yield {
          type: "error",
          message: claudeFailure(error.status, (error as { type?: string }).type),
        };
        return;
      }
      // A streamed tool input that never parsed: nothing was saved, so the turn is asked again.
      if (jsonRetries++ < 2) {
        console.error("turing: unreadable tool input, asking again:", error);
        continue;
      }
      throw error;
    }

    const answer: MessageParam = { role: "assistant", content: message.content as ContentParam[] };
    await saveMessage(conversationId, answer, message.usage);
    history.push(answer);

    if (message.container) {
      containerId = message.container.id;
      const supabase = await createClient();
      const { error } = await supabase
        .from("turing_conversations")
        .update({
          container_id: message.container.id,
          container_expires_at: message.container.expires_at,
        })
        .eq("id", conversationId);
      if (error) console.error("turing: container not kept:", error);
    }

    const calls = message.content.filter(
      (block): block is Anthropic.Beta.Messages.BetaToolUseBlock => block.type === "tool_use",
    );
    if (message.stop_reason === "refusal") {
      yield { type: "error", message: REFUSED };
      break;
    }
    if (message.stop_reason === "max_tokens") {
      yield { type: "error", message: CUT_OFF };
      break;
    }
    if (message.stop_reason === "pause_turn") continue;
    if (message.stop_reason !== "tool_use" || calls.length === 0) break;

    const results: ContentParam[] = [];
    for (const call of calls) {
      yield { type: "status", label: statusFor(call.name, call.input) };
      const outcome = await runTool(call.name, call.input, conversationId);
      if (outcome.page) yield { type: "page", ...outcome.page };
      results.push({
        type: "tool_result",
        tool_use_id: call.id,
        content: outcome.content,
        ...(outcome.isError ? { is_error: true } : {}),
      });
    }
    const reply: MessageParam = { role: "user", content: results };
    await saveMessage(conversationId, reply);
    history.push(reply);

    if (step === MAX_STEPS - 1) yield { type: "error", message: TOO_MANY_STEPS };
  }

  yield { type: "done" };
}
