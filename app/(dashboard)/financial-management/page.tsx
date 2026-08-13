import { EmptyState } from "@/components/ui/empty-state";
import { Wallet } from "lucide-react";

export default function CashPage() {
  return (
    <EmptyState
      icon={Wallet}
      title="Cash position"
      description="Money in against money out, month by month. Coming in the next step."
    />
  );
}
