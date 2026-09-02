import "server-only";

import { requireTool } from "@/lib/auth/access";
import { requireUser } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import { fetchAll } from "@/lib/supabase/fetch-all";

import { todayInIndia, upcomingBirthdays } from "./birthdays";

/**
 * Reads for the Directory.
 *
 * ┌──────────────────────────────────────────────────────────────────┐
 * │ THERE IS NOT ONE PostgREST EMBED IN THIS FILE, AND THERE MUST    │
 * │ NEVER BE ONE.                                                    │
 * │                                                                  │
 * │ staff_details has FOUR foreign keys to profiles — id,            │
 * │ reports_to_id, created_by, updated_by — and staff_departments    │
 * │ has two. Any `profiles(...)` embed from either is ambiguous and  │
 * │ answers HTTP 300 (PGRST201) at runtime. Nothing local catches    │
 * │ it: not a type error, `next build` compiles it, the tests have   │
 * │ no database. Client Relations shipped four dead screens through  │
 * │ a fully green CI exactly this way.                               │
 * │                                                                  │
 * │ So everything here reads FLAT and merges through a Map. At fifty │
 * │ rows that is also faster than the join. Naming the key would     │
 * │ work too; not embedding at all cannot be got wrong.              │
 * └──────────────────────────────────────────────────────────────────┘
 *
 * Every export opens with requireTool("/directory") — with one deliberate
 * exception, getMyDetails, which needs only a session. See its comment.
 *
 * Queries may throw; a failed read has no partial answer worth showing.
 * `error` is checked explicitly everywhere, never just `data`: an empty
 * result and a failed read mean opposite things, and here the difference
 * is "nobody has an emergency contact" versus "we could not ask".
 */

const GRANT = "/directory";

/** How far ahead the birthday list looks, unless a caller says otherwise. */
export const BIRTHDAY_WINDOW_DAYS = 30;

function fail(context: string, error: { message: string } | null): void {
  if (error) {
    console.error(`Directory read failed (${context}):`, error);
    throw new Error(`Could not load ${context}: ${error.message}`, { cause: error });
  }
}

export type DirectoryPerson = {
  id: string;
  name: string;
  email: string | null;
  isActive: boolean;
  isAdmin: boolean;
  phone: string | null;
  designation: string | null;
  departmentId: string | null;
  departmentName: string | null;
  reportsToId: string | null;
  joinedOn: string | null;
  dateOfBirth: string | null;
  bloodGroup: string | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  photoPath: string | null;
};

export type DepartmentRow = {
  id: string;
  name: string;
  isActive: boolean;
  sortOrder: number;
  people: number;
};

/**
 * Everyone's email, from the one function that can read auth.users
 * without being an admin (0060 §6). Its `where has_app('/directory')` is
 * the entire permission boundary — this is the only call site.
 */
async function emailMap(
  supabase: Awaited<ReturnType<typeof createClient>>,
): Promise<Map<string, string>> {
  const { data, error } = await supabase.rpc("directory_emails");
  fail("email addresses", error);
  return new Map((data ?? []).map((row) => [row.id, row.email]));
}

/**
 * Everyone, merged. The one read the screens share, because at fifty
 * people three complete reads and two Maps beat any amount of filtering
 * in the database — and search has to span all three sources anyway.
 *
 * fetchAll on both tables: this must be COMPLETE. A truncated roster
 * renders a real colleague as "not here", which is the one answer a
 * directory must never give.
 */
async function readEveryone(): Promise<DirectoryPerson[]> {
  const supabase = await createClient();

  const [people, cards, departments, emails] = await Promise.all([
    fetchAll((from, to) =>
      supabase
        .from("profiles")
        .select("id, full_name, role, is_active")
        .order("id")
        .range(from, to),
    ),
    fetchAll((from, to) => supabase.from("staff_details").select("*").order("id").range(from, to)),
    fetchAll((from, to) =>
      supabase.from("staff_departments").select("id, name").order("id").range(from, to),
    ),
    emailMap(supabase),
  ]);

  const cardById = new Map(cards.map((card) => [card.id, card]));
  const departmentById = new Map(departments.map((row) => [row.id, row.name]));

  return people
    .map((person): DirectoryPerson => {
      // A card always exists — profiles_seed_staff_details (0060 §3)
      // creates one with the account. The fallback is for the seconds
      // between a hand-made profile row and the next backfill.
      const card = cardById.get(person.id);
      return {
        id: person.id,
        name: person.full_name?.trim() || "Unnamed",
        email: emails.get(person.id) ?? null,
        isActive: person.is_active,
        isAdmin: person.role === "admin",
        phone: card?.phone ?? null,
        designation: card?.designation ?? null,
        departmentId: card?.department_id ?? null,
        departmentName: card?.department_id
          ? (departmentById.get(card.department_id) ?? null)
          : null,
        reportsToId: card?.reports_to_id ?? null,
        joinedOn: card?.joined_on ?? null,
        dateOfBirth: card?.date_of_birth ?? null,
        bloodGroup: card?.blood_group ?? null,
        emergencyContactName: card?.emergency_contact_name ?? null,
        emergencyContactPhone: card?.emergency_contact_phone ?? null,
        photoPath: card?.photo_path ?? null,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Headline counts for the welcome screen. Counts only — there is no money
 * anywhere in this tool, so that rule is free here, but the birthday count
 * still reads dates rather than guessing.
 */
export async function getWelcomeCounts(): Promise<{
  people: number;
  departments: number;
  birthdaysSoon: number;
}> {
  await requireTool(GRANT);
  const supabase = await createClient();

  const [people, departments, birthdays] = await Promise.all([
    supabase.from("profiles").select("id", { count: "exact", head: true }).eq("is_active", true),
    supabase
      .from("staff_departments")
      .select("id", { count: "exact", head: true })
      .eq("is_active", true),
    supabase.from("staff_details").select("date_of_birth"),
  ]);

  fail("the people count", people.error);
  fail("the department count", departments.error);
  fail("birthdays", birthdays.error);

  const soon = upcomingBirthdays(
    (birthdays.data ?? []).map((row) => ({ dateOfBirth: row.date_of_birth })),
    todayInIndia(),
    BIRTHDAY_WINDOW_DAYS,
  );

  return {
    people: people.count ?? 0,
    departments: departments.count ?? 0,
    birthdaysSoon: soon.length,
  };
}

export type PeopleFilters = {
  search?: string;
  departmentId?: string;
  includeInactive?: boolean;
};

/**
 * The roster.
 *
 * SEARCH IS A NODE FILTER, not a database one, and deliberately: it spans
 * profiles.full_name, staff_details.designation and an email that only
 * exists behind an RPC, so no single `or` filter can see all three. Honest
 * at fifty people and fine at 200 — the size this app is built for. Past
 * ~1,000 it needs rethinking; PLAN.md says so rather than pretending.
 *
 * Returns { people, total } so a screen can say "N of M" from the real
 * roster rather than rows.length.
 */
export async function listPeople(
  filters: PeopleFilters = {},
): Promise<{ people: DirectoryPerson[]; total: number }> {
  await requireTool(GRANT);
  const everyone = await readEveryone();

  const roster = filters.includeInactive ? everyone : everyone.filter((person) => person.isActive);

  const needle = filters.search?.trim().toLowerCase();
  const people = roster.filter((person) => {
    if (filters.departmentId && person.departmentId !== filters.departmentId) return false;
    if (!needle) return true;
    return [person.name, person.designation, person.email, person.departmentName, person.phone]
      .filter(Boolean)
      .some((field) => field!.toLowerCase().includes(needle));
  });

  return { people, total: roster.length };
}

/**
 * One person's card, plus the two things that only make sense in context:
 * who they report to (marked when that person has been deactivated, so a
 * reporting line never silently vanishes) and who reports to them.
 */
export async function getPerson(personId: string): Promise<{
  person: DirectoryPerson;
  reportsTo: { id: string; name: string; isActive: boolean } | null;
  directReports: { id: string; name: string; isActive: boolean }[];
} | null> {
  await requireTool(GRANT);
  const everyone = await readEveryone();

  const person = everyone.find((row) => row.id === personId);
  if (!person) return null;

  const manager = person.reportsToId
    ? (everyone.find((row) => row.id === person.reportsToId) ?? null)
    : null;

  return {
    person,
    reportsTo: manager && { id: manager.id, name: manager.name, isActive: manager.isActive },
    directReports: everyone
      .filter((row) => row.reportsToId === personId)
      .map((row) => ({ id: row.id, name: row.name, isActive: row.isActive })),
  };
}

/**
 * The signed-in person's own card.
 *
 * requireUser() ONLY, not requireTool. The `or id = auth.uid()` half of
 * staff_details' single SELECT policy (0060 §5) is what makes this work,
 * and it is deliberate: losing the /directory grant must never lock
 * somebody out of correcting their own phone number.
 */
export async function getMyDetails(): Promise<{
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  dateOfBirth: string | null;
  bloodGroup: string | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  photoPath: string | null;
  designation: string | null;
  departmentName: string | null;
  joinedOn: string | null;
  reportsToName: string | null;
}> {
  const user = await requireUser();
  const supabase = await createClient();

  const { data: card, error } = await supabase
    .from("staff_details")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();
  fail("your details", error);

  // The company-owned half is read-only here, but it is SHOWN — someone
  // who cannot see their own department just asks why it is missing.
  // Both lookups are separate flat reads; see the no-embeds rule above.
  const [department, manager] = await Promise.all([
    card?.department_id
      ? supabase.from("staff_departments").select("name").eq("id", card.department_id).maybeSingle()
      : null,
    card?.reports_to_id
      ? supabase.from("profiles").select("full_name").eq("id", card.reports_to_id).maybeSingle()
      : null,
  ]);
  if (department) fail("your department", department.error);
  if (manager) fail("who you report to", manager.error);
  const departmentName = department?.data?.name ?? null;
  const reportsToName = manager?.data?.full_name ?? null;

  return {
    id: user.id,
    name: user.profile?.full_name?.trim() || "",
    // Their own address is already on the session — no need to call
    // directory_emails(), which they may not even be granted.
    email: user.email ?? null,
    phone: card?.phone ?? null,
    dateOfBirth: card?.date_of_birth ?? null,
    bloodGroup: card?.blood_group ?? null,
    emergencyContactName: card?.emergency_contact_name ?? null,
    emergencyContactPhone: card?.emergency_contact_phone ?? null,
    photoPath: card?.photo_path ?? null,
    designation: card?.designation ?? null,
    departmentName,
    joinedOn: card?.joined_on ?? null,
    reportsToName,
  };
}

/** The department list, with how many people sit in each. */
export async function listDepartments(includeInactive = false): Promise<DepartmentRow[]> {
  await requireTool(GRANT);
  const supabase = await createClient();

  const [departments, cards] = await Promise.all([
    fetchAll((from, to) =>
      supabase
        .from("staff_departments")
        .select("id, name, is_active, sort_order")
        .order("sort_order")
        .order("id")
        .range(from, to),
    ),
    fetchAll((from, to) =>
      supabase
        .from("staff_details")
        .select("id, department_id")
        .not("department_id", "is", null)
        .order("id")
        .range(from, to),
    ),
  ]);

  const headcount = new Map<string, number>();
  for (const card of cards) {
    if (card.department_id) {
      headcount.set(card.department_id, (headcount.get(card.department_id) ?? 0) + 1);
    }
  }

  return departments
    .filter((row) => includeInactive || row.is_active)
    .map((row) => ({
      id: row.id,
      name: row.name,
      isActive: row.is_active,
      sortOrder: row.sort_order,
      people: headcount.get(row.id) ?? 0,
    }));
}

/**
 * The admin's reports-to dropdown.
 *
 * Active people PLUS whoever is currently selected, even if they have
 * been deactivated. Without that second half, saving any OTHER field on
 * that person clears their reporting line without anyone touching it.
 */
export async function listPeopleOptions(
  currentId?: string | null,
): Promise<{ id: string; name: string; isActive: boolean }[]> {
  await requireTool(GRANT);
  const everyone = await readEveryone();
  return everyone
    .filter((person) => person.isActive || person.id === currentId)
    .map((person) => ({ id: person.id, name: person.name, isActive: person.isActive }));
}

/** Whose birthday is coming up, soonest first. Active people only. */
export async function listBirthdays(
  windowDays = BIRTHDAY_WINDOW_DAYS,
): Promise<(DirectoryPerson & { daysAway: number })[]> {
  await requireTool(GRANT);
  const everyone = await readEveryone();
  return upcomingBirthdays(
    everyone.filter((person) => person.isActive),
    todayInIndia(),
    windowDays,
  );
}
