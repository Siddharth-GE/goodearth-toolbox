"use server";

// Type-only; never re-exported from a "use server" file (BUGCATCHER #5).
import type { ActionState } from "@/lib/action-state";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

import { forgetAtAnthropic, removeStored } from "./files";
import { requireTuring } from "./queries";

/** The conversation, its messages and its files, here and at Anthropic. Its pages stay: they are shared. */
export async function deleteConversation(id: string): Promise<ActionState> {
  await requireTuring();
  const supabase = await createClient();
  const { data: files, error: filesError } = await supabase
    .from("turing_files")
    .select("storage_path, anthropic_file_id")
    .eq("conversation_id", id);
  if (filesError) {
    console.error("turing: delete conversation read failed:", filesError);
    return { error: "The conversation could not be deleted. Try again." };
  }
  const { data, error } = await supabase
    .from("turing_conversations")
    .delete()
    .eq("id", id)
    .select("id");
  if (error) {
    console.error("turing: delete conversation failed:", error);
    return { error: "The conversation could not be deleted. Try again." };
  }
  if (!data || data.length === 0) return { error: "That conversation is already gone." };
  await removeStored((files ?? []).map((file) => file.storage_path));
  await forgetAtAnthropic((files ?? []).map((file) => file.anthropic_file_id));
  revalidatePath("/turing", "layout");
}

/** Any admin may delete a page: pages are shared, and nothing depends on one. */
export async function deletePage(id: string): Promise<ActionState> {
  await requireTuring();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("turing_pages")
    .delete()
    .eq("id", id)
    .select("storage_path");
  if (error) {
    console.error("turing: delete page failed:", error);
    return { error: "The page could not be deleted. Try again." };
  }
  if (!data || data.length === 0) return { error: "That page is already gone." };
  const { error: removeError } = await supabase.storage
    .from("turing-pages")
    .remove(data.map((page) => page.storage_path));
  if (removeError) console.error("turing: page file left behind", removeError);
  revalidatePath("/turing", "layout");
}
