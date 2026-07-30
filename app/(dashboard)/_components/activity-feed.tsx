import { Card } from "@/components/ui/card";

// Static illustrative data — most of these tools don't exist yet, so
// there's no real event stream to read from.
const EVENTS = [
  { time: "09:42", text: "Rajesh raised indent IND-208 for Maloor — 14 items" },
  { time: "09:15", text: "Aneesh received goods against PO-2607-012" },
  { time: "08:58", text: "Agent Sunitha registered 12 runners at Peravoor HSS" },
  { time: "08:30", text: "Divya booked bill BILL-092 — Malabar Timbers" },
];

export function ActivityFeed() {
  return (
    <Card className="p-5">
      <h2 className="mb-3 text-sm font-semibold text-foreground">Activity</h2>
      <div className="space-y-3">
        {EVENTS.map((event) => (
          <div key={event.time + event.text} className="flex gap-3 text-sm">
            <span className="w-11 shrink-0 font-mono text-xs text-muted">{event.time}</span>
            <p className="text-muted">{event.text}</p>
          </div>
        ))}
      </div>
    </Card>
  );
}
