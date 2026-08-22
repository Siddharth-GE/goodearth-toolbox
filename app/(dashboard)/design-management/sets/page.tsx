import { Badge } from "@/components/ui/badge";
import { LinkButton } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from "@/components/ui/table";
import { listDrawingSets } from "@/lib/design-management/queries";
import { FileStack } from "lucide-react";
import Link from "next/link";

import { DrawingSetFormDialog, DrawingSetToggle } from "./_components/set-forms";

export default async function DrawingSetsPage() {
  const sets = await listDrawingSets();

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div className="max-w-2xl">
          <p className="text-muted text-xs font-semibold tracking-widest uppercase">Drawing sets</p>
          <p className="text-muted mt-1 text-sm">
            The drawing master — one set can serve many works. A villa&apos;s revision history hangs
            off the set it belongs to; deactivating a set stops it being picked for a new revision
            without touching what&apos;s already issued.
          </p>
        </div>
        <DrawingSetFormDialog />
      </div>

      {sets.length === 0 ? (
        <EmptyState
          icon={FileStack}
          title="No drawing sets yet"
          description='Add the first one — e.g. "Working Drawings — Ground Floor".'
        />
      ) : (
        <Table>
          <TableHead>
            <TableRow>
              <TableHeaderCell>Set</TableHeaderCell>
              <TableHeaderCell>Works</TableHeaderCell>
              <TableHeaderCell>Status</TableHeaderCell>
              <TableHeaderCell></TableHeaderCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {sets.map((set) => (
              <TableRow key={set.id}>
                <TableCell>
                  <Link href={`/design-management/sets/${set.id}`} className="hover:underline">
                    <span className="text-foreground block font-medium">
                      {set.code ? `${set.code} — ${set.name}` : set.name}
                    </span>
                    {set.description && (
                      <span className="text-muted block text-xs">{set.description}</span>
                    )}
                  </Link>
                </TableCell>
                <TableCell>
                  {set.workCount} {set.workCount === 1 ? "work" : "works"}
                </TableCell>
                <TableCell>
                  <Badge variant={set.isActive ? "success" : "neutral"}>
                    {set.isActive ? "Active" : "Inactive"}
                  </Badge>
                </TableCell>
                <TableCell>
                  <div className="flex items-center justify-end gap-1">
                    <LinkButton
                      href={`/design-management/sets/${set.id}`}
                      variant="ghost"
                      size="sm"
                    >
                      Edit
                    </LinkButton>
                    <DrawingSetToggle id={set.id} isActive={set.isActive} />
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
