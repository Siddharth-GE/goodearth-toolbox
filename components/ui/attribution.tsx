import { Avatar } from "./avatar";

/**
 * Who did it: a small avatar, full name on hover via the native title (no tooltip component exists, by DESIGN.md's build-on-real-need rule).
 * A missing name renders a quiet dash, never a fake person.
 */
export function Attribution({
  name,
  label,
  size = 24,
}: {
  name: string | null;
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
