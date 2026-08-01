import { EmptyState } from "@/components/ui/empty-state";
import type { LucideIcon } from "lucide-react";

// Shared by every unbuilt tool's route stub — see lib/tools.ts's
// `built: false` flag and CLAUDE.md for the convention. Wraps the
// existing EmptyState rather than inventing a new visual pattern.
export function ComingSoon({
  icon,
  title,
  description,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
}) {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <EmptyState
        icon={icon}
        title={title}
        description={description ?? "This tool is coming soon."}
        className="max-w-sm"
      />
    </div>
  );
}
