import type { FolderSheet } from "@/lib/drawings/folder-sheets";
import { formatShortDate } from "@/lib/format";
import { FileText } from "lucide-react";

/**
 * A WorkDrive folder's sheets as the toolbox read them (0124): numbered,
 * by name, with the day each last changed in WorkDrive. The files are
 * opened in WorkDrive through the folder's link, never from here.
 */
export function FolderSheetList({ sheets }: { sheets: FolderSheet[] }) {
  if (sheets.length === 0) {
    return <p className="text-muted text-xs">No sheets were found in the folder.</p>;
  }
  return (
    <ol className="divide-border divide-y">
      {sheets.map((sheet, index) => (
        <li key={sheet.id} className="flex items-start gap-2 py-1.5 text-sm">
          <span className="text-muted w-6 shrink-0 text-right text-xs leading-5 tabular-nums">
            {index + 1}
          </span>
          <FileText className="text-muted mt-0.5 size-3.5 shrink-0" aria-hidden />
          <span className="text-foreground min-w-0 flex-1 break-words">{sheet.name}</span>
          {sheet.modifiedAt && (
            <span className="text-muted shrink-0 text-xs leading-5">
              {formatShortDate(sheet.modifiedAt)}
            </span>
          )}
        </li>
      ))}
    </ol>
  );
}
