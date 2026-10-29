import "server-only";

import Anthropic from "@anthropic-ai/sdk";

import { createClient } from "@/lib/supabase/server";
import { fetchAll } from "@/lib/supabase/fetch-all";

import { anthropicClient, SYSTEM_PROMPT, TURING_TOOLS } from "./claude";
import { claudeFailure, CUT_OFF, NO_KEY, REFUSED, TOO_MANY_STEPS } from "./errors";
import { CONTEXT_PREFIX, shownProposals, type SaveResult, type ShownProposal } from "./display";
import { judge } from "./judge";
import { replayable } from "./replay";
import {
  fallsBackOnServer,
  JUDGE_MODEL,
  judgeInput,
  lastQuestion,
  MODEL_FOR,
  RESCUE_MODEL,
  type Route,
} from "./routing";
import { runTool } from "./tools";

type MessageParam = Anthropic.Beta.Messages.BetaMessageParam;
type ContentParam = Anthropic.Beta.Messages.BetaContentBlockParam;
type Message = Anthropic.Beta.Messages.BetaMessage;

/** `step` starts each of Claude's messages in a turn; `restart` drops the text of the step just begun. */
export type TuringEvent =
  | { type: "conversation"; id: string }
  | { type: "step" }
  | { type: "restart" }
  | { type: "text"; text: string }
  | { type: "status"; label: string }
  | { type: "page"; id: string; title: string }
  | { type: "proposal"; proposal: ShownProposal }
  | { type: "error"; message: string }
  | { type: "done" };

/** Enough for any one question; a loop past it is stuck, not thorough. */
const MAX_STEPS = 24;

/** Longer than any answer can run (Vercel stops one at five minutes), so a stamp this old is free. */
const TURN_LEASE_MS = 6 * 60 * 1000;

/** One answer at a time per conversation (0152); taking it also lifts the conversation up the list. */
export async function takeTurn(conversationId: string): Promise<boolean> {
  const supabase = await createClient();
  const stale = new Date(Date.now() - TURN_LEASE_MS).toISOString();
  const { data, error } = await supabase
    .from("turing_conversations")
    .update({ turn_started_at: new Date().toISOString() })
    .eq("id", conversationId)
    .or(`turn_started_at.is.null,turn_started_at.lt."${stale}"`)
    .select("id");
  if (error) {
    console.error("turing: taking the turn failed:", error);
    return false;
  }
  return (data ?? []).length === 1;
}

export async function releaseTurn(conversationId: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("turing_conversations")
    .update({ turn_started_at: null })
    .eq("id", conversationId);
  if (error)
    console.error("turing: releasing the turn failed (it frees itself in six minutes):", error);
}

function statusFor(name: string, input: unknown): string {
  const table = (input as { table?: unknown } | null)?.table;
  const what = typeof table === "string" ? table.replace(/_/g, " ") : "the toolbox";
  switch (name) {
    case "read_rows":
    case "fetch_rows":
      return `Reading ${what}…`;
    case "make_page":
      return "Building the page…";
    case "propose_changes":
      return "Drawing up the changes…";
    case "code_execution":
      return "Working it out in code…";
    default:
      return "Looking through the toolbox…";
  }
}

async function loadHistory(conversationId: string): Promise<{
  stored: { role: string; content: unknown; route: string | null }[];
  history: MessageParam[];
}> {
  const supabase = await createClient();
  const rows = await fetchAll((from, to) =>
    supabase
      .from("turing_messages")
      .select("id, role, content, route")
      .eq("conversation_id", conversationId)
      .order("id")
      .range(from, to),
  );
  return {
    stored: rows,
    history: replayable(rows).map((row): MessageParam => ({
      role: row.role === "assistant" ? "assistant" : "user",
      content: row.content as unknown as ContentParam[],
    })),
  };
}

/**
 * What the admin saved from Turing's proposals since it last heard, as a line for the start of
 * their next turn, so Claude knows what landed and what each tool refused. Read once, then marked told.
 */
async function savesToReport(
  conversationId: string,
  stored: { role: string; content: unknown }[],
): Promise<{ line: string; ids: string[] } | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("turing_saves")
    .select("id, tool_use_id, results, created_at")
    .eq("conversation_id", conversationId)
    .eq("reported", false);
  if (error) {
    console.error("turing: saves to report not read:", error);
    return null;
  }
  // A save still running is left for next time; one cut off mid-way is told as such.
  const interruptedBefore = Date.now() - 360_000;
  const due = (data ?? []).filter(
    (save) => save.results !== null || Date.parse(save.created_at) < interruptedBefore,
  );
  if (due.length === 0) return null;
  const proposals = shownProposals(stored);
  const parts = due.map((save) => {
    const proposal = proposals.get(save.tool_use_id);
    if (save.results === null) {
      return `"${proposal?.title ?? "a proposal"}" — the save was cut off part-way, so some rows may have landed; read before proposing again`;
    }
    const results = save.results as unknown as SaveResult[];
    const rows = results
      .map((result) => {
        const original = proposal?.rows[result.row];
        const label = original?.label ?? `row ${result.row + 1}`;
        if (!result.ok) return `${label}: refused — ${result.message}`;
        // The admin may have changed what Claude proposed before saving.
        const changed = Object.entries(result.values ?? {})
          .filter(([key, value]) => original?.values[key] !== value)
          .map(([key, value]) => `${key} ${value === "" ? "cleared" : String(value)}`);
        const as = result.made ? ` as ${result.made}` : "";
        return changed.length > 0
          ? `${label}: saved${as} with ${changed.join(", ")}`
          : `${label}: saved${as}`;
      })
      .join("; ");
    const left = (proposal?.rows.length ?? results.length) - results.length;
    return `"${proposal?.title ?? "a proposal"}" — ${rows || "nothing"}${left > 0 ? `; ${left} row${left === 1 ? "" : "s"} left unticked` : ""}`;
  });
  return {
    line: `${CONTEXT_PREFIX}Since your last answer the admin pressed Save on: ${parts.join(". ")}.</context>`,
    ids: due.map((save) => save.id),
  };
}

type Usage = {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
};

/** On a question, `model` and `usage` are the judge's; on an answer, the Claude that wrote it. */
async function saveMessage(
  conversationId: string,
  message: MessageParam,
  meta: { usage?: Usage; model?: string; route?: Route } = {},
): Promise<void> {
  const { usage } = meta;
  const supabase = await createClient();
  const { error } = await supabase.from("turing_messages").insert({
    conversation_id: conversationId,
    role: message.role,
    content: message.content as never,
    input_tokens: usage?.input_tokens ?? null,
    output_tokens: usage?.output_tokens ?? null,
    cache_read_tokens: usage?.cache_read_input_tokens ?? null,
    cache_write_tokens: usage?.cache_creation_input_tokens ?? null,
    model: meta.model ?? null,
    route: meta.route ?? null,
  });
  if (error) {
    console.error("turing: message save failed:", error);
    throw new Error("Could not save the conversation.", { cause: error });
  }
}

/** A tool call Claude made itself rather than from its code, where the code-only read belongs. */
function directCallOfCodeTool(call: Anthropic.Beta.Messages.BetaToolUseBlock): boolean {
  return call.name === "fetch_rows" && (call.caller === undefined || call.caller.type === "direct");
}

/**
 * One admin turn, run while the caller holds the conversation (takeTurn). The question is saved,
 * then Claude answers, calling tools until it is done; every message is saved as it lands,
 * append-only, and an unfinished exchange is left out of every later replay (replay.ts).
 */
export async function* converse({
  conversationId,
  container,
  userContent,
  deeper,
  signal,
}: {
  conversationId: string;
  container: { id: string; expiresAt: string } | null;
  userContent: ContentParam[];
  /** The admin pressed Think harder: the strongest model, no judge. */
  deeper: boolean;
  signal: AbortSignal;
}): AsyncGenerator<TuringEvent> {
  const client = anthropicClient();
  if (!client) {
    yield { type: "error", message: NO_KEY };
    return;
  }

  const { stored, history } = await loadHistory(conversationId);
  const judged = deeper
    ? null
    : await judge(client, judgeInput(userContent, lastQuestion(stored)), signal);
  if (signal.aborted) return;
  // A judge that could not answer sends the turn to the standard model, with no judge on record.
  const route: Route = deeper ? "asked" : (judged?.level ?? "standard");
  let model = MODEL_FOR[route];

  const report = await savesToReport(conversationId, stored);
  const ask: MessageParam = {
    role: "user",
    content: report ? [{ type: "text", text: report.line }, ...userContent] : userContent,
  };
  await saveMessage(
    conversationId,
    ask,
    judged ? { route, model: JUDGE_MODEL, usage: judged.usage } : { route },
  );
  history.push(ask);
  if (report) {
    const supabase = await createClient();
    const { error } = await supabase
      .from("turing_saves")
      .update({ reported: true })
      .in("id", report.ids);
    if (error) console.error("turing: saves not marked told:", error);
  }

  let containerId =
    container && Date.parse(container.expiresAt) > Date.now() + 30_000 ? container.id : null;
  let retries = 0;
  let finished = false;

  for (let step = 0; step < MAX_STEPS && !finished; step++) {
    yield { type: "step" };
    const stream = client.beta.messages.stream(
      {
        model,
        max_tokens: 64000,
        system: SYSTEM_PROMPT,
        tools: TURING_TOOLS,
        messages: history,
        output_config: { effort: "medium" },
        // Claude's earlier reasoning is bound to the instructions and tools it was written under;
        // when an update changes them, that reasoning is set aside and the conversation carries on.
        thinking: { type: "adaptive", block_binding: { prefix_mismatch_behavior: "drop_block" } },
        cache_control: { type: "ephemeral" },
        ...(containerId ? { container: containerId } : {}),
        ...(fallsBackOnServer(model)
          ? {
              betas: ["server-side-fallback-2026-07-01", "thinking-binding-controls-2026-08-01"],
              fallbacks: "default" as const,
            }
          : { betas: ["thinking-binding-controls-2026-08-01"] }),
      },
      { signal },
    );
    let message: Message;
    try {
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
      retries = 0;
    } catch (error) {
      if (signal.aborted) return;
      stream.abort();
      if (error instanceof Anthropic.APIError) {
        console.error("turing: Claude failed:", error.status, error.message);
        yield {
          type: "error",
          message: claudeFailure(error.status, (error as { type?: string }).type),
        };
        return;
      }
      // A page cut off mid-HTML fails to parse; asking again would only cut it off again.
      if (stream.currentMessage?.stop_reason === "max_tokens") {
        yield { type: "error", message: CUT_OFF };
        return;
      }
      // A streamed tool input that never parsed: nothing was saved, so this step is asked again.
      if (retries++ < 1) {
        console.error("turing: unreadable tool input, asking again:", error);
        yield { type: "restart" };
        step--;
        continue;
      }
      throw error;
    }

    if (signal.aborted) return;
    if (message.stop_reason === "refusal" && !fallsBackOnServer(model)) {
      console.error("turing: refused on", model, "- asking", RESCUE_MODEL);
      model = RESCUE_MODEL;
      yield { type: "restart" };
      step--;
      continue;
    }
    const answer: MessageParam = { role: "assistant", content: message.content as ContentParam[] };
    await saveMessage(conversationId, answer, { usage: message.usage, model: message.model });
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
      return;
    }
    if (message.stop_reason === "max_tokens") {
      yield { type: "error", message: CUT_OFF };
      return;
    }
    if (message.stop_reason === "pause_turn") continue;
    if (message.stop_reason !== "tool_use" || calls.length === 0) {
      finished = true;
      continue;
    }

    const results: ContentParam[] = [];
    for (const call of calls) {
      if (signal.aborted) return;
      yield { type: "status", label: statusFor(call.name, call.input) };
      const outcome = directCallOfCodeTool(call)
        ? { content: "fetch_rows is for your code; use read_rows here.", isError: true }
        : await runTool(call.name, call.input, conversationId, call.id);
      if ("page" in outcome && outcome.page) yield { type: "page", ...outcome.page };
      if ("proposal" in outcome && outcome.proposal) {
        yield { type: "proposal", proposal: outcome.proposal };
      }
      results.push({
        type: "tool_result",
        tool_use_id: call.id,
        content: outcome.content,
        ...(outcome.isError ? { is_error: true } : {}),
      });
    }
    if (signal.aborted) return;
    const reply: MessageParam = { role: "user", content: results };
    await saveMessage(conversationId, reply);
    history.push(reply);
  }

  if (!finished) yield { type: "error", message: TOO_MANY_STEPS };
  yield { type: "done" };
}
