import { Card } from "@/components/ui/card";
import type { WaveModel } from "@/lib/relay/wave";
import { cn } from "@/lib/utils";
import Link from "next/link";

import { WaveStageHeader, WaveSvg } from "../../../_components/wave-svg";

/** Every villa on one board: the axis is written once across the top, each villa a row sharing the x. The verdict is the only coloured text, so the right edge reads the project. */
export function VillaWaveBoard({
  headerWave,
  rows,
}: {
  headerWave: WaveModel;
  rows: { key: string; name: string; href: string; wave: WaveModel }[];
}) {
  return (
    <Card className="overflow-hidden">
      <div className="border-border border-b px-4 pt-3 pb-1.5 max-sm:hidden">
        <WaveStageHeader wave={headerWave} />
      </div>
      <div className="divide-border divide-y">
        {rows.map(({ key, name, href, wave }) => (
          <VillaWaveRow key={key} name={name} href={href} wave={wave} />
        ))}
      </div>
    </Card>
  );
}

function VillaWaveRow({ name, href, wave }: { name: string; href: string; wave: WaveModel }) {
  const toneClass =
    wave.status === "stuck"
      ? "text-danger"
      : wave.status === "withClient"
        ? "text-warning"
        : wave.status === "complete"
          ? "text-success"
          : "text-muted";

  return (
    <Link href={href} className="hover:bg-foreground/[0.05] block px-4 py-3 transition-colors">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-foreground min-w-0 truncate text-sm font-semibold">{name}</h3>
        <span className={cn("shrink-0 text-xs font-medium", toneClass)}>{wave.label}</span>
      </div>
      <div className="mt-1.5">
        <WaveSvg model={wave} />
      </div>
      {/* Unfiled work can't sit on the curve, so it is said out loud below the drawing. */}
      {wave.unfiledOpen > 0 && (
        <p className="text-muted mt-1 text-[11px]">
          {wave.unfiledOpen} more not filed under a stage, so not drawn
        </p>
      )}
    </Link>
  );
}
