/**
 * Pure diff, matched on `line_key`, never row id: a copied line is a different row but the same line, which lets Budgets carry pricing forward.
 * Generic over the line shape and import-free, so it stays testable and out of the server-only chain.
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
  unchanged: number;
  entries: LineChange<L>[];
};

export function diffLines<L extends DiffableLine>(
  previousLines: L[],
  currentLines: L[],
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
