import { EmptyState } from "@/components/ui/empty-state";
import { CalendarClock } from "lucide-react";

export default function ForwardPage() {
  return (
    <EmptyState
      icon={CalendarClock}
      title="Forward view"
      description="Expected collections against expected spend — the funding gap ahead. Coming in the next step."
    />
  );
}
