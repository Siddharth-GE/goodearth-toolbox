/**
 * Birthday arithmetic for the Directory.
 *
 * Pure and dependency-free, so `npm test` can reach it — there is no
 * database and no browser in CI. Everything takes `today` as an argument
 * (todayInIndia() in lib/format.ts reads the clock), so the tests pin
 * the clock rather than hoping.
 *
 * THE YEAR IS NEVER DISPLAYED. `date_of_birth` stores a full date because
 * that is the fact, but `formatBirthday` gives day and month only and
 * nothing here computes an age. Nobody's age goes on a screen — that is a
 * decision, recorded in the tool's PLAN.md, not an oversight.
 */

/** An ISO 'YYYY-MM-DD' date. */
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

/** Parses 'YYYY-MM-DD' into its three numbers. No Date object, so no timezone. */
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

/**
 * The next occurrence of a birthday on or after `today`, as an ISO date.
 *
 * 29 February in a non-leap year lands on 1 March, which is what
 * `Date.UTC(year, 1, 29)` does on its own — a birthday that would
 * otherwise vanish for three years in four.
 */
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

/** Days from `today` until the next occurrence. 0 on the day itself. */
export function daysUntilBirthday(dob: IsoDate, today: IsoDate): number {
  return daysBetween(today, nextBirthday(dob, today));
}

/**
 * The people with a birthday in the next `windowDays`, soonest first.
 *
 * Anyone who has not filled in a date of birth is dropped rather than
 * sorted to the end — an empty field is not a birthday.
 */
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

/** "3 April" — day and month, never the year. See the file header. */
export function formatBirthday(dob: IsoDate): string {
  const { month, day } = parts(dob);
  return `${day} ${MONTHS[month - 1]}`;
}

/** "Today", "Tomorrow", "In 6 days" — the label beside a name on the list. */
export function birthdayLabel(daysAway: number): string {
  if (daysAway === 0) return "Today";
  if (daysAway === 1) return "Tomorrow";
  return `In ${daysAway} days`;
}
