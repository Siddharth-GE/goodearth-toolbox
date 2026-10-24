"use client";

import { Button, LinkButton } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { FormMessage } from "@/components/ui/form-message";
import { IconButton } from "@/components/ui/icon-button";
import { Pill, PillButton } from "@/components/ui/pill";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import type { TuringEvent } from "@/lib/turing/chat";
import type { ShownProposal, Turn } from "@/lib/turing/display";
import { ACCEPTED_EXTENSIONS, fileKind, MAX_FILE_BYTES, NOT_TAKEN } from "@/lib/turing/file-kinds";
import { shrinkDocumentForUpload } from "@/lib/uploads/shrink-in-browser";
import { cn } from "@/lib/utils";
import { LayoutDashboard, Paperclip, Send, Sparkles, Square, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState, type DragEvent } from "react";
import { MarkdownView } from "./markdown-view";
import { ProposalCard } from "./proposal-card";

type Attachment = { key: string; name: string; id?: string; error?: string };
type Live = {
  text: string;
  pages: { id: string; title: string }[];
  proposals: ShownProposal[];
  status: string | null;
  error: string | null;
};

const SUGGESTIONS = [
  "How many indents are waiting for approval?",
  "Make a dashboard of this month's bills by villa",
  "Which villas have no site supervisor yet?",
];

function Answer({
  text,
  pages,
  proposals,
  conversationId,
}: {
  text: string;
  pages: { id: string; title: string }[];
  proposals: ShownProposal[];
  conversationId: string | null;
}) {
  return (
    <div className="space-y-3">
      {text && <MarkdownView text={text} />}
      {conversationId &&
        proposals.map((proposal) => (
          <ProposalCard key={proposal.id} conversationId={conversationId} proposal={proposal} />
        ))}
      {pages.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {pages.map((page) => (
            <LinkButton
              key={page.id}
              href={`/turing/pages/${page.id}`}
              variant="secondary"
              size="sm"
            >
              <LayoutDashboard className="size-4" aria-hidden />
              {page.title}
            </LinkButton>
          ))}
        </div>
      )}
    </div>
  );
}

function nearBottom() {
  return window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 240;
}

export function Chat({
  conversationId: initialId,
  initialTurns,
}: {
  conversationId: string | null;
  initialTurns: Turn[];
}) {
  const router = useRouter();
  const [conversationId, setConversationId] = useState(initialId);
  const [turns, setTurns] = useState<Turn[]>(initialTurns);
  const [shownTurns, setShownTurns] = useState(initialTurns);
  const [live, setLive] = useState<Live | null>(null);
  const [text, setText] = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const abort = useRef<AbortController | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const end = useRef<HTMLDivElement>(null);

  const busy = live !== null && live.error === null;
  // A refresh brings the server's copy (a saved proposal's results, the joined answer); taken when idle.
  if (initialTurns !== shownTurns && !busy) {
    setShownTurns(initialTurns);
    setTurns(initialTurns);
  }
  const uploading = attachments.some((file) => !file.id && !file.error);
  const ready = attachments.filter((file) => file.id);

  const follow = (force = false) => {
    if (force || nearBottom())
      requestAnimationFrame(() => end.current?.scrollIntoView({ block: "end" }));
  };

  async function addFiles(files: FileList | File[]) {
    setError(null);
    for (const file of Array.from(files)) {
      const key = crypto.randomUUID();
      const kind = fileKind(file.name);
      if (!kind) {
        setAttachments((all) => [...all, { key, name: file.name, error: NOT_TAKEN }]);
        continue;
      }
      setAttachments((all) => [...all, { key, name: file.name }]);
      try {
        // Phone photos are 3–8 MB; shrunk first, they read as well and fit the request.
        const upload =
          kind.kind === "image" && file.size > 1024 * 1024
            ? await shrinkDocumentForUpload(file)
            : { blob: file, name: file.name };
        if (upload.blob.size > MAX_FILE_BYTES) throw new Error("Files are taken up to 4 MB each.");
        const form = new FormData();
        form.append("file", upload.blob, upload.name);
        const response = await fetch("/api/turing/files", { method: "POST", body: form });
        const body = (await response.json().catch(() => ({}))) as { id?: string; error?: string };
        if (!response.ok || !body.id)
          throw new Error(body.error ?? "That file did not arrive. Try again.");
        setAttachments((all) => all.map((a) => (a.key === key ? { ...a, id: body.id } : a)));
      } catch (thrown) {
        const message = thrown instanceof Error ? thrown.message : "That file did not arrive.";
        setAttachments((all) => all.map((a) => (a.key === key ? { ...a, error: message } : a)));
      }
    }
  }

  async function send(question = text) {
    const asked = question.trim();
    if ((!asked && ready.length === 0) || busy || uploading) return;
    setError(null);
    const sent = ready;
    setTurns((all) => [
      ...all,
      { role: "user", text: asked, files: sent.map((file) => file.name) },
    ]);
    setText("");
    setAttachments([]);
    setLive({ text: "", pages: [], proposals: [], status: "Thinking…", error: null });
    follow(true);

    const controller = new AbortController();
    abort.current = controller;
    let answer: Live = { text: "", pages: [], proposals: [], status: null, error: null };
    try {
      const response = await fetch("/api/turing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId, text: asked, fileIds: sent.map((file) => file.id) }),
        signal: controller.signal,
      });
      if (!response.ok || !response.body) {
        const body = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? "Turing could not be reached. Try again.");
      }
      const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
      let buffer = "";
      // Each of Claude's messages in a turn is a step: a paragraph apart, and dropped if retried.
      let stepStart = 0;
      let breakPending = false;
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += value;
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          let event: TuringEvent;
          try {
            event = JSON.parse(line) as TuringEvent;
          } catch {
            controller.abort();
            throw new Error("The answer arrived garbled. Ask again.");
          }
          if (event.type === "conversation" && !conversationId) {
            setConversationId(event.id);
            // The address follows without a navigation, so the answer keeps streaming here.
            window.history.replaceState(null, "", `/turing/${event.id}`);
          } else if (event.type === "step") {
            stepStart = answer.text.length;
            breakPending = stepStart > 0;
          } else if (event.type === "restart") {
            answer = { ...answer, text: answer.text.slice(0, stepStart) };
            breakPending = stepStart > 0;
          } else if (event.type === "text") {
            const joined = breakPending
              ? `${answer.text}\n\n${event.text}`
              : answer.text + event.text;
            breakPending = false;
            answer = { ...answer, text: joined, status: null };
          } else if (event.type === "status") {
            answer = { ...answer, status: event.label };
          } else if (event.type === "proposal") {
            answer = { ...answer, proposals: [...answer.proposals, event.proposal], status: null };
          } else if (event.type === "page") {
            answer = { ...answer, pages: [...answer.pages, { id: event.id, title: event.title }] };
          } else if (event.type === "error") {
            answer = { ...answer, error: event.message, status: null };
          }
          setLive({ ...answer });
          follow();
        }
      }
    } catch (thrown) {
      if (!controller.signal.aborted) {
        answer = {
          ...answer,
          error:
            thrown instanceof Error ? thrown.message : "Turing could not be reached. Try again.",
        };
      }
    } finally {
      abort.current = null;
      if (answer.text || answer.pages.length > 0 || answer.proposals.length > 0) {
        const done: Turn = {
          role: "assistant",
          text: answer.text,
          pages: answer.pages,
          proposals: answer.proposals,
        };
        setTurns((all) => [...all, done]);
      }
      setLive(
        answer.error ? { ...answer, text: "", pages: [], proposals: [], status: null } : null,
      );
      // Moves the conversation up the list; a new one is then drawn from the server's copy.
      // An error stays on screen until the next question.
      if (!answer.error) router.refresh();
    }
  }

  const onDrop = (event: DragEvent) => {
    event.preventDefault();
    setDragging(false);
    if (event.dataTransfer.files.length > 0) void addFiles(event.dataTransfer.files);
  };

  return (
    <div
      className={cn("flex min-h-[60vh] flex-col", dragging && "ring-accent/30 rounded-2xl ring-4")}
      onDragOver={(event) => {
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
    >
      <div className="flex-1 space-y-6 pb-6">
        {turns.length === 0 && !live && (
          <EmptyState
            icon={Sparkles}
            title="Ask Turing anything"
            description="It reads every tool as you see it, takes PDFs, photos and spreadsheets, and builds pages you can keep. What you send goes to Anthropic."
            action={
              <div className="flex flex-wrap justify-center gap-2">
                {SUGGESTIONS.map((suggestion) => (
                  <PillButton key={suggestion} onClick={() => void send(suggestion)}>
                    {suggestion}
                  </PillButton>
                ))}
              </div>
            }
          />
        )}

        {turns.map((turn, index) =>
          turn.role === "user" ? (
            <div
              key={index}
              className="bg-surface border-border ml-auto max-w-[85%] space-y-2 rounded-2xl border px-4 py-3"
            >
              {turn.files.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {turn.files.map((name, fileIndex) => (
                    <Pill key={fileIndex}>
                      <Paperclip className="size-3.5" aria-hidden />
                      <span className="truncate">{name}</span>
                    </Pill>
                  ))}
                </div>
              )}
              {turn.text && <p className="text-sm whitespace-pre-wrap">{turn.text}</p>}
            </div>
          ) : (
            <Answer
              key={index}
              text={turn.text}
              pages={turn.pages}
              proposals={turn.proposals}
              conversationId={conversationId}
            />
          ),
        )}

        {live && (
          <div className="space-y-3">
            <Answer
              text={live.text}
              pages={live.pages}
              proposals={live.proposals}
              conversationId={conversationId}
            />
            {live.status && (
              <p className="text-muted flex items-center gap-2 text-sm" role="status">
                <Spinner className="size-4 border-2" />
                {live.status}
              </p>
            )}
            <FormMessage error={live.error} />
          </div>
        )}
        <div ref={end} />
      </div>

      <div className="bg-background sticky bottom-0 space-y-2 pt-2 pb-3">
        {attachments.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {attachments.map((file) => (
              <Pill key={file.key} tone={file.error ? "danger" : "plain"}>
                {!file.id && !file.error ? (
                  <Spinner className="size-3 border-2" />
                ) : (
                  <Paperclip className="size-3.5" aria-hidden />
                )}
                <span className="max-w-48 truncate">
                  {file.error ? `${file.name}: ${file.error}` : file.name}
                </span>
                <button
                  type="button"
                  aria-label={`Remove ${file.name}`}
                  onClick={() => setAttachments((all) => all.filter((a) => a.key !== file.key))}
                  className="hover:text-foreground -mr-1 rounded-full p-0.5"
                >
                  <X className="size-3" />
                </button>
              </Pill>
            ))}
          </div>
        )}
        <FormMessage error={error} />
        <div className="border-border bg-surface-raised focus-within:border-accent focus-within:ring-accent/15 flex items-end gap-1 rounded-2xl border p-1.5 focus-within:ring-4">
          <IconButton
            aria-label="Attach a file"
            onClick={() => fileInput.current?.click()}
            className="mb-0.5"
          >
            <Paperclip className="size-4" />
          </IconButton>
          <input
            ref={fileInput}
            type="file"
            multiple
            hidden
            accept={ACCEPTED_EXTENSIONS.join(",")}
            onChange={(event) => {
              if (event.target.files) void addFiles(event.target.files);
              event.target.value = "";
            }}
          />
          <Textarea
            value={text}
            onChange={(event) => setText(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                event.preventDefault();
                void send();
              }
            }}
            onPaste={(event) => {
              if (event.clipboardData.files.length > 0) {
                event.preventDefault();
                void addFiles(event.clipboardData.files);
              }
            }}
            rows={1}
            placeholder="Ask Turing, or drop in a file…"
            aria-label="Message to Turing"
            className="max-h-48 min-h-10 resize-none border-0 bg-transparent px-2 py-2 focus:ring-0"
          />
          {busy ? (
            <Button
              size="sm"
              variant="secondary"
              onClick={() => abort.current?.abort()}
              className="mb-0.5"
            >
              <Square className="size-3.5" aria-hidden />
              Stop
            </Button>
          ) : (
            <Button
              size="sm"
              onClick={() => void send()}
              disabled={uploading || (!text.trim() && ready.length === 0)}
              className="mb-0.5"
            >
              <Send className="size-3.5" aria-hidden />
              Send
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
