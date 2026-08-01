import { requireApp } from "@/lib/auth/access";
import { getCurrentUser } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";

/**
 * Catalogue search for the Selections picker.
 *
 * A Route Handler rather than a Server Action, on the framework's own
 * advice: "do not rely on Promise.all to parallelize Server Actions from
 * the client... use a Route Handler for non-mutation requests."
 *
 * Two things made the action version slow. Actions dispatch one at a time
 * per client, so keystrokes queued behind each other; and an action that
 * revalidates also re-renders the whole editor route server-side, meaning
 * every search re-ran four unrelated page queries. This is a plain GET —
 * no queue, no re-render, and abortable from the client.
 *
 * Not cached: results depend on the signed-in user's grant.
 */
export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  // Redirects for a page, but here it just means "no".
  await requireApp(user, "/selections");

  const { searchParams } = new URL(request.url);
  const search = (searchParams.get("q") ?? "").replace(/[,()]/g, " ").trim();
  const categoryId = searchParams.get("category") ?? "";
  const placement = searchParams.get("placement") ?? "";
  const page = Math.max(1, Number(searchParams.get("page")) || 1);
  const pageSize = 30;

  const supabase = await createClient();
  let query = supabase
    .from("items")
    .select("id, code, name, thumb_url, indicative_price, default_uom, is_provisional", {
      count: "exact",
    })
    .eq("is_active", true)
    // Hundreds of items share a name ("Hanging Light"); without a unique
    // tiebreaker rows repeat across pages while others never appear.
    .order("name")
    .order("id")
    .range((page - 1) * pageSize, page * pageSize - 1);

  if (categoryId) query = query.eq("category_id", categoryId);
  if (placement) query = query.eq("placement", placement);
  if (search) query = query.or(`name.ilike.%${search}%,code.ilike.%${search}%`);

  const { data, count, error } = await query;
  if (error) {
    console.error("catalogue search failed:", error);
    return Response.json({ items: [], total: 0, pageCount: 1 }, { status: 500 });
  }

  const total = count ?? 0;
  return Response.json({
    items: data ?? [],
    total,
    pageCount: Math.max(1, Math.ceil(total / pageSize)),
  });
}
