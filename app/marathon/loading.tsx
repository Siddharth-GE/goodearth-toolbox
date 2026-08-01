import { Spinner } from "@/components/ui/spinner";

// The kiosk had no loading boundary at all, and no ancestor to fall back
// to — the root layout has none either. On a phone on event-day mobile
// data that meant a blank white screen between taps.
export default function Loading() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <Spinner />
    </div>
  );
}
