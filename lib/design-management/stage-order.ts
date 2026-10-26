/** The design stages' order, pure: the board's columns run in it (0126), so a stage is placed, never only appended. */

/** Where a new stage goes: "start", "end", or the id of the stage it follows. */
export function placeStage(ids: readonly string[], id: string, after: string): string[] {
  const rest = ids.filter((other) => other !== id);
  if (after === "start") return [id, ...rest];
  const at = rest.indexOf(after);
  if (at === -1) return [...rest, id];
  return [...rest.slice(0, at + 1), id, ...rest.slice(at + 1)];
}

/** A dragged stage dropped on another lands where that one was: above it when moving up, below it when moving down. */
export function dropStage(ids: readonly string[], id: string, onto: string): string[] {
  const from = ids.indexOf(id);
  const to = ids.indexOf(onto);
  if (from === -1 || to === -1 || from === to) return [...ids];
  const next = ids.filter((other) => other !== id);
  next.splice(to, 0, id);
  return next;
}

/** Steps of 10, first stage 10: only the rows whose number changes need a write. */
export function renumber(
  ids: readonly string[],
  current: ReadonlyMap<string, number>,
): { id: string; sortOrder: number }[] {
  return ids
    .map((id, index) => ({ id, sortOrder: (index + 1) * 10 }))
    .filter(({ id, sortOrder }) => current.get(id) !== sortOrder);
}

/** The order a person sent names exactly the stages there are, each once. */
export function sameStages(sent: readonly string[], stored: readonly string[]): boolean {
  if (sent.length !== stored.length || new Set(sent).size !== sent.length) return false;
  const known = new Set(stored);
  return sent.every((id) => known.has(id));
}
