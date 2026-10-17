/**
 * The number a plot goes by, the way the Saarang tracker printed it:
 * Masters' code without its "P" ("P22-23" → "22-23"), else the name
 * without "Plot", "Villa" or "Unit". Set in monospace, it reads like a
 * surveyed lot. Shared because every tool that draws a lot card needs the
 * same number for the same plot (Client Relations moves onto this from
 * its own copy in lib/client-relations/next-steps.ts).
 */
export function plotNumber(code: string | null, name: string): string {
  const fromCode = code?.trim();
  if (fromCode) return /^P\d/i.test(fromCode) ? fromCode.slice(1) : fromCode;
  const fromName = name.replace(/^(plot|villa|unit)\s*/i, "").trim();
  return fromName || name;
}
