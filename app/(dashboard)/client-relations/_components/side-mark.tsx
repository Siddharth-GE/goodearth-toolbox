import { ACTION_TRACKS, optionFor, type ActionTrack } from "@/lib/client-relations/stages";
import { cn } from "@/lib/utils";
import { HardHat, Sofa } from "lucide-react";

export function SideIcon({ track, className }: { track: ActionTrack; className?: string }) {
  const Icon = track === "kaadal" ? Sofa : HardHat;
  return <Icon aria-hidden="true" className={cn("size-3.5 shrink-0", className)} />;
}

export function sideLabel(track: ActionTrack): string {
  return optionFor(ACTION_TRACKS, track)?.label ?? "Construction";
}

export function SideMark({ track }: { track: ActionTrack }) {
  return (
    <>
      <SideIcon track={track} /> {sideLabel(track)}
    </>
  );
}
