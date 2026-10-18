import "server-only";

import { requireTool } from "@/lib/auth/access";
import { requireUser } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import { fetchAll } from "@/lib/supabase/fetch-all";
import { assertRead } from "@/lib/supabase/read-failed";

import { todayInIndia } from "@/lib/format";
import { upcomingBirthdays } from "./birthdays";

/**
 * THERE IS NOT ONE PostgREST EMBED IN THIS FILE, AND THERE MUST NEVER BE ONE. staff_details has four FKs to profiles
 * (id, reports_to_id, created_by, updated_by) and staff_departments two, so a `profiles(...)` embed answers HTTP 300
 * (PGRST201) at runtime and nothing local catches it (BUGCATCHER). Read FLAT and merge through a Map.
 * Every export opens with requireTool("/directory") except getMyDetails, which needs only a session.
 * Queries throw and always check `error`: "nobody has a contact" and "we could not ask" mean opposite things.
 */

const GRANT = "/directory";

export const BIRTHDAY_WINDOW_DAYS = 30;

function fail(context: string, error: { message: string } | null): asserts error is null {
  assertRead("Directory", context, error);
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

/** Everyone's email, from the one function that can read auth.users without admin (0060 §6); its `where has_app('/directory')` is the whole boundary. */
async function emailMap(
  supabase: Awaited<ReturnType<typeof createClient>>,
): Promise<Map<string, string>> {
  const { data, error } = await supabase.rpc("directory_emails");
  fail("email addresses", error);
  return new Map((data ?? []).map((row) => [row.id, row.email]));
}

/** Everyone, merged: three complete reads and Maps beat DB filtering at fifty people. fetchAll on both tables, since a truncated roster shows a colleague as "not here". */
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
      // A card always exists (0060 §3 seeds it); the fallback covers the gap before the next backfill.
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

/** The roster. SEARCH IS A NODE FILTER: it spans full_name, designation and an RPC-only email, which no single `or` can see. Fine at 200 people; rethink past ~1,000 (PLAN.md). Returns { people, total } for "N of M". */
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

/** One person's card plus who they report to (marked if deactivated, so the line never vanishes) and who reports to them. */
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

/** The signed-in person's own card. requireUser() ONLY: the `or id = auth.uid()` half of the SELECT policy (0060 §5) makes it work, so losing the grant never locks anyone out of their own card. */
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

  // The company-owned half is shown read-only so nobody wonders where their department is; flat reads, no embeds.
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
    // Their own address is on the session; no need for directory_emails().
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

/** The admin's reports-to dropdown: active people PLUS the current pick even if deactivated, or saving any other field would clear their reporting line. */
export async function listPeopleOptions(
  currentId?: string | null,
): Promise<{ id: string; name: string; isActive: boolean }[]> {
  await requireTool(GRANT);
  const everyone = await readEveryone();
  return everyone
    .filter((person) => person.isActive || person.id === currentId)
    .map((person) => ({ id: person.id, name: person.name, isActive: person.isActive }));
}

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
