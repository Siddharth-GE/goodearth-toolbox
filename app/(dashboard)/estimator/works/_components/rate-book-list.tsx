"use client";

import { Badge } from "@/components/ui/badge";
import { LinkButton } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from "@/components/ui/table";
import { formatCount, formatMoney } from "@/lib/format";
import { useMemo, useState } from "react";

export type RateBookRow = {
  workItemId: string;
  code: string;
  name: string;
  groupName: string | null;
  /** "SS — Super-structure", in the vocabulary's order. */
  category: string;
  uom: string | null;
  labourRate: number | null;
  componentCount: number;
  /** One unit, labour + materials; null when anything is unpriced. */
  rate: number | null;
  /** Estimate lines using the work, drafts and officials alike. */
  lineCount: number;
};

/**
 * The rate book, searchable: every work, what one unit of it costs, and
 * whether any estimate uses it. Typing narrows the list in the browser —
 * a hundred and seventy works in nine cards was a lot of scrolling to
 * find "lintel".
 */
export function RateBookList({ rows }: { rows: RateBookRow[] }) {
  const [query, setQuery] = useState("");

  const byCategory = useMemo(() => {
    const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const groups = new Map<string, RateBookRow[]>();
    for (const row of rows) {
      const haystack =
        `${row.code} ${row.name} ${row.groupName ?? ""} ${row.category}`.toLowerCase();
      if (!words.every((word) => haystack.includes(word))) continue;
      groups.set(row.category, [...(groups.get(row.category) ?? []), row]);
    }
    return [...groups];
  }, [rows, query]);

  return (
    <div className="space-y-4">
      <Input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Find a work — lintel, plaster, SS.15…"
        aria-label="Find a work"
        className="max-w-md"
      />

      {byCategory.length === 0 ? (
        <p className="text-muted text-sm">Nothing matches “{query.trim()}”.</p>
      ) : (
        byCategory.map(([category, works]) => (
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
        ))
      )}
    </div>
  );
}
