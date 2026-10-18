import "server-only";

import { fetchAll } from "@/lib/supabase/fetch-all";
import { createClient } from "@/lib/supabase/server";
import type { TermsKind } from "./constants";

/** A new PO or work order copies the default's text, so changing a template never rewrites an existing document. */
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

export type TermsTemplate = { id: string; name: string; body: string; is_default: boolean };

export async function listActiveTerms(kind: TermsKind): Promise<TermsTemplate[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("document_terms")
    .select("id, name, body, is_default")
    .eq("kind", kind)
    .eq("is_active", true)
    .order("is_default", { ascending: false })
    .order("name")
    .order("id");
  if (error) throw error;
  return data;
}

export async function getDefaultTerms(kind: TermsKind): Promise<string | null> {
  const templates = await listActiveTerms(kind);
  return templates[0]?.is_default ? templates[0].body : null;
}
