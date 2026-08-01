import { hasApp } from "@/lib/auth/access";
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
  // Three tools browse the catalogue: designers picking items, Masters
  // checking a request against what already exists, and Budgets setting a
  // product's default margin. hasApp rather than requireApp because a
  // redirect is meaningless in a fetch response.
  //
  // Note what this returns: name, code, brand, thumbnail and the
  // indicative price. No cost and no margin — those live in tables only
  // /budgets can read, and this endpoint never touches them.
  const allowed =
    (await hasApp(user, "/selections")) ||
    (await hasApp(user, "/masters")) ||
    (await hasApp(user, "/budgets"));
  if (!allowed) return new Response("Forbidden", { status: 403 });

  const { searchParams } = new URL(request.url);
  const search = (searchParams.get("q") ?? "").replace(/[,()]/g, " ").trim();
  const categoryId = searchParams.get("category") ?? "";
  const brandId = searchParams.get("brand") ?? "";
  const placement = searchParams.get("placement") ?? "";
  const page = Math.max(1, Number(searchParams.get("page")) || 1);
  const pageSize = 30;

  const supabase = await createClient();

  // Typing "Jaquar" should find Jaquar's items even though the brand name
  // lives on another table. Resolving matching brands to ids first keeps
  // this a single flat or-filter — PostgREST can't mix a joined table's
  // column into a top-level `or` against the items table.
  let brandMatchIds: string[] = [];
  if (search) {
    const { data: brands } = await supabase
      .from("brands")
      .select("id")
      .ilike("name", `%${search}%`)
      .limit(50);
    brandMatchIds = (brands ?? []).map((brand) => brand.id);
  }

  let query = supabase
    .from("items")
    .select("id, code, name, thumb_url, indicative_price, default_uom, is_provisional, brands(name)", {
      count: "exact",
    })
    .eq("is_active", true)
    // Hundreds of items share a name ("Hanging Light"); without a unique
    // tiebreaker rows repeat across pages while others never appear.
    .order("name")
    .order("id")
    .range((page - 1) * pageSize, page * pageSize - 1);

  if (categoryId) query = query.eq("category_id", categoryId);
  if (brandId) query = query.eq("brand_id", brandId);
  if (placement) query = query.eq("placement", placement);
  if (search) {
    const clauses = [`name.ilike.%${search}%`, `code.ilike.%${search}%`];
    if (brandMatchIds.length > 0) clauses.push(`brand_id.in.(${brandMatchIds.join(",")})`);
    query = query.or(clauses.join(","));
  }

  const { data, count, error } = await query;
  if (error) {
    console.error("catalogue search failed:", error);
    return Response.json({ items: [], total: 0, pageCount: 1 }, { status: 500 });
  }

  const total = count ?? 0;
  return Response.json({
    // Flatten the brand embed — the picker wants a name to show, not a
    // nested object to unwrap.
    items: (data ?? []).map(({ brands, ...item }) => ({
      ...item,
      brand_name: (brands as { name: string } | null)?.name ?? null,
    })),
    total,
    pageCount: Math.max(1, Math.ceil(total / pageSize)),
  });
}
