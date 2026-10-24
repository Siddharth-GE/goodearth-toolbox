import "server-only";

import { createClient } from "@/lib/supabase/server";

import { checkProposal, idsOf } from "./catalogue-fields";
import { pageToken, proposalToken, type ShownProposal } from "./display";
import { namesFor } from "./names";
import { pageTripwire } from "./page-rules";
import { BULK_LIMIT, checkRead, checkRecipe, DIRECT_LIMIT, type RecipeRead } from "./read-rules";
import { runRead } from "./reads";
import { TURING_SCHEMA } from "./schema.generated";

export type ToolOutcome = {
  content: string;
  isError: boolean;
  page?: { id: string; title: string };
  proposal?: ShownProposal;
};

const fail = (content: string): ToolOutcome => ({ content, isError: true });
const done = (value: unknown): ToolOutcome => ({ content: JSON.stringify(value), isError: false });

const MAX_PAGE_BYTES = 1_000_000;

/** Runs every read of a recipe as the person asking; the first failure names its read. */
export async function runRecipe(
  reads: RecipeRead[],
): Promise<{ ok: true; data: Record<string, unknown> } | { ok: false; error: string }> {
  const data: Record<string, unknown> = {};
  for (const read of reads) {
    const result = await runRead(read);
    if (!result.ok) return { ok: false, error: `${read.name}: ${result.error}` };
    data[read.name] = "count" in result ? { count: result.count } : result.rows;
  }
  return { ok: true, data };
}

async function makePage(
  input: Record<string, unknown>,
  conversationId: string,
): Promise<ToolOutcome> {
  const title = typeof input.title === "string" ? input.title.trim() : "";
  if (!title || title.length > 120) return fail("A page needs a title of up to 120 characters.");
  const html = typeof input.html === "string" ? input.html : "";
  if (!html.trim()) return fail("The page has no HTML.");
  if (new TextEncoder().encode(html).length > MAX_PAGE_BYTES) {
    return fail(
      "The page is over 1 MB. Make it smaller: the data is added by the server, not written in.",
    );
  }
  const outside = pageTripwire(html);
  if (outside)
    return fail(`Refused: the page uses ${outside}. A page may not reach outside itself.`);
  const recipe = checkRecipe(input.recipe, TURING_SCHEMA);
  if (!recipe.ok) return fail(recipe.error);
  const trial = await runRecipe(recipe.value);
  if (!trial.ok) return fail(`A read failed: ${trial.error}`);

  const supabase = await createClient();
  const id = crypto.randomUUID();
  const path = `${id}.html`;
  const { error: uploadError } = await supabase.storage
    .from("turing-pages")
    .upload(path, new Blob([html], { type: "text/html" }), { contentType: "text/html" });
  if (uploadError) {
    console.error("turing: page upload failed:", uploadError);
    return fail("The page could not be saved. Try again.");
  }
  const { error } = await supabase.from("turing_pages").insert({
    id,
    title,
    recipe: input.recipe as never,
    storage_path: path,
    conversation_id: conversationId,
  });
  if (error) {
    console.error("turing: page row failed:", error);
    const { error: removeError } = await supabase.storage.from("turing-pages").remove([path]);
    if (removeError) console.error("turing: orphaned page file", path, removeError);
    return fail("The page could not be saved. Try again.");
  }
  return {
    content: `Saved the page "${title}" ${pageToken(id)}. The admin sees a link to it under your answer.`,
    isError: false,
    page: { id, title },
  };
}

/** One tool call from Claude. Every input is checked here: the API does not check streamed inputs. */
export async function runTool(
  name: string,
  input: unknown,
  conversationId: string,
  callId: string,
): Promise<ToolOutcome> {
  const args = (typeof input === "object" && input !== null ? input : {}) as Record<
    string,
    unknown
  >;
  switch (name) {
    case "list_tables": {
      const names = Object.keys(TURING_SCHEMA);
      return done({
        tables: names.filter((n) => TURING_SCHEMA[n].kind === "table"),
        views: names.filter((n) => TURING_SCHEMA[n].kind === "view"),
      });
    }
    case "describe_table": {
      const table = String(args.table ?? "");
      if (!Object.hasOwn(TURING_SCHEMA, table))
        return fail(`There is no table or view called "${table}".`);
      return done({
        table,
        kind: TURING_SCHEMA[table].kind,
        columns: TURING_SCHEMA[table].columns,
      });
    }
    case "read_rows":
    case "fetch_rows": {
      const read = checkRead(args, TURING_SCHEMA, name === "read_rows" ? DIRECT_LIMIT : BULK_LIMIT);
      if (!read.ok) return fail(read.error);
      const result = await runRead(read.value);
      if (!result.ok) return fail(`The read failed: ${result.error}`);
      return done(
        "count" in result ? { count: result.count } : { rows: result.rows, more: result.more },
      );
    }
    case "make_page":
      return makePage(args, conversationId);
    case "propose_changes": {
      const proposal = checkProposal(args);
      if (!proposal.ok) return fail(proposal.error);
      const { entry, title, rows } = proposal.value;
      // The admin checks names, not ids: an id that names nothing they can see is refused here.
      const ids = idsOf(entry, rows);
      const names = await namesFor(ids);
      const unknown = [...ids.values()].flatMap((set) => [...set]).filter((id) => !names[id]);
      if (unknown.length > 0) {
        return fail(`These ids name nothing: ${unknown.slice(0, 10).join(", ")}. Read them again.`);
      }
      return {
        content: `Shown to the admin as "${title}", ${rows.length} row${rows.length === 1 ? "" : "s"} of ${entry.title.toLowerCase()} ${proposalToken(callId)}. Nothing is saved until they press Save; you are told what was saved at the start of their next message.`,
        isError: false,
        proposal: { id: callId, action: entry.key, title, rows, saved: null, names },
      };
    }
    default:
      return fail(`There is no tool called "${name}".`);
  }
}
