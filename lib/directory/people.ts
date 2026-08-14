/**
 * Validation and formatting for a directory card.
 *
 * Pure and dependency-free, so `npm test` can reach it and so both the
 * forms and the Server Actions run the SAME rule — the message a person
 * sees and the check the server applies cannot drift apart.
 *
 * The database CHECKs in 0060 are the backstop, not the UX. Everything a
 * person types passes through here first, which is what lets those
 * constraints be wide without the form being sloppy.
 */

/** The eight, in the same order as staff_details_blood_group_check. */
export const BLOOD_GROUPS = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"] as const;

export type BloodGroup = (typeof BLOOD_GROUPS)[number];

/** Matches setFullName in Settings, so a name has one limit everywhere. */
export const MAX_NAME_LENGTH = 80;
export const MAX_DESIGNATION_LENGTH = 60;
export const MAX_CONTACT_NAME_LENGTH = 80;

export function isBloodGroup(value: string): value is BloodGroup {
  return (BLOOD_GROUPS as readonly string[]).includes(value);
}

/**
 * Strips the punctuation people type and keeps at most one leading `+`.
 *
 * Returns null for blank — a cleared field is absent, not empty string,
 * which is what the nullable column wants.
 *
 * Anything that does not reduce to a plain number comes back UNCHANGED,
 * so the caller's validate step produces a sentence rather than this
 * silently mangling "call the office" into "".
 */
export function normalisePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const plus = trimmed.startsWith("+");
  const digits = trimmed.replace(/[^0-9]/g, "");
  if (!digits) return trimmed;

  return plus ? `+${digits}` : digits;
}

/** True if a normalised number is one the database will accept. */
export function isValidPhone(normalised: string): boolean {
  return /^\+?[0-9]{7,15}$/.test(normalised);
}

/**
 * Display only. Groups a plain ten-digit Indian mobile as "98765 43210"
 * and an +91 one the same way; leaves anything else exactly as stored,
 * because a landline or a foreign number grouped by that rule reads worse
 * than not grouped at all.
 */
export function formatPhone(value: string | null | undefined): string {
  if (!value) return "";
  const digits = value.replace(/^\+91/, "").replace(/^\+/, "");
  if (/^[0-9]{10}$/.test(digits)) return `${digits.slice(0, 5)} ${digits.slice(5)}`;
  return value;
}

export type MyDetailsInput = {
  phone: string | null;
  dateOfBirth: string | null;
  bloodGroup: string | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
};

/**
 * The five a person may edit themselves. Returns a sentence to show them,
 * or undefined.
 *
 * `today` is passed in rather than read, so this stays pure and the tests
 * can pin the clock. The caller supplies todayInIndia().
 */
export function validateMyDetails(input: MyDetailsInput, today: string): string | undefined {
  const phone = normalisePhone(input.phone);
  if (phone && !isValidPhone(phone)) {
    return "That phone number doesn't look right — use digits only, with an optional + and country code.";
  }

  const emergencyPhone = normalisePhone(input.emergencyContactPhone);
  if (emergencyPhone && !isValidPhone(emergencyPhone)) {
    return "That emergency number doesn't look right — use digits only, with an optional + and country code.";
  }

  // Mirrors staff_details_emergency_named_check, so the app says it
  // before the database has to. A number with nobody's name against it
  // is not an emergency contact.
  if (emergencyPhone && !input.emergencyContactName?.trim()) {
    return "Add the name of the person to call, not just the number.";
  }

  if (input.emergencyContactName && input.emergencyContactName.length > MAX_CONTACT_NAME_LENGTH) {
    return `Keep the emergency contact's name under ${MAX_CONTACT_NAME_LENGTH} characters.`;
  }

  if (input.bloodGroup && !isBloodGroup(input.bloodGroup)) {
    return "Pick a blood group from the list.";
  }

  if (input.dateOfBirth) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.dateOfBirth)) return "That date doesn't look right.";
    // Mirrors staff_details_guard(); the guard is the boundary, this is
    // the sentence someone actually reads.
    if (input.dateOfBirth >= today) return "That date of birth is in the future — check the year.";
    if (input.dateOfBirth <= "1900-01-01") return "That date of birth is too far back to be right.";
  }

  return undefined;
}

export function validateName(name: string): string | undefined {
  if (!name.trim()) return "Your name can't be blank.";
  if (name.trim().length > MAX_NAME_LENGTH) {
    return `Keep the name under ${MAX_NAME_LENGTH} characters.`;
  }
  return undefined;
}

export type PostingInput = {
  personId: string;
  departmentId: string | null;
  designation: string | null;
  reportsToId: string | null;
  joinedOn: string | null;
};

/** The four an admin sets. `today` again passed in, for the same reason. */
export function validatePosting(input: PostingInput, today: string): string | undefined {
  if (input.designation && input.designation.length > MAX_DESIGNATION_LENGTH) {
    return `Keep the designation under ${MAX_DESIGNATION_LENGTH} characters.`;
  }

  // Mirrors staff_details_self_report_check. The wider A -> B -> A case
  // is handled in org.ts, where it can be walked.
  if (input.reportsToId && input.reportsToId === input.personId) {
    return "Somebody can't report to themselves.";
  }

  if (input.joinedOn) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.joinedOn)) return "That date doesn't look right.";
    if (input.joinedOn > today) return "That joining date is in the future — check the year.";
  }

  return undefined;
}
