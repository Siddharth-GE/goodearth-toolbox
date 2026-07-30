const PALETTE = [
  "#0071E3",
  "#AF52DE",
  "#FF9500",
  "#34C759",
  "#FF2D55",
  "#30B0C7",
  "#5856D6",
] as const;

export function colorForName(name: string) {
  let hash = 0;
  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) % PALETTE.length;
  return PALETTE[hash];
}
