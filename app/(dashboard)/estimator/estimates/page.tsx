import { Badge } from "@/components/ui/badge";
import { LinkButton } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from "@/components/ui/table";
import { listVillas, type VillaEstimates } from "@/lib/estimator/estimate-queries";
import { formatCount, formatDate, formatMoney } from "@/lib/format";
import { Calculator } from "lucide-react";
import Link from "next/link";
import { StartVillaDialog, type StartSource } from "./_components/estimate-forms";

/**
 * Every villa, and what the Estimator holds for it (0098): the working
 * estimate — the one you keep editing — and the official one, the
 * numbered frozen copy the stores and site check against. Each villa is
 * estimated on its own (founder, 2026-09-26: "each villa is different");
 * a new one can start from another villa's list of works.
 */
export default async function VillasPage() {
  const villas = await listVillas();

  // What a villa can start from: every other villa's working and official
  // estimate. The dialog puts the villa's own official first.
  const sourcesFor = (villa: VillaEstimates): StartSource[] => [
    ...(villa.official
      ? [
          {
            id: villa.official.id,
            label: `This villa's official estimate, ${villa.official.reference ?? ""}`,
          },
        ]
      : []),
    ...villas
      .filter((other) => other.unitId !== villa.unitId)
      .flatMap((other) => [
        ...(other.working
          ? [{ id: other.working.id, label: `${other.unitName} — working estimate` }]
          : []),
        ...(other.official
          ? [
              {
                id: other.official.id,
                label: `${other.unitName} — official, ${other.official.reference ?? ""}`,
              },
            ]
          : []),
      ]),
  ];

  const byProject = new Map<string, VillaEstimates[]>();
  for (const villa of villas) {
    byProject.set(villa.projectName, [...(byProject.get(villa.projectName) ?? []), villa]);
  }
  const started = villas.filter((villa) => villa.working || villa.official).length;

  return (
    <div className="space-y-4">
      <div className="max-w-2xl">
        <p className="text-muted text-[11px] font-medium tracking-[0.14em] uppercase">Villas</p>
        <p className="text-muted mt-1 text-sm">
          Each villa has one working estimate — list its works, measure them, tap a rate to see how
          it is built. When it is ready, Make official takes a numbered, frozen copy: the one the
          stores and site check against. {formatCount(started)} of {formatCount(villas.length)}{" "}
          villas have one started.
        </p>
      </div>

      {villas.length === 0 ? (
        <EmptyState
          icon={Calculator}
          title="No villas yet"
          description="Villas come from Masters → Units. Add them there first."
        />
      ) : (
        [...byProject].map(([projectName, rows]) => (
          <Card key={projectName} className="space-y-3 p-4">
            <p className="text-foreground text-sm font-semibold">{projectName}</p>
            <Table>
              <TableHead>
                <TableRow>
                  <TableHeaderCell>Villa</TableHeaderCell>
                  <TableHeaderCell>Working estimate</TableHeaderCell>
                  <TableHeaderCell>Official</TableHeaderCell>
                  <TableHeaderCell className="text-right">Official total</TableHeaderCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {rows.map((villa) => (
                  <TableRow key={villa.unitId}>
                    <TableCell className="text-foreground text-sm font-medium">
                      {villa.unitName}
                      {villa.olderDrafts.length > 0 && (
                        <span className="text-muted block text-xs">
                          {villa.olderDrafts.map((draft, index) => (
                            <span key={draft.id}>
                              {index > 0 && ", "}
                              <Link
                                href={`/estimator/estimates/${draft.id}`}
                                className="underline underline-offset-2"
                              >
                                older draft
                              </Link>
                            </span>
                          ))}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm">
                      {villa.working ? (
                        <span className="flex flex-wrap items-center gap-2">
                          <LinkButton
                            href={`/estimator/estimates/${villa.working.id}`}
                            variant="secondary"
                            size="sm"
                          >
                            Open
                          </LinkButton>
                          <span className="text-muted text-xs">
                            {formatCount(villa.working.lineCount)}{" "}
                            {villa.working.lineCount === 1 ? "work" : "works"}
                            {villa.working.toMeasureCount > 0 &&
                              ` · ${formatCount(villa.working.toMeasureCount)} to measure`}
                          </span>
                        </span>
                      ) : (
                        <StartVillaDialog
                          unitId={villa.unitId}
                          villaName={villa.unitName}
                          sources={sourcesFor(villa)}
                          preferredSourceId={villa.official?.id}
                        />
                      )}
                    </TableCell>
                    <TableCell className="text-sm">
                      {villa.official ? (
                        <Link
                          href={`/estimator/estimates/${villa.official.id}`}
                          className="flex flex-wrap items-center gap-1.5 hover:underline"
                        >
                          <Badge variant="success">{villa.official.reference ?? "Official"}</Badge>
                          <span className="text-muted text-xs">
                            {formatDate(villa.official.submittedAt)}
                          </span>
                        </Link>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right text-sm">
                      {villa.official ? formatMoney(villa.official.total) : ""}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        ))
      )}
    </div>
  );
}
