import { Badge } from "@/components/ui/badge";
import {
  STATUS_LABELS,
  USE_LABELS,
  isInternalUse,
  type StayStatus,
  type StayUse,
} from "@/lib/birdwing/shared";

const STATUS_LOOK: Record<StayStatus, "neutral" | "info" | "success" | "danger" | "warning"> = {
  enquiry: "neutral",
  confirmed: "info",
  checked_in: "success",
  checked_out: "neutral",
  cancelled: "danger",
  blocked: "neutral",
};

export function StayStatusBadge({ status }: { status: StayStatus }) {
  return <Badge variant={STATUS_LOOK[status]}>{STATUS_LABELS[status]}</Badge>;
}

/**
 * Paying guest, or Goodearth's own use — the distinction the whole tool
 * turns on, so it is never a colour alone: the words say it.
 */
export function UseBadge({ use }: { use: StayUse | null }) {
  if (!use) return null;
  return <Badge variant={isInternalUse(use) ? "warning" : "success"}>{USE_LABELS[use]}</Badge>;
}
