/** Pure rules about the works vocabulary. Many works split by floor with the same price, so the rate book offers to copy a rate onto floor twins. */

const FLOOR_WORDS =
  /\b(above\s+ff|ground\s+floor|first\s+floor|second\s+floor|attic\s+floor|attic|gf|ff|sf)\b/g;

export function floorTwinKey(name: string): string {
  return name
    .toLowerCase()
    .replace(FLOOR_WORDS, " ")
    .replace(/[-–—]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function floorTwins<T extends { id: string; name: string }>(work: T, all: T[]): T[] {
  const key = floorTwinKey(work.name);
  if (!key) return [];
  return all.filter((other) => other.id !== work.id && floorTwinKey(other.name) === key);
}
