/**
 * The item domain's fixed value lists; the DB CHECKs are the enforcement, these are the app's copy for friendly messages.
 * Must stay import-free: "use server" action modules import these as values, and imports would drag a chain toward the client bundle.
 */

// Units of measure live in the `uoms` master (0082): see listActiveUomNames() and isActiveUom().

export const ITEM_KINDS = ["catalogue", "material"] as const;
export type ItemKind = (typeof ITEM_KINDS)[number];

export type Placement = "fixed" | "loose" | "soft_furnishing";

export function isItemKind(value: string): value is ItemKind {
  return (ITEM_KINDS as readonly string[]).includes(value);
}

// The CHECK on document_terms.kind enforces this; this is the app's copy.
export const TERMS_KINDS = ["po", "work_order"] as const;
export type TermsKind = (typeof TERMS_KINDS)[number];

export const TERMS_KIND_LABEL: Record<TermsKind, string> = {
  po: "Purchase orders",
  work_order: "Work orders",
};

export function isTermsKind(value: string): value is TermsKind {
  return (TERMS_KINDS as readonly string[]).includes(value);
}
