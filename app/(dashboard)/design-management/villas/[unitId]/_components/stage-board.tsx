import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from "@/components/ui/table";
import type { DesignStageBoardRow } from "@/lib/design-management/queries";
import { formatDate } from "@/lib/format";

/**
 * The stage board: what has gone out at each design stage, derived fresh
 * from issued transmittals on every render — nothing here is stored.
 * Retired stages only appear if they carry history; an active stage
 * always shows, even with nothing issued yet (lib/design-management/
 * queries.ts:getVillaDesignDetail already filters that).
 */
export function StageBoard({ stages }: { stages: DesignStageBoardRow[] }) {
  if (stages.length === 0) return null;

  return (
    <Table>
      <TableHead>
        <TableRow>
          <TableHeaderCell>Stage</TableHeaderCell>
          <TableHeaderCell>Transmittals issued</TableHeaderCell>
          <TableHeaderCell>Last issued</TableHeaderCell>
        </TableRow>
      </TableHead>
      <TableBody>
        {stages.map((stage) => (
          <TableRow key={stage.stageId}>
            <TableCell>
              {stage.stageName}
              {!stage.isActive && <span className="text-muted ml-1.5 text-xs">(retired)</span>}
            </TableCell>
            <TableCell>{stage.transmittalCount}</TableCell>
            <TableCell>{stage.lastIssuedAt ? formatDate(stage.lastIssuedAt) : "—"}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
