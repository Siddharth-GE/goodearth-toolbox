import { Badge } from "@/components/ui/badge";
import { LinkButton } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ListToolbar } from "@/components/ui/list-toolbar";
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
import { idParam, searchParam } from "@/lib/list-params";
import { Calculator } from "lucide-react";
import Link from "next/link";
import { StartVillaDialog, type StartSource } from "./_components/estimate-forms";

/** Every villa and what the Estimator holds for it (0098): the working estimate and the official, frozen one. Each villa is estimated on its own. */
const SHOWS = {
  none: "Not started",
  working: "Working, not official",
  official: "Official",
  measure: "Works to measure",
} as const;

export default async function VillasPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const raw = await searchParams;
  const q = searchParam(raw.q);
  const project = idParam(raw.project);
  const show =
    raw.show && Object.hasOwn(SHOWS, raw.show) ? (raw.show as keyof typeof SHOWS) : undefined;
  const villas = await listVillas();

  const words = (q ?? "").toLowerCase().split(" ").filter(Boolean);
  const shown = villas.filter((villa) => {
    if (project && villa.projectId !== project) return false;
    if (show === "none" && (villa.working || villa.official)) return false;
    if (show === "working" && (!villa.working || villa.official)) return false;
    if (show === "official" && !villa.official) return false;
    if (show === "measure" && !villa.working?.toMeasureCount) return false;
    const haystack = `${villa.unitName} ${villa.projectName} ${villa.official?.reference ?? ""}`;
    return words.every((word) => haystack.toLowerCase().includes(word));
  });
  const projects = [...new Map(villas.map((villa) => [villa.projectId, villa.projectName]))];

  // What a villa can start from: every other villa's working and official estimate.
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
  for (const villa of shown) {
    byProject.set(villa.projectName, [...(byProject.get(villa.projectName) ?? []), villa]);
  }
  const started = villas.filter((villa) => villa.working || villa.official).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-2xl">
          <p className="text-muted text-[11px] font-medium tracking-[0.14em] uppercase">Villas</p>
          <p className="text-muted mt-1 text-sm">
            Each villa has one working estimate — list its works, measure them, tap a rate to see
            how it is built. When it is ready, Make official takes a numbered, frozen copy: the one
            the stores and site check against. {formatCount(started)} of{" "}
            {formatCount(villas.length)} villas have one started.
          </p>
        </div>
        <LinkButton href="/estimator/from-model" variant="secondary">
          From a SketchUp model
        </LinkButton>
      </div>

      {villas.length > 0 && (
        <ListToolbar
          action="/estimator/estimates"
          values={{ q, project, show }}
          search={{ placeholder: "Villa, project or estimate no." }}
          filters={[
            {
              param: "project",
              label: "Project",
              allLabel: "All projects",
              options: projects.map(([value, label]) => ({ value, label })),
            },
            {
              param: "show",
              label: "Show",
              allLabel: "Every villa",
              options: Object.entries(SHOWS).map(([value, label]) => ({ value, label })),
            },
          ]}
        />
      )}

      {villas.length === 0 ? (
        <EmptyState
          icon={Calculator}
          title="No villas yet"
          description="Villas come from Masters → Units. Add them there first."
        />
      ) : shown.length === 0 ? (
        <EmptyState
          icon={Calculator}
          title="Nothing matches"
          description="Try another search or filter."
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
