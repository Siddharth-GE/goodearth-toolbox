import { createClient } from "@/lib/supabase/server";
import { turingCaller } from "@/lib/turing/caller";
import { pageDocument, pageFileName, pageHeaders } from "@/lib/turing/page-rules";
import { checkRecipe } from "@/lib/turing/read-rules";
import { TURING_SCHEMA } from "@/lib/turing/schema.generated";
import { runRecipe } from "@/lib/turing/tools";

const MOVED = `<!doctype html><html><head><meta charset="utf-8"></head>
<body style="font-family:system-ui,sans-serif;background:#f0eeea;color:#180b0f;padding:24px">
<p>This page's data has moved. Ask Turing to rebuild it.</p></body></html>`;

/**
 * A page, with its data read afresh as the admin opening it. Served under the sandbox CSP
 * (lib/turing/page-rules.ts) and shown in a sandboxed frame, so it runs on an opaque origin.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const caller = await turingCaller();
  if ("refused" in caller) return caller.refused;
  const { id } = await params;
  const download = new URL(request.url).searchParams.has("download");

  const supabase = await createClient();
  const { data: page, error } = await supabase
    .from("turing_pages")
    .select("title, recipe, storage_path")
    .eq("id", id)
    .maybeSingle();
  if (error) {
    console.error("turing: page read failed:", error);
    return new Response("The page could not be opened.", { status: 500 });
  }
  if (!page) return new Response("That page is gone.", { status: 404 });

  const headers = pageHeaders(download ? { fileName: pageFileName(page.title) } : null);
  const recipe = checkRecipe(page.recipe, TURING_SCHEMA);
  if (!recipe.ok) return new Response(MOVED, { headers });
  const data = await runRecipe(recipe.value);
  if (!data.ok) {
    console.error("turing: page recipe failed:", id, data.error);
    return new Response(MOVED, { headers });
  }

  const { data: file, error: fileError } = await supabase.storage
    .from("turing-pages")
    .download(page.storage_path);
  if (fileError || !file) {
    console.error("turing: page file missing:", id, fileError);
    return new Response("The page could not be opened.", { status: 500 });
  }
  return new Response(pageDocument(await file.text(), data.data, { download }), { headers });
}
