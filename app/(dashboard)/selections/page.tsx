import { PageTitle } from "@/components/ui/page-title";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Pagination } from "@/components/ui/pagination";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from "@/components/ui/table";
import { listUnitsForSelections } from "@/lib/selections/queries";
import { Palette } from "lucide-react";
import Link from "next/link";
import { StartRevisionButton } from "./_components/start-revision-button";

export default async function SelectionsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const { page } = await searchParams;
  const {
    units,
    total,
    page: currentPage,
    pageCount,
    pageSize,
  } = await listUnitsForSelections({ page: Number(page) || 1 });

  const hrefForPage = (target: number) =>
    target > 1 ? `/selections?page=${target}` : "/selections";

  return (
    <div className="space-y-4">
      <PageTitle
        title="Selections"
        description="What goes into every space of a unit. Costs and rates are handled in Budgets."
      />

      {units.length === 0 ? (
        <EmptyState
          icon={Palette}
          title="No units yet"
          description="Units are created in Masters. Add one there and it will appear here."
        />
      ) : (
        <>
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>Project</TableHeaderCell>
                <TableHeaderCell>Unit</TableHeaderCell>
                <TableHeaderCell>Current revision</TableHeaderCell>
                <TableHeaderCell>Status</TableHeaderCell>
                <TableHeaderCell></TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {units.map((unit) => {
                // A unit's live revision is its draft if one is open, else the
                // last issued one. Both can exist at once: R0 issued while R1
                // is being drafted.
                const current = unit.draft ?? unit.latestIssued;
                return (
                  <TableRow key={unit.unit_id}>
                    <TableCell>{unit.project_name}</TableCell>
                    <TableCell className="text-foreground font-medium">{unit.unit_name}</TableCell>
                    <TableCell>{current ? `R${current.revision_no}` : "—"}</TableCell>
                    <TableCell>
                      {!current ? (
                        <span className="text-muted">Not started</span>
                      ) : current.status === "draft" ? (
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant="warning">Draft</Badge>
                          {/* Both can be live at once: R0 sitting with the
                            budget team while R1 is being drafted. Hiding
                            the issued one would misrepresent the unit. */}
                          {unit.latestIssued && (
                            <span className="text-muted text-xs">
                              R{unit.latestIssued.revision_no} with budgeting
                            </span>
                          )}
                        </div>
                      ) : (
                        <Badge variant="success">With budgeting</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {current ? (
                        <div className="flex items-center gap-3">
                          <Link
                            href={`/selections/${current.id}`}
                            className="text-accent text-sm font-medium hover:underline"
                          >
                            {current.status === "draft" ? "Continue" : "View"}
                          </Link>
                          {unit.draft && unit.latestIssued && (
                            <Link
                              href={`/selections/${unit.latestIssued.id}`}
                              className="text-muted hover:text-foreground text-sm"
                            >
                              R{unit.latestIssued.revision_no}
                            </Link>
                          )}
                        </div>
                      ) : (
                        <StartRevisionButton unitId={unit.unit_id} />
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
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
