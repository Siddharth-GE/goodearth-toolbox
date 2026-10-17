import { EmptyState } from "@/components/ui/empty-state";
import type { LucideIcon } from "lucide-react";

// Stub for every `built: false` tool (lib/tools.ts).
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
