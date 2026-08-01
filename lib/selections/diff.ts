/**
 * What changed between two revisions — the pure decision, no database.
 *
 * Matched on `line_key`, never on row id: a line copied into the next
 * revision is a different row but the same line, which is exactly what
 * lets Budgets carry pricing forward instead of re-pricing everything
 * each time a revision is issued. This module exists apart from
 * queries.ts (which fetches the lines and calls it) so the rules can be
 * tested directly — it may import nothing.
 *
 * Generic over the line shape: the algorithm only needs the three fields
 * in DiffableLine, and staying generic keeps this file free of the
 * server-only import chain the full SelectionLineRow lives in.
 */

export type DiffableLine = {
  line_key: string;
  quantity: number;
  unit_space_id: string;
};

export type LineChange<L extends DiffableLine = DiffableLine> =
  | { kind: "added"; line: L; space: string }
  | { kind: "removed"; line: L; space: string }
  | {
      kind: "changed";
      line: L;
      previous: L;
      space: string;
      quantityChanged: boolean;
      spaceChanged: boolean;
    };

export type RevisionDiff<L extends DiffableLine = DiffableLine> = {
  added: number;
  removed: number;
  changed: number;
  /** Lines whose pricing carries over untouched — the budget team's number. */
  unchanged: number;
  entries: LineChange<L>[];
};

export function diffLines<L extends DiffableLine>(
  previousLines: L[],
  currentLines: L[],
  /** space id → label, for saying WHERE a change happened. */
  spaceLabel: Map<string, string>,
): RevisionDiff<L> {
  const previousByKey = new Map(previousLines.map((line) => [line.line_key, line]));
  const currentByKey = new Map(currentLines.map((line) => [line.line_key, line]));

  const entries: LineChange<L>[] = [];
  let unchanged = 0;

  for (const line of currentLines) {
    const previous = previousByKey.get(line.line_key);
    if (!previous) {
      entries.push({ kind: "added", line, space: spaceLabel.get(line.unit_space_id) ?? "—" });
      continue;
    }
    const quantityChanged = previous.quantity !== line.quantity;
    const spaceChanged = previous.unit_space_id !== line.unit_space_id;
    if (quantityChanged || spaceChanged) {
      entries.push({
        kind: "changed",
        line,
        previous,
        space: spaceLabel.get(line.unit_space_id) ?? "—",
        quantityChanged,
        spaceChanged,
      });
    } else {
      unchanged++;
    }
  }

  for (const line of previousLines) {
    if (!currentByKey.has(line.line_key)) {
      entries.push({ kind: "removed", line, space: spaceLabel.get(line.unit_space_id) ?? "—" });
    }
  }

  return {
    added: entries.filter((entry) => entry.kind === "added").length,
    removed: entries.filter((entry) => entry.kind === "removed").length,
    changed: entries.filter((entry) => entry.kind === "changed").length,
    unchanged,
    entries,
  };
}
