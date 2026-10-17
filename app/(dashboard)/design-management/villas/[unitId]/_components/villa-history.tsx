import { Avatar } from "@/components/ui/avatar";
import type { HistoryLine } from "@/lib/design-management/board";
import { formatShortDate, formatTime } from "@/lib/format";

/**
 * Every move on this villa, newest first — written by the database
 * itself (0125), so it is the record, not a screen's guess. One move is
 * one line: a pass reads "marked WD done, started Structural, put Jiljith
 * on Structural".
 */
export function VillaHistory({ lines }: { lines: HistoryLine[] }) {
  if (lines.length === 0) {
    return <p className="text-muted text-sm">Nothing has moved on this villa yet.</p>;
  }
  return (
    <ol className="space-y-3">
      {lines.map((line) => {
        const who = line.actorName ?? "Someone";
        const sentence = line.phrases.join(", ");
        return (
          <li key={line.key} className="flex gap-3">
            <Avatar name={who} size={28} letters={2} />
            <div className="min-w-0 text-sm">
              <p className="text-foreground">
                <b className="font-semibold">{who.split(" ")[0]}</b> {sentence}
              </p>
              {line.reasons.map((reason) => (
                <p key={reason} className="text-muted">
                  &ldquo;{reason}&rdquo;
                </p>
              ))}
              <p className="text-muted text-xs">
                {formatShortDate(line.at)} · {formatTime(line.at)}
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
