/**
 * Rules about the works vocabulary itself — pure, import-free, tested.
 *
 * The site team's list splits many works by floor: "Rough Plastering GF",
 * "… FF", "… above FF"; "Ground Floor Lintel Beam", "First Floor …"; or
 * the very same name under the Ground / First / Attic Floor groups. Each
 * floor's copy is priced the same way, so the rate book offers to copy a
 * rate onto its floor twins rather than make someone type it three times.
 */

const FLOOR_WORDS =
  /\b(above\s+ff|ground\s+floor|first\s+floor|second\s+floor|attic\s+floor|attic|gf|ff|sf)\b/g;

/** A work's name with the floor taken out — equal keys are floor twins. */
export function floorTwinKey(name: string): string {
  return name
    .toLowerCase()
    .replace(FLOOR_WORDS, " ")
    .replace(/[-–—]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** The other works that are this one on another floor. */
export function floorTwins<T extends { id: string; name: string }>(work: T, all: T[]): T[] {
  const key = floorTwinKey(work.name);
  if (!key) return [];
  return all.filter((other) => other.id !== work.id && floorTwinKey(other.name) === key);
}
