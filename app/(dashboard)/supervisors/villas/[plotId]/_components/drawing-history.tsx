"use client";

import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/format";
import type { DrawingHistoryEntry } from "@/lib/drawings/queries";
import { ChevronDown, ChevronUp } from "lucide-react";
import { useState } from "react";

/**
 * The change list behind a button (founder, 2026-08-22: history must be
 * seen, "a button that expands the change list not just some dumped
 * text"). Notes and dates only — never the old sheets: site builds from
 * the latest drawing, so a superseded file is deliberately not one tap
 * away here.
 */
export function DrawingHistory({ history }: { history: DrawingHistoryEntry[] }) {
  const [open, setOpen] = useState(false);
  if (history.length === 0) return null;

  return (
    <div>
      <Button type="button" variant="ghost" size="sm" onClick={() => setOpen((value) => !value)}>
        {open ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
        {open ? "Hide revision log" : `Revision log (${history.length})`}
      </Button>
      {open && (
        <ul className="border-border mt-1 space-y-1.5 border-l-2 pl-3">
          {history.map((entry) => (
            <li key={entry.revisionNo} className="text-xs">
              <span className="text-foreground font-medium">R{entry.revisionNo}</span>
              <span className="text-muted">
                {entry.releasedAt ? ` · went to site ${formatDate(entry.releasedAt)}` : ""}
              </span>
              <p className="text-muted mt-0.5">
                {entry.note ?? "No note was recorded for this revision."}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
