// Which villa or project a space is for, from its name. Wrong is worse than silent (a space linked
// to Villa 1 when it means Villa 12 scopes every command wrongly), so the rule is literal;
// anything unsettled is "ambiguous" or "none" and /link fixes it. Imports nothing.

export type MatchUnit = { id: string; name: string; code: string | null; projectId: string };

export type MatchProject = { id: string; name: string; code: string | null };

export type SpaceMatch =
  | { kind: "unit"; unitId: string; projectId: string }
  | { kind: "project"; projectId: string }
  | { kind: "ambiguous"; count: number }
  | { kind: "none" };

function tokens(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

function isRunOf(needle: string[], haystack: string[]): boolean {
  if (needle.length === 0 || needle.length > haystack.length) return false;
  for (let start = 0; start + needle.length <= haystack.length; start += 1) {
    if (needle.every((word, offset) => word === haystack[start + offset])) return true;
  }
  return false;
}

// One name's words must be a contiguous run of the other's, either direction ("Saarang Villa 12"
// contains a villa's name; "Villa" fronts many and is ambiguous). Contiguity keeps "Villa 12"
// away from "Villa 1". A code matches when it equals one whole word of the space's name.
function matchesName(spaceTokens: string[], name: string, code: string | null): boolean {
  const nameTokens = tokens(name);
  if (isRunOf(nameTokens, spaceTokens) || isRunOf(spaceTokens, nameTokens)) return true;

  const codeToken = tokens(code ?? "").join("");
  return codeToken !== "" && spaceTokens.includes(codeToken);
}

// Villas first, since a villa-named space also names its project. Exactly one hit wins; several is ambiguous.
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

export function unitLabel(projectName: string, unitName: string): string {
  return `${projectName} · ${unitName}`;
}

export function projectLabel(projectName: string): string {
  return `${projectName} (whole project)`;
}

export const NO_LINK_VALUE = "none";

export const NO_LINK_TEXT = "Not linked — commands here span everything";

export type LinkTargetRow = { value: string; text: string };

/** Villa numbers sort as numbers, so Villa 2 comes before Villa 12. */
function byLabel(a: string, b: string): number {
  return a.localeCompare(b, "en", { numeric: true, sensitivity: "base" });
}

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

// Never a whole project (a new trail starts on one villa). A unit whose project is missing from
// the read is left out.
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

// Null for anything the door didn't put in the list (stale or mangled).
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
