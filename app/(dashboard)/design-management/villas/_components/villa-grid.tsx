"use client";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { DesignVillaRow } from "@/lib/design-management/queries";
import { formatDate } from "@/lib/format";
import { Search } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

/** Below this many villas the whole list fits in a glance; no box needed. */
const FILTER_FROM = 12;

/**
 * Every villa as a card, grouped by project, with a box to find one by
 * typing part of its name, plot or project (2026-09-27 audit: 43 cards
 * on production and nothing but scrolling to reach one). The filter is
 * local and forgets itself — this is a way in, not a report.
 */
export function VillaGrid({ villas }: { villas: DesignVillaRow[] }) {
  const [query, setQuery] = useState("");
  const needle = query.trim().toLowerCase();
  const shown = needle
    ? villas.filter((villa) =>
        [villa.villaName, villa.plotName, villa.projectName].some((value) =>
          value.toLowerCase().includes(needle),
        ),
      )
    : villas;
  const projects = [...new Set(shown.map((villa) => villa.projectName))].sort();

  return (
    <div className="space-y-5">
      {villas.length > FILTER_FROM && (
        <div className="relative max-w-sm">
          <Search
            className="text-muted pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2"
            aria-hidden
          />
          <Input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Find a villa…"
            aria-label="Find a villa by name, plot or project"
            className="pl-10"
          />
        </div>
      )}

      {shown.length === 0 && (
        <p className="text-muted text-sm">No villa matches &ldquo;{query.trim()}&rdquo;.</p>
      )}

      {projects.map((projectName) => (
        <div key={projectName} className="space-y-2">
          <p className="text-muted text-[11px] font-medium tracking-[0.14em] uppercase">
            {projectName}
          </p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {shown
              .filter((villa) => villa.projectName === projectName)
              .map((villa) => (
                <Link
                  key={villa.unitId}
                  href={`/design-management/villas/${villa.unitId}`}
                  className="focus-visible:ring-accent rounded-2xl focus-visible:ring-2 focus-visible:outline-none"
                >
                  <Card className="hover:border-accent h-full space-y-2 p-4 transition-colors">
                    <div>
                      <p className="text-foreground text-sm font-semibold">{villa.villaName}</p>
                      <p className="text-muted text-xs">Plot {villa.plotName}</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Badge variant={villa.transmittalsIssued > 0 ? "success" : "neutral"}>
                        {villa.transmittalsIssued} issued
                      </Badge>
                      {villa.draftTransmittals > 0 && (
                        <Badge variant="warning">
                          {villa.draftTransmittals} draft
                          {villa.draftTransmittals === 1 ? "" : "s"}
                        </Badge>
                      )}
                    </div>
                    <p className="text-muted text-xs">
                      {villa.lastIssuedAt
                        ? `Last issued ${formatDate(villa.lastIssuedAt)}`
                        : "Nothing issued yet"}
                    </p>
                  </Card>
                </Link>
              ))}
          </div>
        </div>
      ))}
    </div>
  );
}
