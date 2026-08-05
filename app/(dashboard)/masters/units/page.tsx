import { Badge } from "@/components/ui/badge";
import { Button, LinkButton } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Pagination } from "@/components/ui/pagination";
import { Select } from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from "@/components/ui/table";
import { listClients } from "@/lib/masters/clients";
import { listPlots } from "@/lib/masters/plots";
import { listProjects } from "@/lib/masters/projects";
import { listUnits, listUnitsPage, type UnitStatus } from "@/lib/masters/units";
import { Boxes } from "lucide-react";
import { UnitFormDialog } from "./_components/unit-form-dialog";

const STATUS_VARIANT: Record<UnitStatus, "info" | "warning" | "success"> = {
  available: "info",
  reserved: "warning",
  sold: "success",
};

export default async function UnitsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; project?: string; page?: string }>;
}) {
  const { q, project, page } = await searchParams;
  // The table shows one page; the form dialog still gets the COMPLETE
  // list — it computes which plots are already taken from `units`, and
  // a single page would silently offer occupied plots.
  const [unitPage, allUnits, projects, plots, clients] = await Promise.all([
    listUnitsPage({ search: q, projectId: project, page: Number(page) || 1 }),
    listUnits(),
    listProjects(),
    listPlots(),
    listClients(),
  ]);
  const { units, total, page: currentPage, pageCount, pageSize } = unitPage;
  const projectName = (id: string) => projects.find((p) => p.id === id)?.name ?? "—";
  const plotName = (id: string) => plots.find((p) => p.id === id)?.name ?? "—";
  const clientName = (id: string | null) =>
    id ? (clients.find((c) => c.id === id)?.name ?? "—") : "—";

  // Carries the active filters onto the pager links, so paging never
  // silently drops the search you're in the middle of.
  const hrefForPage = (target: number) => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (project) params.set("project", project);
    if (target > 1) params.set("page", String(target));
    const query = params.toString();
    return query ? `/masters/units?${query}` : "/masters/units";
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        {/* GET form: submitting drops `page`, so changing any filter
            naturally returns to page 1 rather than stranding you on page 40. */}
        <form action="/masters/units" className="flex flex-wrap items-end gap-2">
          <div className="space-y-1.5">
            <Label htmlFor="q">Search</Label>
            <Input
              id="q"
              name="q"
              defaultValue={q ?? ""}
              placeholder="Name or code…"
              autoComplete="off"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="project">Project</Label>
            <Select id="project" name="project" defaultValue={project ?? ""}>
              <option value="">All projects</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </div>
          <Button type="submit" variant="secondary">
            Filter
          </Button>
          {(q || project) && (
            <LinkButton href="/masters/units" variant="ghost">
              Clear
            </LinkButton>
          )}
        </form>
        <UnitFormDialog projects={projects} plots={plots} units={allUnits} clients={clients} />
      </div>

      {units.length === 0 ? (
        <EmptyState
          icon={Boxes}
          title={q || project ? "No units found" : "No units yet"}
          description={
            q || project ? "Try a different search." : "Create the first unit under a project."
          }
        />
      ) : (
        <>
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>Name</TableHeaderCell>
                <TableHeaderCell>Code</TableHeaderCell>
                <TableHeaderCell>Plot</TableHeaderCell>
                <TableHeaderCell>Project</TableHeaderCell>
                <TableHeaderCell>Type</TableHeaderCell>
                <TableHeaderCell>Client</TableHeaderCell>
                <TableHeaderCell>Status</TableHeaderCell>
                <TableHeaderCell></TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {units.map((unit) => (
                <TableRow key={unit.id}>
                  <TableCell className="text-foreground font-medium">{unit.name}</TableCell>
                  <TableCell className="font-mono text-xs">{unit.code ?? "—"}</TableCell>
                  <TableCell>{plotName(unit.plot_id)}</TableCell>
                  <TableCell>{projectName(unit.project_id)}</TableCell>
                  <TableCell className="capitalize">{unit.unit_type.replace(/_/g, " ")}</TableCell>
                  <TableCell>{clientName(unit.client_id)}</TableCell>
                  <TableCell>
                    <Badge variant={STATUS_VARIANT[unit.status]} className="capitalize">
                      {unit.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <UnitFormDialog
                      projects={projects}
                      plots={plots}
                      units={allUnits}
                      clients={clients}
                      unit={unit}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          <Pagination
            page={currentPage}
            pageCount={pageCount}
            // Precomputed strings, not the function itself — a function
            // can't cross into a Client Component.
            prevHref={currentPage > 1 ? hrefForPage(currentPage - 1) : null}
            nextHref={currentPage < pageCount ? hrefForPage(currentPage + 1) : null}
            total={total}
            pageSize={pageSize}
          />
        </>
      )}
    </div>
  );
}
