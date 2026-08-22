import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from "@/components/ui/table";
import { PageTitle } from "@/components/ui/page-title";
import { listTransmittals } from "@/lib/design-management/queries";
import { formatDate } from "@/lib/format";
import { Send } from "lucide-react";
import Link from "next/link";

/**
 * Every transmittal, drafts and issued together, newest first.
 * `?villa=<unitId>` narrows it to one villa — the link the villa design
 * page's stage board carries, so "what has gone out here" is one click
 * from the drawings themselves.
 */
export default async function TransmittalsPage({
  searchParams,
}: {
  searchParams: Promise<{ villa?: string }>;
}) {
  const { villa } = await searchParams;
  const { rows, total } = await listTransmittals(villa);

  const villaName = villa ? (rows[0]?.villaName ?? null) : null;

  return (
    <div className="space-y-4">
      <PageTitle
        title="Transmittals"
        description="The record of what was formally sent to site: which villa, which design stage, which drawings, and when. A draft can still be changed; issuing one gives it a number and puts its drawings in front of site for good."
        backHref="/design-management"
        backLabel="Design Management"
        actions={
          villa ? (
            <Link
              href="/design-management/transmittals"
              className="text-accent text-sm font-medium hover:underline"
            >
              Show all villas
            </Link>
          ) : undefined
        }
      />

      {villa && (
        <p className="text-muted text-sm">
          {villaName ? `Transmittals for ${villaName} only.` : "Transmittals for one villa only."}
        </p>
      )}

      {rows.length === 0 ? (
        <EmptyState
          icon={Send}
          title="No transmittals yet"
          description="Raise one from a villa's design page, once it has a drawing to send."
        />
      ) : (
        <>
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>Transmittal</TableHeaderCell>
                <TableHeaderCell>Villa</TableHeaderCell>
                <TableHeaderCell>Design stage</TableHeaderCell>
                <TableHeaderCell>Drawings</TableHeaderCell>
                <TableHeaderCell>Issued</TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>
                    <Link
                      href={`/design-management/transmittals/${row.id}`}
                      className="hover:underline"
                    >
                      {row.number ? (
                        <span className="text-foreground font-medium">{row.number}</span>
                      ) : (
                        <Badge variant="warning">Draft</Badge>
                      )}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <span className="text-foreground block">{row.villaName}</span>
                    <span className="text-muted block text-xs">
                      Plot {row.plotName} · {row.projectName}
                    </span>
                  </TableCell>
                  <TableCell>{row.stageName}</TableCell>
                  <TableCell>
                    {row.lineCount} {row.lineCount === 1 ? "drawing" : "drawings"}
                  </TableCell>
                  <TableCell>
                    {row.issuedAt ? (
                      <>
                        <span className="text-foreground block">{formatDate(row.issuedAt)}</span>
                        {row.issuedByName && (
                          <span className="text-muted block text-xs">{row.issuedByName}</span>
                        )}
                      </>
                    ) : (
                      <span className="text-muted">Not issued</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {rows.length < total && (
            <p className="text-muted text-xs">
              Showing the {rows.length} newest of {total}.
            </p>
          )}
        </>
      )}
    </div>
  );
}
