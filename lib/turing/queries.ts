import "server-only";

import { requireAdmin } from "@/lib/auth/access";
import { requireUser } from "@/lib/auth/dal";
import { fetchAll } from "@/lib/supabase/fetch-all";
import { assertRead } from "@/lib/supabase/read-failed";
import { createClient } from "@/lib/supabase/server";

import { conversationTurns, type SaveResult, type Turn } from "./display";

/** Turing is the admins' own: never a grant, the way Settings is. */
export async function requireTuring() {
  const user = await requireUser();
  await requireAdmin(user);
  return user;
}

export type ConversationSummary = { id: string; title: string; updated_at: string };

export async function listConversations(): Promise<ConversationSummary[]> {
  await requireTuring();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("turing_conversations")
    .select("id, title, updated_at")
    .order("updated_at", { ascending: false })
    .limit(50);
  assertRead("Turing", "your conversations", error);
  return data ?? [];
}

export async function getConversation(
  id: string,
): Promise<{ id: string; title: string; turns: Turn[] } | null> {
  await requireTuring();
  const supabase = await createClient();
  const { data: conversation, error } = await supabase
    .from("turing_conversations")
    .select("id, title")
    .eq("id", id)
    .maybeSingle();
  assertRead("Turing", "the conversation", error);
  if (!conversation) return null;

  const [messages, files, pages, saves] = await Promise.all([
    fetchAll((from, to) =>
      supabase
        .from("turing_messages")
        .select("id, role, content")
        .eq("conversation_id", id)
        .order("id")
        .range(from, to),
    ),
    supabase.from("turing_files").select("anthropic_file_id, name").eq("conversation_id", id),
    supabase.from("turing_pages").select("id, title").eq("conversation_id", id),
    supabase
      .from("turing_saves")
      .select("tool_use_id, results, created_at")
      .eq("conversation_id", id),
  ]);
  assertRead("Turing", "the conversation's files", files.error);
  assertRead("Turing", "the conversation's pages", pages.error);
  assertRead("Turing", "what was saved", saves.error);

  return {
    id: conversation.id,
    title: conversation.title,
    turns: conversationTurns(
      messages,
      new Map((files.data ?? []).map((file) => [file.anthropic_file_id, file.name])),
      new Map((pages.data ?? []).map((page) => [page.id, page.title])),
      new Map(
        (saves.data ?? []).map((save) => [
          save.tool_use_id,
          {
            at: save.created_at,
            results: save.results as SaveResult[] | null,
            // A save with no results after six minutes was cut off (Vercel stops a request at five).
            interrupted:
              save.results === null && Date.now() - Date.parse(save.created_at) > 360_000,
          },
        ]),
      ),
    ),
  };
}

export type PageSummary = {
  id: string;
  title: string;
  created_at: string;
  owner_name: string | null;
};

export async function listPages(): Promise<PageSummary[]> {
  await requireTuring();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("turing_pages")
    .select("id, title, created_at, profiles!turing_pages_owner_id_fkey(full_name)")
    .order("created_at", { ascending: false })
    .limit(200);
  assertRead("Turing", "the pages", error);
  return (data ?? []).map((page) => ({
    id: page.id,
    title: page.title,
    created_at: page.created_at,
    owner_name: page.profiles?.full_name ?? null,
  }));
}

export async function getPage(id: string) {
  await requireTuring();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("turing_pages")
    .select("id, title, recipe, storage_path, created_at, conversation_id")
    .eq("id", id)
    .maybeSingle();
  assertRead("Turing", "the page", error);
  return data;
}
