import { EmptyState } from "@/components/ui/empty-state";
import { Landmark } from "lucide-react";

export default function FundingPage() {
  return (
    <EmptyState
      icon={Landmark}
      title="Funds raised"
      description="Every loan and investor — outstanding balance and interest per facility. Coming in the next step."
    />
  );
}
