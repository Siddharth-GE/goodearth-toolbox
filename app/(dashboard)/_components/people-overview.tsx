import { Card } from "@/components/ui/card";
import Link from "next/link";

// Static illustrative data — Directory/Training don't exist yet.
const STATS = [
  { value: "78", label: "full-time" },
  { value: "214", label: "contractors on site" },
  { value: "82%", label: "training completion" },
  { value: "4", label: "courses assigned" },
];

export function PeopleOverview() {
  return (
    <Card className="p-5">
      <div className="mb-4 flex items-center">
        <h2 className="text-sm font-semibold text-foreground">People</h2>
        <Link href="/directory" className="ml-auto text-xs text-muted hover:text-accent">
          Directory
        </Link>
      </div>
      <div className="grid grid-cols-2 gap-4">
        {STATS.map((stat) => (
          <div key={stat.label}>
            <p className="font-mono text-xl font-semibold text-foreground">{stat.value}</p>
            <p className="mt-0.5 text-xs text-muted">{stat.label}</p>
          </div>
        ))}
      </div>
    </Card>
  );
}
