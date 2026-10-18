// Contract between /api/catalogue and the picker. No imports, so a Client Component can use it.

export type CatalogueItem = {
  id: string;
  code: string | null;
  name: string;
  description: string | null;
  brand_name: string | null;
  thumb_url: string | null;
  source_url: string | null;
  indicative_price: number | null;
  default_uom: string;
  is_provisional: boolean;
};

export type CatalogueSearchResult = {
  items: CatalogueItem[];
  total: number;
  pageCount: number;
};

export const CATALOGUE_PAGE_SIZE = 30;

/**
 * The `or(...)` filter, with the term double-quoted so PostgREST reads commas and brackets as data.
 * Inside the quotes only `"` and `\` need escaping.
 */
export function catalogueSearchFilter(search: string, brandIds: string[] = []): string {
  // `%` stays inside the quotes, where ilike still reads it as a wildcard.
  const quoted = `"%${search.replace(/[\\"]/g, "\\$&")}%"`;
  // The description too: designers search by "ashwood" or "teak".
  const clauses = [`name.ilike.${quoted}`, `code.ilike.${quoted}`, `description.ilike.${quoted}`];
  if (brandIds.length > 0) {
    clauses.push(`brand_id.in.(${brandIds.map((id) => `"${id}"`).join(",")})`);
  }
  return clauses.join(",");
}
