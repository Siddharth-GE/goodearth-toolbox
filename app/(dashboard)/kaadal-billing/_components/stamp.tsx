import { formatDate, formatTime } from "@/lib/format";

export function Stamp({ at, by }: { at: string; by?: string }) {
  return (
    <p className="text-muted text-center text-xs">
      Last changed {by ? `by ${by} ` : ""}on {formatDate(at)}, {formatTime(at)}
    </p>
  );
}
