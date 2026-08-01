/**
 * The item domain's fixed value lists, declared exactly once.
 *
 * These were previously re-declared in three files each (the database
 * CHECK constraints in 0004/0006 are the real enforcement; these are the
 * app's copy for friendly validation messages), which meant a new unit of
 * measure had to be added in three places or Selections and Masters would
 * disagree about what's valid.
 *
 * This file must stay import-free: file-level "use server" action modules
 * import these as VALUES, and a module with imports would drag its chain
 * toward the client bundle (see CLAUDE.md, "Shared masters"). That
 * constraint is why these live here and not in items.ts, which is
 * "server-only".
 */

export const UOMS = ["each", "rft", "sqft", "lumpsum", "bag", "kg", "litre", "cft"] as const;
export type Uom = (typeof UOMS)[number];

export const ITEM_KINDS = ["catalogue", "material"] as const;
export type ItemKind = (typeof ITEM_KINDS)[number];

export type Placement = "fixed" | "loose" | "soft_furnishing";

export function isUom(value: string): value is Uom {
  return (UOMS as readonly string[]).includes(value);
}

export function isItemKind(value: string): value is ItemKind {
  return (ITEM_KINDS as readonly string[]).includes(value);
}
