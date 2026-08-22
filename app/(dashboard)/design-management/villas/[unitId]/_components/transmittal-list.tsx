"use client";

import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { VillaTransmittalRow } from "@/lib/design-management/queries";
import { formatDate } from "@/lib/format";
import { ChevronRight } from "lucide-react";
import Link from "next/link";

/**
 * This villa's transmittals, newest first, filtered by design stage.
 *
 * Founder, 2026-08-22 evening: "there all transmittals of that plot,
 * filters by group". The chips are Radix `Tabs` — same-page panels, no
 * navigation and no URL change, which is what a filter is; `NavTabs`
 * would be the wrong one (DESIGN.md draws that line). Only stages that
 * actually appear here get a chip, so pressing one can never show an
 * empty list.
 */
export function TransmittalList({
  transmittals,
  stages,
}: {
  transmittals: VillaTransmittalRow[];
  stages: { id: string; name: string }[];
}) {
  // One stage is no choice at all — the chips would be decoration.
  if (stages.length < 2) return <TransmittalRows rows={transmittals} />;

  return (
    <Tabs defaultValue="all" className="space-y-3">
      <TabsList className="flex-wrap">
        <TabsTrigger value="all">All</TabsTrigger>
        {stages.map((stage) => (
          <TabsTrigger key={stage.id} value={stage.id}>
            {stage.name}
          </TabsTrigger>
        ))}
      </TabsList>
      <TabsContent value="all">
        <TransmittalRows rows={transmittals} />
      </TabsContent>
      {stages.map((stage) => (
        <TabsContent key={stage.id} value={stage.id}>
          <TransmittalRows rows={transmittals.filter((row) => row.stageId === stage.id)} />
        </TabsContent>
      ))}
    </Tabs>
  );
}

function TransmittalRows({ rows }: { rows: VillaTransmittalRow[] }) {
  if (rows.length === 0) {
    return <p className="text-muted text-sm">Nothing at this stage yet.</p>;
  }

  return (
    <ul className="divide-border divide-y">
      {rows.map((row) => (
        <li key={row.id}>
          <Link
            href={`/design-management/transmittals/${row.id}`}
            className="hover:bg-muted/5 -mx-2 flex items-center justify-between gap-3 rounded-lg px-2 py-2.5"
          >
            <span className="min-w-0">
              <span className="flex flex-wrap items-center gap-2">
                {row.number ? (
                  <span className="text-foreground text-sm font-semibold">{row.number}</span>
                ) : (
                  <Badge variant="warning">Draft</Badge>
                )}
                <span className="text-muted text-sm">{row.stageName}</span>
              </span>
              <span className="text-muted mt-0.5 block text-xs">
                {row.lineCount} {row.lineCount === 1 ? "drawing" : "drawings"}
                {row.issuedAt ? ` · issued ${formatDate(row.issuedAt)}` : " · not issued yet"}
                {row.issuedByName ? ` by ${row.issuedByName}` : ""}
              </span>
            </span>
            <ChevronRight className="text-muted size-4 shrink-0" />
          </Link>
        </li>
      ))}
    </ul>
  );
}
