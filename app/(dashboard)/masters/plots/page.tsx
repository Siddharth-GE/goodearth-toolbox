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
import { listPlotsPage, type PlotStatus } from "@/lib/masters/plots";
import { listProjects } from "@/lib/masters/projects";
import { listUnits } from "@/lib/masters/units";
import { Boxes } from "lucide-react";
import { PlotFormDialog } from "./_components/plot-form-dialog";

const STATUS_VARIANT: Record<PlotStatus, "info" | "warning" | "success"> = {
  available: "info",
  reserved: "warning",
  sold: "success",
};

export default async function PlotsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; project?: string; page?: string }>;
}) {
  const { q, project, page } = await searchParams;
  const [result, projects, units] = await Promise.all([
    listPlotsPage({ search: q, projectId: project, page: Number(page) || 1 }),
    listProjects(),
    listUnits(),
  ]);
  const { rows: plots, total, page: currentPage, pageSize, pageCount } = result;
  const projectName = (id: string) => projects.find((p) => p.id === id)?.name ?? "—";
  // Plot ↔ unit is 1:1 (0029): each plot shows its unit, or that it's
  // still waiting for one — the soft side of the rule the DB can't
  // enforce additively.
  const unitByPlot = new Map(units.map((unit) => [unit.plot_id, unit.name]));

  // Carries the active filters onto the pager links, so paging never
  // silently drops the search you're in the middle of.
  const hrefForPage = (target: number) => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (project) params.set("project", project);
    if (target > 1) params.set("page", String(target));
    const query = params.toString();
    return query ? `/masters/plots?${query}` : "/masters/plots";
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        {/* GET form: submitting drops `page`, so changing any filter
            naturally returns to page 1 rather than stranding you on page 40. */}
        <form action="/masters/plots" className="flex flex-wrap items-end gap-2">
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
            <LinkButton href="/masters/plots" variant="ghost">
              Clear
            </LinkButton>
          )}
        </form>
        <PlotFormDialog projects={projects} />
      </div>

      {plots.length === 0 ? (
        <EmptyState
          icon={Boxes}
          title={q || project ? "No plots found" : "No plots yet"}
          description={
            q || project ? "Try a different search." : "Create the first plot under a project."
          }
        />
      ) : (
        <>
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>Name / number</TableHeaderCell>
                <TableHeaderCell>Code</TableHeaderCell>
                <TableHeaderCell>Unit</TableHeaderCell>
                <TableHeaderCell>Project</TableHeaderCell>
                <TableHeaderCell>Area</TableHeaderCell>
                <TableHeaderCell>Status</TableHeaderCell>
                <TableHeaderCell></TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {plots.map((plot) => (
                <TableRow key={plot.id}>
                  <TableCell className="text-foreground font-medium">{plot.name}</TableCell>
                  <TableCell className="font-mono text-xs">{plot.code ?? "—"}</TableCell>
                  <TableCell>
                    {unitByPlot.get(plot.id) ?? <span className="text-muted">no unit yet</span>}
                  </TableCell>
                  <TableCell>{projectName(plot.project_id)}</TableCell>
                  <TableCell>{plot.area ?? "—"}</TableCell>
                  <TableCell>
                    <Badge variant={STATUS_VARIANT[plot.status]} className="capitalize">
                      {plot.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <PlotFormDialog projects={projects} plot={plot} />
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
