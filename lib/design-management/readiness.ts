/**
 * Is this draft transmittal ready to issue? The screen's answer, said
 * BEFORE the press (2026-09-27 audit: Issue was trial and error, its
 * refusal a line of small print in the header).
 *
 * A mirror, not the rule. `issue_transmittal` (0093) decides, and its
 * refusal still reaches the screen verbatim; this only reads the same
 * three conditions off data the page already has, in the same order, so
 * the line under the title and the database never name different
 * problems:
 *
 *   1. no drawings at all;
 *   2. the first line, in sheet order, with no file — a re-sent released
 *      revision included;
 *   3. the first DRAFT line past R0 with no note saying what changed.
 *
 * Pure and import-free, so `npm test` pins it without a database.
 */

export type ReadinessLine = {
  setName: string;
  revisionNo: number;
  revisionStatus: "draft" | "released" | "superseded";
  fileCount: number;
  note: string | null;
};

export type Readiness = { ready: true; problem: null } | { ready: false; problem: string };

export function transmittalReadiness(lines: ReadinessLine[]): Readiness {
  if (lines.length === 0) {
    return { ready: false, problem: "Add at least one drawing before issuing." };
  }

  const missingFile = lines.find((line) => line.fileCount === 0);
  if (missingFile) {
    return {
      ready: false,
      problem: `"${missingFile.setName}" R${missingFile.revisionNo} has no sheet yet.`,
    };
  }

  const missingNote = lines.find(
    (line) => line.revisionStatus === "draft" && line.revisionNo >= 1 && !(line.note ?? "").trim(),
  );
  if (missingNote) {
    return {
      ready: false,
      problem: `"${missingNote.setName}" R${missingNote.revisionNo} needs a note saying what changed.`,
    };
  }

  return { ready: true, problem: null };
}
