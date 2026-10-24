import type Anthropic from "@anthropic-ai/sdk";

import { createClient } from "@/lib/supabase/server";
import { turingCaller } from "@/lib/turing/caller";
import { converse, releaseTurn, takeTurn, type TuringEvent } from "@/lib/turing/chat";
import { anthropicClient } from "@/lib/turing/claude";
import { CONTEXT_PREFIX, titleFrom } from "@/lib/turing/display";
import { NO_KEY } from "@/lib/turing/errors";
import { fileBlock } from "@/lib/turing/files";

// A page build can run long; Vercel's ceiling on the current plan. Streaming keeps the line open.
export const maxDuration = 300;

const MAX_TEXT = 20_000;
const MAX_FILES = 10;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const refuse = (error: string, status: number) => Response.json({ error }, { status });

function contextLine(name: string): string {
  const now = new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date());
  return `${CONTEXT_PREFIX}It is ${now} in Kannur. Asking: ${name}.</context>`;
}

/** One admin turn, answered as a stream of JSON lines (lib/turing/chat.ts's events). */
export async function POST(request: Request) {
  const caller = await turingCaller();
  if ("refused" in caller) return caller.refused;
  const { user } = caller;
  if (!anthropicClient()) return refuse(NO_KEY, 503);

  const body = (await request.json().catch(() => null)) as {
    conversationId?: unknown;
    text?: unknown;
    fileIds?: unknown;
  } | null;
  const text = typeof body?.text === "string" ? body.text.trim() : "";
  const rawIds: unknown[] = Array.isArray(body?.fileIds) ? body.fileIds : [];
  if (text.length > MAX_TEXT)
    return refuse("That message is too long. Send it as a file instead.", 400);
  if (!rawIds.every((id) => typeof id === "string" && UUID.test(id))) {
    return refuse("A file did not arrive. Drop it in again.", 400);
  }
  const fileIds = [...new Set(rawIds as string[])];
  if (fileIds.length > MAX_FILES) return refuse(`Send up to ${MAX_FILES} files at a time.`, 400);
  if (!text && fileIds.length === 0) return refuse("Type a question or drop in a file.", 400);
  const existingId =
    typeof body?.conversationId === "string" && UUID.test(body.conversationId)
      ? body.conversationId
      : null;

  const supabase = await createClient();

  // The files are checked before anything is made: the caller's own (RLS), and not yet sent elsewhere.
  if (fileIds.length > 0) {
    const { data, error } = await supabase
      .from("turing_files")
      .select("id")
      .in("id", fileIds)
      .or(
        existingId
          ? `conversation_id.is.null,conversation_id.eq.${existingId}`
          : "conversation_id.is.null",
      );
    if (error) {
      console.error("turing: file check failed:", error);
      return refuse("The files could not be checked. Try again.", 500);
    }
    if ((data ?? []).length !== fileIds.length)
      return refuse("A file did not arrive. Drop it in again.", 400);
  }

  let conversation: {
    id: string;
    container_id: string | null;
    container_expires_at: string | null;
  };
  if (existingId) {
    const { data, error } = await supabase
      .from("turing_conversations")
      .select("id, container_id, container_expires_at")
      .eq("id", existingId)
      .maybeSingle();
    if (error) {
      console.error("turing: conversation read failed:", error);
      return refuse("The conversation could not be opened. Try again.", 500);
    }
    if (!data) return refuse("That conversation is gone.", 404);
    conversation = data;
  } else {
    const { data, error } = await supabase
      .from("turing_conversations")
      .insert({ title: titleFrom(text) })
      .select("id, container_id, container_expires_at")
      .single();
    if (error) {
      console.error("turing: conversation insert failed:", error);
      return refuse("The conversation could not be started. Try again.", 500);
    }
    conversation = data;
  }

  if (!(await takeTurn(conversation.id))) {
    return refuse(
      "Turing is still answering in this conversation. Give it a moment, then ask again.",
      409,
    );
  }

  let files: { name: string; media_type: string; anthropic_file_id: string }[] = [];
  if (fileIds.length > 0) {
    const { data, error } = await supabase
      .from("turing_files")
      .update({ conversation_id: conversation.id })
      .in("id", fileIds)
      .or(`conversation_id.is.null,conversation_id.eq.${conversation.id}`)
      .select("name, media_type, anthropic_file_id, created_at")
      .order("created_at");
    if (error || (data ?? []).length !== fileIds.length) {
      console.error("turing: attaching files failed:", error);
      await releaseTurn(conversation.id);
      return refuse("The files could not be attached. Try again.", 500);
    }
    files = data ?? [];
  }

  const content: Anthropic.Beta.Messages.BetaContentBlockParam[] = [
    { type: "text", text: contextLine(user.profile?.full_name || user.email) },
    ...files.map(fileBlock),
    ...(text ? [{ type: "text" as const, text }] : []),
  ];

  const encoder = new TextEncoder();
  const turn = converse({
    conversationId: conversation.id,
    container:
      conversation.container_id && conversation.container_expires_at
        ? { id: conversation.container_id, expiresAt: conversation.container_expires_at }
        : null,
    userContent: content,
    signal: request.signal,
  });

  let open = true;
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: TuringEvent) => {
        if (open) controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      };
      send({ type: "conversation", id: conversation.id });
      try {
        for await (const event of turn) send(event);
      } catch (error) {
        console.error("turing: turn failed:", error);
        send({ type: "error", message: "Something went wrong mid-answer. Ask again." });
      } finally {
        // Given back only once the turn has really stopped, so no second answer overlaps it.
        await releaseTurn(conversation.id);
        if (open) {
          open = false;
          controller.close();
        }
      }
    },
    cancel() {
      open = false;
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Accel-Buffering": "no",
    },
  });
}
