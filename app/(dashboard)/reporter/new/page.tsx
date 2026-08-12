import Link from "next/link";

import { Card } from "@/components/ui/card";
import { PageTitle } from "@/components/ui/page-title";
import { requireTool } from "@/lib/auth/access";
import { DATASETS } from "@/lib/reporter/datasets";
import { defaultSpec, encodeSpec } from "@/lib/reporter/spec";

// Dataset picker → blank builder. One card per registry entry; the
// card's link carries that dataset's default spec, so the builder opens
// showing real rows rather than an empty grid.
export default async function NewReportPage() {
  await requireTool("/reporter");

  return (
    <div className="space-y-6">
      <PageTitle
        title="Start a report"
        description="Pick the data to report over."
        backHref="/reporter"
        backLabel="Reporter"
      />
      <div className="grid gap-3 sm:grid-cols-2">
        {Object.entries(DATASETS).map(([key, dataset]) => (
          <Link key={key} href={`/reporter/run?spec=${encodeSpec(defaultSpec(key))}`}>
            <Card className="hover:border-accent h-full p-5 transition-colors">
              <p className="text-foreground text-sm font-semibold">{dataset.label}</p>
              <p className="text-muted mt-1 text-sm">{dataset.description}</p>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
