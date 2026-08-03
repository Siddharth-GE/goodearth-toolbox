import { Badge } from "@/components/ui/badge";
import type { IndentStatus } from "@/lib/indents/workflow";

const LOOKS: Record<IndentStatus, { variant: "neutral" | "warning" | "success"; label: string }> = {
  draft: { variant: "neutral", label: "Draft" },
  submitted: { variant: "warning", label: "Submitted" },
  approved: { variant: "success", label: "Approved" },
};

export function IndentStatusBadge({ status }: { status: IndentStatus }) {
  const look = LOOKS[status];
  return <Badge variant={look.variant}>{look.label}</Badge>;
}
