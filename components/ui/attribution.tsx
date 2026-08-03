import { Avatar } from "./avatar";

/**
 * Who did it — the founder's rule that every line edit and document
 * action shows its person. A small avatar (the shared initials style);
 * the full name appears on hover via the native title tooltip — no
 * tooltip component exists in the system, deliberately (DESIGN.md's
 * build-on-real-need rule).
 *
 * A missing name renders a quiet dash, never a fake person: rows from
 * before attribution landed have no updated_by, and that's honest.
 */
export function Attribution({
  name,
  label,
  size = 24,
}: {
  name: string | null;
  /** e.g. "Last edited by" — prefixes the hover text. */
  label?: string;
  size?: number;
}) {
  if (!name) return <span className="text-muted/50 text-sm">—</span>;
  return (
    <span title={label ? `${label} ${name}` : name} className="inline-flex cursor-default">
      <Avatar name={name} size={size} />
    </span>
  );
}
