import { Badge } from "@/components/ui/badge";
import type { PoStatus } from "@/lib/purchase-orders/workflow";

const LOOKS: Record<
  PoStatus,
  { variant: "neutral" | "info" | "warning" | "danger" | "success"; label: string }
> = {
  draft: { variant: "neutral", label: "Draft" },
  issued: { variant: "info", label: "Issued" },
  deletion_requested: { variant: "warning", label: "Deletion requested" },
  cancelled: { variant: "danger", label: "Cancelled" },
  completed: { variant: "success", label: "Completed" },
};

export function PoStatusBadge({ status }: { status: PoStatus }) {
  const look = LOOKS[status];
  return <Badge variant={look.variant}>{look.label}</Badge>;
}
