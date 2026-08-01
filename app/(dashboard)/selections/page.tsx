import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow } from "@/components/ui/table";
import { listUnitsForSelections } from "@/lib/selections/queries";
import { Palette } from "lucide-react";
import Link from "next/link";
import { StartRevisionButton } from "./_components/start-revision-button";

export default async function SelectionsPage() {
  const units = await listUnitsForSelections();

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-bold tracking-tight text-foreground">Selections</h1>
        <p className="text-sm text-muted">
          What goes into every space of a unit. Costs and rates are handled in Budgets.
        </p>
      </div>

      {units.length === 0 ? (
        <EmptyState
          icon={Palette}
          title="No units yet"
          description="Units are created in Masters. Add one there and it will appear here."
        />
      ) : (
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
                  <TableCell className="font-medium text-foreground">{unit.unit_name}</TableCell>
                  <TableCell>{current ? `R${current.revision_no}` : "—"}</TableCell>
                  <TableCell>
                    {!current ? (
                      <span className="text-muted">Not started</span>
                    ) : current.status === "draft" ? (
                      <Badge variant="warning">Draft</Badge>
                    ) : (
                      <Badge variant="success">Issued</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    {current ? (
                      <Link
                        href={`/selections/${current.id}`}
                        className="text-sm font-medium text-accent hover:underline"
                      >
                        {current.status === "draft" ? "Continue" : "View"}
                      </Link>
                    ) : (
                      <StartRevisionButton unitId={unit.unit_id} />
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
