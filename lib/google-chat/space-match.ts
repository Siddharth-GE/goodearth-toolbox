/**
 * Working out which villa or project a chat space is for, from its
 * name — and the plain labels and dropdown values that go with it.
 *
 * People name a site space after the thing it is about ("Saarang Villa
 * 12", "Villa 12 - site chat", "V12 updates"), so when the bot joins it
 * can usually answer that question itself. Getting it wrong is worse
 * than not answering: a space quietly linked to Villa 1 when it means
 * Villa 12 would scope every later command to the wrong villa. So the
 * rule below is deliberately literal, and anything it can't settle
 * confidently ends as "ambiguous" or "none" — the bot says so and /link
 * fixes it by hand.
 *
 * This file may import nothing: it is names and string handling, and
 * every example in the plan is pinned by space-match.test.ts.
 */

/** A villa, as much of it as the matching needs. */
export type MatchUnit = { id: string; name: string; code: string | null; projectId: string };

/** A project, as much of it as the matching needs. */
export type MatchProject = { id: string; name: string; code: string | null };

export type SpaceMatch =
  | { kind: "unit"; unitId: string; projectId: string }
  | { kind: "project"; projectId: string }
  /** Several candidates fit, so none of them is the answer. */
  | { kind: "ambiguous"; count: number }
  | { kind: "none" };

/** Lower-case words and numbers, with everything else treated as a gap. */
function tokens(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

/** Is `needle` the same run of words, in order, somewhere inside `haystack`? */
function isRunOf(needle: string[], haystack: string[]): boolean {
  if (needle.length === 0 || needle.length > haystack.length) return false;
  for (let start = 0; start + needle.length <= haystack.length; start += 1) {
    if (needle.every((word, offset) => word === haystack[start + offset])) return true;
  }
  return false;
}

/**
 * Does this candidate's name meet the space's name?
 *
 * One name's words must appear as a contiguous run of the other's — in
 * either direction, because both halves happen in real life: "Saarang
 * Villa 12" contains the villa's whole name, while a space simply
 * called "Villa" is the front of many villa names at once (and is
 * therefore ambiguous, not a match for the first one found). Contiguity
 * is what keeps "Saarang Villa 12" away from "Villa 1": the words
 * "villa" and "1" never sit next to each other there.
 *
 * A code is different — it is already unique and short, so it matches
 * when it equals one whole word of the space's name ("V12 updates").
 */
function matchesName(spaceTokens: string[], name: string, code: string | null): boolean {
  const nameTokens = tokens(name);
  if (isRunOf(nameTokens, spaceTokens) || isRunOf(spaceTokens, nameTokens)) return true;

  const codeToken = tokens(code ?? "").join("");
  return codeToken !== "" && spaceTokens.includes(codeToken);
}

/**
 * The space's display name against every villa, then every project.
 * Villas are tried first because a space named after a villa also names
 * its project; exactly one hit wins, several is ambiguous, and nothing
 * at all falls through to the projects the same way.
 */
export function matchSpaceName(
  displayName: string,
  units: MatchUnit[],
  projects: MatchProject[],
): SpaceMatch {
  const spaceTokens = tokens(displayName ?? "");
  if (spaceTokens.length === 0) return { kind: "none" };

  const unitHits = units.filter((unit) => matchesName(spaceTokens, unit.name, unit.code));
  if (unitHits.length === 1) {
    return { kind: "unit", unitId: unitHits[0].id, projectId: unitHits[0].projectId };
  }
  if (unitHits.length > 1) return { kind: "ambiguous", count: unitHits.length };

  const projectHits = projects.filter((project) =>
    matchesName(spaceTokens, project.name, project.code),
  );
  if (projectHits.length === 1) return { kind: "project", projectId: projectHits[0].id };
  if (projectHits.length > 1) return { kind: "ambiguous", count: projectHits.length };

  return { kind: "none" };
}

/** How a linked villa reads everywhere the bot mentions it. */
export function unitLabel(projectName: string, unitName: string): string {
  return `${projectName} · ${unitName}`;
}

/** How a whole-project link reads everywhere the bot mentions it. */
export function projectLabel(projectName: string): string {
  return `${projectName} (whole project)`;
}

/** The dropdown value, and the stored choice, that mean "not linked". */
export const NO_LINK_VALUE = "none";

/** The first row of the /link dropdown, in the founder's words. */
export const NO_LINK_TEXT = "Not linked — commands here span everything";

/** One row of the /link dropdown: a value the door understands, and its label. */
export type LinkTargetRow = { value: string; text: string };

/** Villa numbers sort as numbers, so Villa 2 comes before Villa 12. */
function byLabel(a: string, b: string): number {
  return a.localeCompare(b, "en", { numeric: true, sensitivity: "base" });
}

/**
 * Every row of the /link dropdown, in the order people read them:
 * "not linked" first, then each project as a whole, then every villa
 * under its project's name. About fifty rows today — one flat list, no
 * dependent dropdowns.
 */
export function linkTargetRows(projects: MatchProject[], units: MatchUnit[]): LinkTargetRow[] {
  const projectNames = new Map(projects.map((project) => [project.id, project.name]));

  const projectRows = projects
    .map((project) => ({ value: `project:${project.id}`, text: projectLabel(project.name) }))
    .sort((a, b) => byLabel(a.text, b.text));

  const unitRows = units
    .map((unit) => ({
      value: `unit:${unit.id}`,
      text: unitLabel(projectNames.get(unit.projectId) ?? "", unit.name).trim(),
    }))
    .sort((a, b) => byLabel(a.text, b.text));

  return [{ value: NO_LINK_VALUE, text: NO_LINK_TEXT }, ...projectRows, ...unitRows];
}

/**
 * Every villa, as a plain dropdown row — the /newtrail dialog's "Which
 * house" picker, which unlike /link's dropdown never offers a whole
 * project (a new trail always starts on one villa). A unit whose project
 * went missing from the read that fed this (deleted between the two
 * queries, in practice never) is left out rather than shown with a blank
 * project name.
 */
export function unitRows(projects: MatchProject[], units: MatchUnit[]): LinkTargetRow[] {
  const projectNames = new Map(projects.map((project) => [project.id, project.name]));

  return units
    .filter((unit) => projectNames.has(unit.projectId))
    .map((unit) => ({
      value: unit.id,
      text: unitLabel(projectNames.get(unit.projectId) ?? "", unit.name),
    }))
    .sort((a, b) => byLabel(a.text, b.text));
}

/**
 * The submitted dropdown value, read back. Null for anything the door
 * didn't put in the list — a stale dialog, or a value that arrived
 * mangled — which the door treats as "I couldn't save that".
 */
export function parseLinkValue(
  value: string | null,
): { kind: "none" } | { kind: "project"; id: string } | { kind: "unit"; id: string } | null {
  if (!value) return null;
  if (value === NO_LINK_VALUE) return { kind: "none" };
  if (value.startsWith("project:")) {
    const id = value.slice("project:".length).trim();
    return id ? { kind: "project", id } : null;
  }
  if (value.startsWith("unit:")) {
    const id = value.slice("unit:".length).trim();
    return id ? { kind: "unit", id } : null;
  }
  return null;
}
