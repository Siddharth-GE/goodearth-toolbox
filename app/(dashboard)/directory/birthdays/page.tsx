import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { birthdayLabel, formatBirthday } from "@/lib/directory/birthdays";
import { BIRTHDAY_WINDOW_DAYS, listBirthdays } from "@/lib/directory/queries";
import { Cake } from "lucide-react";
import Link from "next/link";

import { PersonPhoto } from "../_components/person-photo";

// Three buckets rather than a flat list: "who's got one coming up" is the
// question people actually ask, and a run of thirty undifferentiated rows
// answers a different one. Ranges are half-open and stated in full rather
// than derived from each other — the cumulative version worked but relied
// on the list being sorted, which is not something the next person should
// have to notice.
const GROUPS = [
  { title: "Today", from: 0, to: 0 },
  { title: "This week", from: 1, to: 7 },
  { title: "Later this month", from: 8, to: BIRTHDAY_WINDOW_DAYS },
] as const;

export default async function BirthdaysPage() {
  const people = await listBirthdays();

  if (people.length === 0) {
    return (
      <EmptyState
        icon={Cake}
        title="No birthdays in the next 30 days"
        description="Dates of birth are optional — each person adds their own on My details."
      />
    );
  }

  const groups = GROUPS.map((group) => ({
    title: group.title,
    rows: people.filter((person) => person.daysAway >= group.from && person.daysAway <= group.to),
  })).filter((group) => group.rows.length > 0);

  return (
    <div className="space-y-4">
      {groups.map((group) => (
        <div key={group.title} className="space-y-2">
          <h2 className="text-muted text-xs font-semibold tracking-wide uppercase">
            {group.title}
          </h2>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {group.rows.map((person) => (
              <Card key={person.id} className="flex items-center gap-3 p-3">
                <PersonPhoto
                  personId={person.id}
                  name={person.name}
                  photoPath={person.photoPath}
                  size={36}
                />
                <div className="min-w-0 flex-1">
                  <Link
                    href={`/directory/people/${person.id}`}
                    className="text-foreground hover:text-accent block truncate text-sm font-medium"
                  >
                    {person.name}
                  </Link>
                  {/* Day and month only — the year is stored, never shown.
                      Nobody's age goes on a screen. */}
                  <p className="text-muted text-xs">
                    {formatBirthday(person.dateOfBirth!)} · {birthdayLabel(person.daysAway)}
                  </p>
                </div>
              </Card>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
