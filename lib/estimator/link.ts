/**
 * The material↔item unit translation, and nothing else.
 *
 * Pure and import-free, like calc.ts. An estimator material may link to
 * the catalogue item it is bought and issued as (0076), and the two
 * sides may measure in different units — sand estimated in cum, bought
 * in cft. This module is the ONE place that decides what quantity a
 * material's figure becomes on the procurement side.
 *
 * THE RULE: conversion never happens silently. Matching unit labels
 * convert 1:1; a person-entered factor converts by that factor; and
 * with neither, the answer is "needsFactor" — the screens show the
 * estimate figure as reference and a person types the procurement
 * quantity. Guessing would put a wrong number on an indent.
 */

export type ConvertResult = { qty: number } | { needsFactor: true };

/**
 * How much of the linked item one material-side quantity is.
 *
 * `factor` means: one <materialUom> = factor × <itemUom> (the 0076
 * column comment, restated). Unit labels compare case-insensitively —
 * 'Cft' and 'cft' are the same unit typed by different hands.
 */
export function convertToItemUom(
  qty: number,
  materialUom: string,
  itemUom: string,
  factor: number | null,
): ConvertResult {
  if (factor !== null && factor > 0) return { qty: qty * factor };
  if (sameUom(materialUom, itemUom)) return { qty };
  return { needsFactor: true };
}

/** 'nos' and 'each' are one unit under two conventions — the estimator
 * seeded 'nos' (0075) while procurement's CHECK says 'each'; treating
 * them as different would demand a factor of 1 from every counted item. */
export function sameUom(a: string, b: string): boolean {
  const canon = (u: string) => {
    const t = u.trim().toLowerCase();
    return t === "nos" ? "each" : t;
  };
  return canon(a) === canon(b);
}
