/** Directory: where each person sits, its departments, and the admin's own card. */
import type { Field, Value } from "../catalogue-fields";
import { defineEntries } from "./define";

/** Directory's blood groups, as `BLOOD_GROUPS` in lib/directory/people.ts has them (a test holds the two together). */
export const BLOOD_GROUPS = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"] as const;

/**
 * A phone number as Directory stores it: typed punctuation stripped, one leading + kept. Restated
 * from `normalisePhone` in lib/directory/people.ts (a test holds the two together).
 */
export function storedPhone(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  const digits = trimmed.replace(/[^0-9]/g, "");
  if (!digits) return trimmed;
  return trimmed.startsWith("+") ? `+${digits}` : digits;
}

const department: Field = {
  key: "department_id",
  label: "Department",
  kind: "id",
  table: "staff_departments",
};

const anyOf =
  (keys: string[], ask: string) =>
  (values: Record<string, Value>): string | undefined =>
    keys.some((key) => key in values) ? undefined : ask;

export const DIRECTORY = defineEntries([
  {
    key: "directory_posting",
    tool: "/directory",
    title: "Where a person sits",
    description:
      "A person's department (a switched-on staff_departments), designation, who they report to (a person, never themselves) and the day they joined (not in the future). Empty clears one.",
    check: anyOf(
      ["department_id", "designation", "reports_to_id", "joined_on"],
      "Say what changes: the department, designation, who they report to or when they joined.",
    ),
    fields: [
      { key: "person_id", label: "Person", kind: "id", table: "profiles", record: true },
      { ...department, optional: true },
      { key: "designation", label: "Designation", kind: "text", optional: true, max: 60 },
      { key: "reports_to_id", label: "Reports to", kind: "id", table: "profiles", optional: true },
      { key: "joined_on", label: "Joined", kind: "date", optional: true },
    ],
  },
  {
    key: "directory_department_new",
    tool: "/directory",
    title: "A Directory department, added",
    description: "Adds a department people sit in (not Relay's departments, which tag trails).",
    adds: true,
    form: { file: "lib/directory/actions.ts", reader: "createDepartment" },
    fields: [{ key: "name", label: "Name", kind: "text", max: 40 }],
  },
  {
    key: "directory_department_change",
    tool: "/directory",
    title: "A Directory department, renamed or switched on or off",
    description:
      "Renames a Directory department or switches it off (no longer offered; never deleted, since past records name it) or back on.",
    check: anyOf(["name", "active"], "Say what changes: the name, or switched on or off."),
    fields: [
      { ...department, record: true },
      { key: "name", label: "Name", kind: "text", optional: true, keep: true, max: 40 },
      { key: "active", label: "Switched on", kind: "yesno", optional: true },
    ],
  },
  {
    key: "directory_my_details",
    tool: "/directory",
    title: "My own Directory card",
    description:
      "The admin's own card, never anyone else's: phone, date of birth, blood group, and who to call in an emergency (a number needs the name). Empty clears one.",
    check: anyOf(
      [
        "phone",
        "date_of_birth",
        "blood_group",
        "emergency_contact_name",
        "emergency_contact_phone",
      ],
      "Say what changes on your card.",
    ),
    fields: [
      { key: "phone", label: "Phone", kind: "text", optional: true, max: 20 },
      { key: "date_of_birth", label: "Date of birth", kind: "date", optional: true },
      {
        key: "blood_group",
        label: "Blood group",
        kind: "choice",
        optional: true,
        choices: BLOOD_GROUPS,
      },
      {
        key: "emergency_contact_name",
        label: "Emergency contact",
        kind: "text",
        optional: true,
        max: 80,
      },
      {
        key: "emergency_contact_phone",
        label: "Emergency number",
        kind: "text",
        optional: true,
        max: 20,
      },
    ],
  },
  {
    key: "directory_my_name",
    tool: "/directory",
    title: "My own name",
    description: "Corrects the admin's own name, as everyone in the toolbox sees it.",
    fields: [{ key: "full_name", label: "Name", kind: "text", max: 80 }],
  },
]);
