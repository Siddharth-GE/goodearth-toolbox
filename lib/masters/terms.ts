import "server-only";

import { fetchAll } from "@/lib/supabase/fetch-all";
import { createClient } from "@/lib/supabase/server";
import type { TermsKind } from "./constants";

/**
 * Named terms-and-conditions texts (0101), one default per kind. A new PO
 * or work order copies the default's text and is edited from there, so a
 * template changed later never rewrites a document already made.
 */
export type DocumentTermsRow = {
  id: string;
  kind: TermsKind;
  name: string;
  body: string;
  is_default: boolean;
  is_active: boolean;
  updated_at: string;
};

export async function listDocumentTerms(): Promise<DocumentTermsRow[]> {
  const supabase = await createClient();
  const data = await fetchAll((from, to) =>
    supabase
      .from("document_terms")
      .select("id, kind, name, body, is_default, is_active, updated_at")
      .order("kind")
      .order("name")
      .order("id")
      .range(from, to),
  );
  return data as DocumentTermsRow[];
}
