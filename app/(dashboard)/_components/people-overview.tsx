import { Card } from "@/components/ui/card";
import { countPeople } from "@/lib/overview/queries";
import Link from "next/link";

/**
 * Live now that the Directory is real. This card used to hardcode "78
 * full-time, 214 contractors, 82% training completion, 4 courses
 * assigned" and link straight to a Coming Soon placard — four invented
 * numbers sitting beside real ones.
 *
 * The training figures are gone rather than replaced with zeros: Training
 * has not been built, and a dash is honest where "0%" reads as a company
 * that never trains anyone. They come back when the tool does.
 *
 * The counts come from lib/overview/queries.ts, NOT from the Directory's
 * own queries — those gate on requireTool and would redirect the home
 * page to itself. That comment lives on countPeople().
 */
export async function PeopleOverview() {
  const { people, departments } = await countPeople();

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
            <p className="text-foreground font-mono text-xl font-semibold">{stat.value}</p>
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
