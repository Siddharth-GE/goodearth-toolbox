// The contract between the catalogue search endpoint
// (app/api/catalogue/route.ts) and the picker that calls it. Types only —
// no imports — so a Client Component can use it without dragging any
// server code into the browser bundle.

export type CatalogueItem = {
  id: string;
  code: string | null;
  name: string;
  /** Flattened from the brands embed by the route handler. */
  brand_name: string | null;
  thumb_url: string | null;
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
