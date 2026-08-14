import { Card } from "@/components/ui/card";
import type { WaveModel } from "@/lib/relay/wave";
import { cn } from "@/lib/utils";
import Link from "next/link";

import { WaveSvg } from "../../../_components/wave-svg";

/**
 * One house, one wave, one sentence.
 *
 * The house list used to be a row of counts — "3 running · 1 waiting · 5
 * done" — which is accurate and tells you nothing you can act on. Two
 * houses with identical counts can be in completely different trouble
 * depending on WHERE the work is sitting, and that is the thing the wave
 * shows and a count cannot.
 *
 * The words on the right are not decoration. At phone width the wave is
 * about thirty pixels tall, and the label is what is actually read; the
 * curve becomes the thing you scan for shape, not for detail.
 */
export function VillaWaveCard({
  name,
  href,
  wave,
}: {
  name: string;
  href: string;
  wave: WaveModel;
}) {
  const toneClass =
    wave.status === "stuck"
      ? "text-danger"
      : wave.status === "withClient"
        ? "text-warning"
        : wave.status === "complete"
          ? "text-success"
          : "text-muted";

  return (
    <Card
      className={cn(
        "overflow-hidden transition-colors",
        wave.status === "stuck" && "border-danger/40",
      )}
    >
      <Link href={href} className="block p-4 hover:bg-black/[0.02] dark:hover:bg-white/[0.04]">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h3 className="text-foreground min-w-0 flex-1 text-sm font-semibold">{name}</h3>
          {/* Work that is not filed under any stage cannot appear on the
              curve, so it is said out loud here. A wave that looks calm
              because work is missing from it is the flattering number
              this tool exists to remove. */}
          {wave.unfiledOpen > 0 && (
            <span className="text-warning text-xs">{wave.unfiledOpen} not on the wave</span>
          )}
          <span className={cn("text-xs font-medium", toneClass)}>{wave.label}</span>
        </div>
        <div className="mt-2">
          <WaveSvg model={wave} />
        </div>
      </Link>
    </Card>
  );
}

/**
 * The stage names, written once above the stack instead of on every wave.
 *
 * Every villa shares one x-axis, so repeating eight stage names down the
 * page would be eight times the ink for the same fact. Hidden on a phone,
 * where they would be unreadable and the big wave on the house page is
 * the place to read stages anyway.
 *
 * The names sit on TWO staggered rows, and that is not decoration.
 * Stage lengths vary wildly — Saarang runs a four-week Design straight
 * into a sixteen-week Technical Drawings — so one row either overlaps
 * the names or clips them to "De…" and "Co…". Staggering puts each
 * label's neighbours two stages away, which gives even a four-week stage
 * room for its full name over the exact point it labels.
 */
export function WaveStageHeader({ wave }: { wave: WaveModel }) {
  return (
    <div className="text-muted relative hidden h-8 px-4 text-[11px] font-semibold tracking-widest uppercase sm:block">
      {wave.bands.map((band, i) => {
        const mid = ((band.x0 + band.x1) / 2) * 100;
        // The first and last names would hang off the ends, so they line
        // up with the edge instead of their midpoint.
        const align = mid < 8 ? "0" : mid > 92 ? "-100%" : "-50%";
        return (
          <span
            key={band.stageId}
            className="absolute whitespace-nowrap"
            style={{
              left: `${mid}%`,
              top: i % 2 === 0 ? 0 : "1rem",
              transform: `translateX(${align})`,
            }}
          >
            {band.name}
          </span>
        );
      })}
    </div>
  );
}
