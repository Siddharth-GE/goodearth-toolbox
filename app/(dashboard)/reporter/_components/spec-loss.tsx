/**
 * What the parser left out, said in plain English.
 *
 * A report saved before a field was renamed still opens — unknown keys
 * are dropped rather than thrown — but dropping something quietly would
 * mean showing a person a different report from the one they saved and
 * never mentioning it. This is the mention.
 */
export function SpecLoss({ lines }: { lines: string[] }) {
  if (lines.length === 0) return null;

  return (
    <div className="border-border bg-surface rounded-2xl border p-4">
      <p className="text-foreground text-sm font-medium">
        Parts of this report no longer apply and were left out
      </p>
      <ul className="text-muted mt-1 list-disc pl-5 text-sm">
        {lines.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
    </div>
  );
}
