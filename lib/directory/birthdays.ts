/**
 * Birthday arithmetic for the Directory. Pure; every function takes `today` so tests pin the clock.
 * THE YEAR IS NEVER DISPLAYED and nothing computes an age: a decision in the tool's PLAN.md.
 */

type IsoDate = string;

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

function parts(iso: IsoDate): { year: number; month: number; day: number } {
  const [year, month, day] = iso.split("-").map(Number);
  return { year, month, day };
}

/** Days between two ISO dates, working in UTC so no local offset creeps in. */
function daysBetween(from: IsoDate, to: IsoDate): number {
  const a = parts(from);
  const b = parts(to);
  const DAY = 24 * 60 * 60 * 1000;
  return Math.round(
    (Date.UTC(b.year, b.month - 1, b.day) - Date.UTC(a.year, a.month - 1, a.day)) / DAY,
  );
}

/** Next occurrence on or after today. 29 February in a non-leap year lands on 1 March (Date.UTC does this), so the birthday doesn't vanish. */
export function nextBirthday(dob: IsoDate, today: IsoDate): IsoDate {
  const born = parts(dob);
  const now = parts(today);

  for (const year of [now.year, now.year + 1]) {
    const candidate = new Date(Date.UTC(year, born.month - 1, born.day));
    const iso = candidate.toISOString().slice(0, 10);
    if (daysBetween(today, iso) >= 0) return iso;
  }

  // Unreachable — next year's occurrence is always ahead of today.
  return today;
}

export function daysUntilBirthday(dob: IsoDate, today: IsoDate): number {
  return daysBetween(today, nextBirthday(dob, today));
}

/** Birthdays in the next windowDays, soonest first. No date of birth means dropped, not sorted last. */
export function upcomingBirthdays<T extends { dateOfBirth: string | null }>(
  people: T[],
  today: IsoDate,
  windowDays: number,
): (T & { daysAway: number })[] {
  return people
    .filter((person): person is T & { dateOfBirth: string } => Boolean(person.dateOfBirth))
    .map((person) => ({ ...person, daysAway: daysUntilBirthday(person.dateOfBirth, today) }))
    .filter((person) => person.daysAway <= windowDays)
    .sort((a, b) => a.daysAway - b.daysAway);
}

export function formatBirthday(dob: IsoDate): string {
  const { month, day } = parts(dob);
  return `${day} ${MONTHS[month - 1]}`;
}

export function birthdayLabel(daysAway: number): string {
  if (daysAway === 0) return "Today";
  if (daysAway === 1) return "Tomorrow";
  return `In ${daysAway} days`;
}
