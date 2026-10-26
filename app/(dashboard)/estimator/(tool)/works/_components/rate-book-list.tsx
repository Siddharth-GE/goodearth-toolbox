import { Badge } from "@/components/ui/badge";
import { LinkButton } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from "@/components/ui/table";
import { formatCount, formatMoney } from "@/lib/format";

export type RateBookRow = {
  workItemId: string;
  code: string;
  name: string;
  groupName: string | null;
  category: string;
  categoryCode: string;
  uom: string | null;
  labourRate: number | null;
  componentCount: number;
  rate: number | null;
  lineCount: number;
  componentNames: string[];
};

/** The rate book under its categories; the page has already searched and filtered it. */
export function RateBookList({ rows }: { rows: RateBookRow[] }) {
  const groups = new Map<string, RateBookRow[]>();
  for (const row of rows) groups.set(row.category, [...(groups.get(row.category) ?? []), row]);

  return (
    <div className="space-y-4">
      {[...groups].map(([category, works]) => (
        <Card key={category} className="space-y-3 p-4">
          <p className="text-foreground text-sm font-semibold">{category}</p>
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell className="w-20">Code</TableHeaderCell>
                <TableHeaderCell>Work</TableHeaderCell>
                <TableHeaderCell>Labour</TableHeaderCell>
                <TableHeaderCell>Materials</TableHeaderCell>
                <TableHeaderCell className="text-right">Rate</TableHeaderCell>
                <TableHeaderCell className="text-right">On estimates</TableHeaderCell>
                <TableHeaderCell></TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {works.map((work) => (
                <TableRow key={work.workItemId}>
                  <TableCell className="text-muted text-sm">{work.code}</TableCell>
                  <TableCell className="text-foreground text-sm">
                    {work.name}
                    {work.groupName && (
                      <span className="text-muted block text-xs">{work.groupName}</span>
                    )}
                  </TableCell>
                  <TableCell className="text-sm">
                    {work.uom === null ? (
                      <Badge variant="neutral">Not set up</Badge>
                    ) : work.labourRate === null ? (
                      <Badge variant="warning">Not priced</Badge>
                    ) : (
                      `${formatMoney(work.labourRate)} / ${work.uom}`
                    )}
                  </TableCell>
                  <TableCell className="text-sm">
                    {work.uom === null
                      ? "—"
                      : work.componentCount === 0
                        ? "Labour only"
                        : `${formatCount(work.componentCount)} listed`}
                  </TableCell>
                  <TableCell className="text-right text-sm whitespace-nowrap">
                    {work.uom === null ? (
                      "—"
                    ) : work.rate === null ? (
                      <span className="text-warning">Not priced</span>
                    ) : (
                      <>
                        {formatMoney(work.rate)}
                        <span className="text-muted text-xs"> / {work.uom}</span>
                      </>
                    )}
                  </TableCell>
                  <TableCell className="text-muted text-right text-sm">
                    {work.lineCount === 0 ? "—" : formatCount(work.lineCount)}
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end">
                      <LinkButton
                        href={`/estimator/works/${work.workItemId}`}
                        variant="ghost"
                        size="sm"
                      >
                        {work.uom === null ? "Set up" : "Edit"}
                      </LinkButton>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      ))}
    </div>
  );
}
