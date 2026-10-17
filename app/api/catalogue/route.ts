import { hasApp } from "@/lib/auth/access";
import { CATALOGUE_TOOLS } from "@/lib/tools";
import { CATALOGUE_PAGE_SIZE, catalogueSearchFilter } from "@/lib/masters/catalogue";
import { getCurrentUser } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";

/**
 * Catalogue search for the item pickers. A GET, not a Server Action: actions queue
 * one at a time per client and re-render the page, so keystrokes would stack up.
 * Not cached: results depend on the person's grants.
 */
export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  // Admits the tools flagged `catalogue` in lib/tools.ts; hasApp, since a redirect
  // means nothing to a fetch. Returns no cost or margin: those are /budgets' tables.
  const grants = await Promise.all(CATALOGUE_TOOLS.map((href) => hasApp(user, href)));
  const allowed = grants.some(Boolean);
  if (!allowed) return new Response("Forbidden", { status: 403 });

  const { searchParams } = new URL(request.url);
  // Passed whole: catalogueSearchFilter quotes it for PostgREST's `or`.
  const search = (searchParams.get("q") ?? "").trim();
  const categoryId = searchParams.get("category") ?? "";
  const brandId = searchParams.get("brand") ?? "";
  const placement = searchParams.get("placement") ?? "";
  const page = Math.max(1, Number(searchParams.get("page")) || 1);
  const pageSize = CATALOGUE_PAGE_SIZE;

  const supabase = await createClient();

  // Brands resolve to ids first: PostgREST can't put a joined column in a top-level `or`.
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
    .select(
      "id, code, name, description, thumb_url, source_url, indicative_price, default_uom, is_provisional, brands(name)",
      {
        count: "exact",
      },
    )
    .eq("is_active", true)
    // Names repeat by the hundred; without a unique tiebreaker, pages skip and repeat.
    .order("name")
    .order("id")
    .range((page - 1) * pageSize, page * pageSize - 1);

  if (categoryId) query = query.eq("category_id", categoryId);
  if (brandId) query = query.eq("brand_id", brandId);
  if (placement) query = query.eq("placement", placement);
  if (search) query = query.or(catalogueSearchFilter(search, brandMatchIds));

  const { data, count, error } = await query;
  if (error) {
    console.error("catalogue search failed:", error);
    return Response.json({ items: [], total: 0, pageCount: 1 }, { status: 500 });
  }

  const total = count ?? 0;
  return Response.json({
    items: (data ?? []).map(({ brands, ...item }) => ({
      ...item,
      brand_name: (brands as { name: string } | null)?.name ?? null,
    })),
    total,
    pageCount: Math.max(1, Math.ceil(total / pageSize)),
  });
}
