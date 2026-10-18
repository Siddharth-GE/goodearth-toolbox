// The parser drops unknown keys so an old report still opens; this says so rather than silently
// showing a different report.
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
