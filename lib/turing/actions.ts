"use server";

// Type-only; never re-exported from a "use server" file (BUGCATCHER #5).
import type { ActionState } from "@/lib/action-state";
import { fetchAll } from "@/lib/supabase/fetch-all";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

import { RUNNERS } from "./catalogue";
import { editedRows, entryFor, idsOf, recordsOf } from "./catalogue-fields";
import { shownProposals, type SaveResult } from "./display";
import { forgetAtAnthropic, removeStored } from "./files";
import { namesFor } from "./names";
import { requireTuring } from "./queries";
import { redirectedTo } from "./redirects";

/**
 * The admin's Save on a proposal: the rows they ticked, as they edited them, each through its
 * tool's own save, as them. The proposal is taken from the conversation itself, never from the
 * screen alone, and is taken once — the save row's unique key is claimed before anything runs.
 */
export async function saveProposal(input: {
  conversationId: string;
  proposalId: string;
  rows: { row: number; values: Record<string, string | boolean | null> }[];
}): Promise<ActionState> {
  await requireTuring();
  const supabase = await createClient();
  let messages: { role: string; content: unknown }[];
  try {
    messages = await fetchAll((from, to) =>
      supabase
        .from("turing_messages")
        .select("id, role, content")
        .eq("conversation_id", input.conversationId)
        .order("id")
        .range(from, to),
    );
  } catch (thrown) {
    console.error("turing: proposal read failed:", thrown);
    return { error: "The proposal could not be read. Try again." };
  }
  const proposal = shownProposals(messages).get(input.proposalId);
  const entry = entryFor(proposal?.action);
  const run = entry ? RUNNERS[entry.key] : undefined;
  if (!proposal || !entry || !run) return { error: "That proposal is not in this conversation." };
  if (Boolean(entry.lines) === (typeof run === "function")) {
    console.error("turing: an entry's lines and its runner disagree:", entry.key);
    return { error: "Turing can't save this kind of change yet. Use the tool's own screen." };
  }
  const rows = editedRows(entry, proposal.rows, input.rows);
  if (!rows.ok) return { error: rows.error };

  const { error: claimError } = await supabase
    .from("turing_saves")
    .insert({ conversation_id: input.conversationId, tool_use_id: input.proposalId });
  if (claimError) {
    if (claimError.code === "23505") return { error: "This proposal was already saved." };
    console.error("turing: claiming the save failed:", claimError);
    return { error: "The proposal could not be saved. Try again." };
  }

  // Names as they read before the save, kept with the results: a deleted log names nothing after.
  let before: Record<string, string> = {};
  try {
    before = await namesFor(
      idsOf(
        entry,
        rows.value.map(({ row }) => row),
      ),
    );
  } catch {
    // Logged in namesFor; the save goes ahead and the screen falls back to live names.
  }
  const namesOf = (values: SaveResult["values"]) =>
    Object.fromEntries(
      Object.values(values ?? {})
        .filter((value): value is string => typeof value === "string" && value in before)
        .map((id) => [id, before[id]]),
    );

  // One call per row, or per record for an entry with lines; a record's result stands for each of its lines.
  const calls =
    typeof run === "function"
      ? rows.value.map((item) => ({ items: [item], call: () => run(item.row.values) }))
      : recordsOf(entry, rows.value).map((record) => ({
          items: record.rows,
          call: () =>
            run.lines(
              record.header,
              record.rows.map(({ row }) => row.values),
            ),
        }));
  const results: SaveResult[] = [];
  for (const { items, call } of calls) {
    let message: string;
    let made: string | undefined;
    try {
      const result = await call();
      message = (result && "error" in result && result.error) || "";
      made = result && "saved" in result ? result.saved : undefined;
    } catch (thrown) {
      // A save that sends the person to what it made has saved.
      if (redirectedTo(thrown) !== null) message = "";
      else {
        console.error("turing: a proposal row failed:", entry.key, thrown);
        message = "Something went wrong. Try it on the tool's screen.";
      }
    }
    for (const { index, row } of items) {
      results.push({
        row: index,
        ok: !message,
        message,
        made,
        values: row.values,
        names: namesOf(row.values),
      });
    }
  }

  const { error } = await supabase
    .from("turing_saves")
    .update({ results: results as never })
    .eq("conversation_id", input.conversationId)
    .eq("tool_use_id", input.proposalId);
  if (error) console.error("turing: save results not kept:", error);
  revalidatePath("/turing", "layout");
}

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
