import "server-only";

import { getCurrentUser } from "@/lib/auth/dal";
import {
  createDepartment,
  renameDepartment,
  setDepartmentActive,
  updateMyDetails,
  updateMyName,
  updateStaffPosting,
} from "@/lib/directory/actions";

import { entryFor, formOf } from "../catalogue-fields";
import { storedPhone, type DIRECTORY } from "../entries/directory";
import { given, recordNow, type Runners, type Values } from "./kit";

type Failure = { error: string };

const POSTING = ["department_id", "designation", "reports_to_id", "joined_on"] as const;
const DETAILS = [
  "phone",
  "date_of_birth",
  "blood_group",
  "emergency_contact_name",
  "emergency_contact_phone",
] as const;

/** A pick the screen offers: switched on, or the one already there. */
async function offered(
  table: "staff_departments" | "profiles",
  id: string,
  now: unknown,
  what: string,
): Promise<Failure | null> {
  if (!id || id === now) return null;
  const row = await recordNow(table, { column: "id", id }, ["is_active"], `That ${what} is gone.`);
  if ("error" in row) return row;
  return row.row.is_active ? null : { error: `That ${what} is switched off.` };
}

const unchanged = (
  keys: readonly string[],
  next: Record<string, string>,
  now: Record<string, unknown>,
) => keys.every((key) => next[key] === String(now[key] ?? ""));

/** Each Directory entry, run through Directory's own action, as the admin. */
export const DIRECTORY_RUNNERS: Runners<(typeof DIRECTORY)[number]["key"]> = {
  directory_posting: async (v) => {
    const personId = String(v.person_id);
    const now = await recordNow(
      "staff_details",
      { column: "id", id: personId },
      [...POSTING],
      "That person has no card in Directory.",
    );
    if ("error" in now) return now;
    const next = Object.fromEntries(
      POSTING.map((key) => [key, given(v, key, now.row[key] as string | null)]),
    );
    const refused =
      (await offered(
        "staff_departments",
        next.department_id,
        now.row.department_id,
        "department",
      )) ??
      (await offered("profiles", next.reports_to_id, now.row.reports_to_id, "person's account"));
    if (refused) return refused;
    if (unchanged(POSTING, next, now.row)) return { error: "That is where they sit already." };
    return updateStaffPosting({
      personId,
      departmentId: next.department_id || null,
      designation: next.designation || null,
      reportsToId: next.reports_to_id || null,
      joinedOn: next.joined_on || null,
    });
  },
  directory_department_new: (v) => {
    const entry = entryFor("directory_department_new");
    return createDepartment(undefined, entry ? formOf(entry, v) : new FormData());
  },
  directory_department_change: async (v) => {
    const id = String(v.department_id);
    const now = await recordNow(
      "staff_departments",
      { column: "id", id },
      ["name", "is_active"],
      "That department is gone.",
    );
    if ("error" in now) return now;
    const rename = "name" in v && v.name !== now.row.name;
    const flip = "active" in v && v.active !== now.row.is_active;
    if (!rename && !flip) return { error: "That department is already like that." };
    if (rename) {
      const renamed = await renameDepartment(id, String(v.name));
      if (renamed?.error) return renamed;
    }
    if (flip) {
      const switched = await setDepartmentActive(id, v.active === true);
      if (switched?.error)
        return rename
          ? { error: `Renamed, but not switched ${v.active ? "on" : "off"}: ${switched.error}` }
          : switched;
    }
    return undefined;
  },
  directory_my_details: async (v) => {
    const me = await getCurrentUser();
    if (!me) return { error: "Sign in again." };
    const now = await recordNow(
      "staff_details",
      { column: "id", id: me.id },
      [...DETAILS],
      "You have no card in Directory yet.",
    );
    if ("error" in now) return now;
    const next = Object.fromEntries(
      DETAILS.map((key) => [key, given(v, key, now.row[key] as string | null)]),
    );
    // Compared as the card stores them, so a number written another way is no change.
    const stored = {
      ...next,
      phone: storedPhone(next.phone),
      emergency_contact_phone: storedPhone(next.emergency_contact_phone),
    };
    if (unchanged(DETAILS, stored, now.row)) return { error: "Your card already says that." };
    return updateMyDetails({
      phone: next.phone || null,
      dateOfBirth: next.date_of_birth || null,
      bloodGroup: next.blood_group || null,
      emergencyContactName: next.emergency_contact_name || null,
      emergencyContactPhone: next.emergency_contact_phone || null,
    });
  },
  directory_my_name: async (v: Values) => {
    const me = await getCurrentUser();
    if (!me) return { error: "Sign in again." };
    if (me.profile?.full_name === v.full_name) return { error: "That is your name already." };
    return updateMyName(String(v.full_name));
  },
};
