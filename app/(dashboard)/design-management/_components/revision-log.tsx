"use client";

import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/format";
import { ChevronDown, ChevronUp } from "lucide-react";
import { useState } from "react";

/**
 * The change description folded behind a click (founder, 2026-08-22:
 * "a small button saying view change description or revision log …
 * since sometimes its a long text"). Shows every revision of the set
 * that has gone to site, newest first — the same shape the Supervisors
 * side unfolds, worded for the design team.
 */
export function RevisionLog({
  entries,
}: {
  entries: { revisionNo: number; note: string | null; releasedAt: string | null }[];
}) {
  const [open, setOpen] = useState(false);
  if (entries.length === 0) return null;

  return (
    <div className="mt-0.5">
      <Button type="button" variant="ghost" size="sm" onClick={() => setOpen((value) => !value)}>
        {open ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
        {open ? "Hide revision log" : `Revision log (${entries.length})`}
      </Button>
      {open && (
        <ul className="border-border mt-1 space-y-1.5 border-l-2 pl-3">
          {entries.map((entry) => (
            <li key={entry.revisionNo} className="text-xs">
              <span className="text-foreground font-medium">R{entry.revisionNo}</span>
              <span className="text-muted">
                {entry.releasedAt ? ` · went to site ${formatDate(entry.releasedAt)}` : ""}
              </span>
              <p className="text-muted mt-0.5 whitespace-pre-wrap">
                {entry.note ?? "No note was recorded for this revision."}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
