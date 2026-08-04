import { Badge } from "@/components/ui/badge";
import type { BillStatus } from "@/lib/bills/workflow";

const LOOKS: Record<BillStatus, { variant: "neutral" | "info" | "success"; label: string }> = {
  recorded: { variant: "neutral", label: "Recorded" },
  approved: { variant: "info", label: "Approved" },
  paid: { variant: "success", label: "Paid" },
};

export function BillStatusBadge({ status }: { status: BillStatus }) {
  const look = LOOKS[status];
  return <Badge variant={look.variant}>{look.label}</Badge>;
}
