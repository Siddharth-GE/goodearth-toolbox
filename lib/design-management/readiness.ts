/**
 * Is this draft transmittal ready to issue? Said BEFORE the press. A mirror, not the rule: issue_transmittal (0093, widened by 0124) decides and its refusal still reaches the screen.
 * It reads the same three conditions in the same order so the page and the database never name different problems: no drawings; the first line with neither a WorkDrive link nor an uploaded sheet;
 * the first DRAFT line past R0 with no note saying what changed. Pure and import-free.
 */

export type ReadinessLine = {
  setName: string;
  revisionNo: number;
  revisionStatus: "draft" | "released" | "superseded";
  fileCount: number;
  hasLink: boolean;
  note: string | null;
};

export type Readiness = { ready: true; problem: null } | { ready: false; problem: string };

export function transmittalReadiness(lines: ReadinessLine[]): Readiness {
  if (lines.length === 0) {
    return { ready: false, problem: "Add at least one drawing before issuing." };
  }

  const missingDrawings = lines.find((line) => line.fileCount === 0 && !line.hasLink);
  if (missingDrawings) {
    return {
      ready: false,
      problem: `"${missingDrawings.setName}" R${missingDrawings.revisionNo} has no WorkDrive link yet.`,
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
