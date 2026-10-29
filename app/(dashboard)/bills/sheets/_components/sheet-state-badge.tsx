import { Badge } from "@/components/ui/badge";
import { SHEET_STATE_LABEL, type SheetState } from "@/lib/bills/sheets";

const VARIANT: Record<SheetState, "neutral" | "info" | "success" | "default"> = {
  waiting: "neutral",
  approved: "info",
  paid: "success",
  undone: "default",
};

export function SheetStateBadge({ state }: { state: SheetState }) {
  return <Badge variant={VARIANT[state]}>{SHEET_STATE_LABEL[state]}</Badge>;
}
