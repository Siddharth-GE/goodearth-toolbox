import { Pill, type PillTone } from "@/components/ui/pill";

/** How a villa or plot is doing, in a word and its colour: each tool decides the words, this draws them the same everywhere. */
export function HealthPill({ label, tone }: { label: string; tone: PillTone }) {
  return (
    <Pill tone={tone} className="h-6 gap-1 px-2 text-[11px]">
      <span aria-hidden="true" className="size-1.5 rounded-full bg-current" />
      {label}
    </Pill>
  );
}
