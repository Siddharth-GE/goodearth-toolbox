import { Card } from "@/components/ui/card";
import { countPeople } from "@/lib/overview/queries";
import Link from "next/link";

/**
 * Counts come from lib/overview/queries.ts, not the Directory's queries, which gate on requireTool and would
 * redirect the home page to itself. Training shows dashes: it isn't built, and "0%" would read as never training.
 */
export async function PeopleOverview() {
  const counts = await countPeople().catch(() => null);
  if (!counts) {
    return (
      <Card className="p-5">
        <h2 className="text-foreground text-sm font-semibold">People</h2>
        <p className="text-muted mt-3 text-sm">
          Couldn&apos;t load the people count just now. Refresh to try again.
        </p>
      </Card>
    );
  }
  const { people, departments } = counts;

  const stats = [
    { value: people, label: people === 1 ? "person" : "people" },
    { value: departments, label: departments === 1 ? "department" : "departments" },
  ];

  return (
    <Card className="p-5">
      <div className="mb-4 flex items-center">
        <h2 className="text-foreground text-sm font-semibold">People</h2>
        <Link href="/directory" className="text-muted hover:text-accent ml-auto text-xs">
          Directory
        </Link>
      </div>
      <div className="grid grid-cols-2 gap-4">
        {stats.map((stat) => (
          <div key={stat.label}>
            <p className="text-foreground text-xl font-semibold tabular-nums">{stat.value}</p>
            <p className="text-muted mt-0.5 text-xs">{stat.label}</p>
          </div>
        ))}
      </div>
      <p className="text-muted mt-4 text-xs">
        Training numbers return when the Training tool is built.
      </p>
    </Card>
  );
}
