import type Anthropic from "@anthropic-ai/sdk";

import { createClient } from "@/lib/supabase/server";
import { turingCaller } from "@/lib/turing/caller";
import { converse, type TuringEvent } from "@/lib/turing/chat";
import { CONTEXT_PREFIX, titleFrom } from "@/lib/turing/display";
import { fileBlock } from "@/lib/turing/files";

// A page build can run long; Vercel's ceiling on the current plan. Streaming keeps the line open.
export const maxDuration = 300;

const MAX_TEXT = 20_000;
const MAX_FILES = 10;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

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

  const body = (await request.json().catch(() => null)) as {
    conversationId?: unknown;
    text?: unknown;
    fileIds?: unknown;
  } | null;
  const text = typeof body?.text === "string" ? body.text.trim() : "";
  const fileIds = Array.isArray(body?.fileIds) ? body.fileIds : [];
  if (text.length > MAX_TEXT) {
    return Response.json(
      { error: "That message is too long. Send it as a file instead." },
      { status: 400 },
    );
  }
  if (
    fileIds.length > MAX_FILES ||
    !fileIds.every((id) => typeof id === "string" && UUID.test(id))
  ) {
    return Response.json({ error: `Send up to ${MAX_FILES} files at a time.` }, { status: 400 });
  }
  if (!text && fileIds.length === 0) {
    return Response.json({ error: "Type a question or drop in a file." }, { status: 400 });
  }

  const supabase = await createClient();
  let conversation: {
    id: string;
    container_id: string | null;
    container_expires_at: string | null;
  };
  if (typeof body?.conversationId === "string" && UUID.test(body.conversationId)) {
    const { data, error } = await supabase
      .from("turing_conversations")
      .select("id, container_id, container_expires_at")
      .eq("id", body.conversationId)
      .maybeSingle();
    if (error) {
      console.error("turing: conversation read failed:", error);
      return Response.json(
        { error: "The conversation could not be opened. Try again." },
        { status: 500 },
      );
    }
    if (!data) return Response.json({ error: "That conversation is gone." }, { status: 404 });
    conversation = data;
  } else {
    const { data, error } = await supabase
      .from("turing_conversations")
      .insert({ title: titleFrom(text) })
      .select("id, container_id, container_expires_at")
      .single();
    if (error) {
      console.error("turing: conversation insert failed:", error);
      return Response.json(
        { error: "The conversation could not be started. Try again." },
        { status: 500 },
      );
    }
    conversation = data;
  }

  // The files are the caller's own (RLS) and not yet sent elsewhere; attaching them is the check.
  let files: { name: string; media_type: string; anthropic_file_id: string }[] = [];
  if (fileIds.length > 0) {
    const { data, error } = await supabase
      .from("turing_files")
      .update({ conversation_id: conversation.id })
      .in("id", fileIds as string[])
      .or(`conversation_id.is.null,conversation_id.eq.${conversation.id}`)
      .select("name, media_type, anthropic_file_id, created_at")
      .order("created_at");
    if (error) {
      console.error("turing: attaching files failed:", error);
      return Response.json(
        { error: "The files could not be attached. Try again." },
        { status: 500 },
      );
    }
    if ((data ?? []).length !== fileIds.length) {
      return Response.json({ error: "A file did not arrive. Drop it in again." }, { status: 400 });
    }
    files = data ?? [];
  }

  const content: Anthropic.Beta.Messages.BetaContentBlockParam[] = [
    { type: "text", text: contextLine(user.profile?.full_name || user.email) },
    ...files.map(fileBlock),
    ...(text ? [{ type: "text" as const, text }] : []),
  ];

  const encoder = new TextEncoder();
  const send = (event: TuringEvent) => encoder.encode(`${JSON.stringify(event)}\n`);
  const turn = converse({
    conversationId: conversation.id,
    container:
      conversation.container_id && conversation.container_expires_at
        ? { id: conversation.container_id, expiresAt: conversation.container_expires_at }
        : null,
    userContent: content,
    signal: request.signal,
  });

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      controller.enqueue(send({ type: "conversation", id: conversation.id }));
      try {
        for await (const event of turn) controller.enqueue(send(event));
      } catch (error) {
        console.error("turing: turn failed:", error);
        controller.enqueue(
          send({ type: "error", message: "Something went wrong mid-answer. Ask again." }),
        );
      } finally {
        controller.close();
      }
    },
    async cancel() {
      await turn.return(undefined);
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
