import { Card } from "@/components/ui/card";
import type { WaveModel } from "@/lib/relay/wave";
import { cn } from "@/lib/utils";
import Link from "next/link";

import { WaveStageHeader, WaveSvg } from "../../../_components/wave-svg";

/**
 * Every villa, one board.
 *
 * The first cut drew each villa as its own card with the stage names
 * floating on the page above the stack — which read as debris, and the
 * founder said so. The names belong to the waves, so they live INSIDE
 * the same surface now: one card, the axis written once across its top,
 * and every villa as a row beneath it, all sharing the same ruled x.
 * This is also, it turns out, exactly what the original mock drew.
 *
 * Each row is one glance: name, wave, verdict. The verdict is the only
 * coloured text on the row, so scanning the right edge reads the whole
 * project — which is the point of the page.
 */
export function VillaWaveBoard({
  headerWave,
  rows,
}: {
  /** Any wave from the same project — the header only reads its bands. */
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
    <Link
      href={href}
      className="block px-4 py-3 transition-colors hover:bg-black/[0.02] dark:hover:bg-white/[0.04]"
    >
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-foreground min-w-0 truncate text-sm font-semibold">{name}</h3>
        <span className={cn("shrink-0 text-xs font-medium", toneClass)}>{wave.label}</span>
      </div>
      <div className="mt-1.5">
        <WaveSvg model={wave} />
      </div>
      {/* Work not filed under a stage cannot sit on the curve, so it is
          said out loud — quietly, below the drawing it is absent from. */}
      {wave.unfiledOpen > 0 && (
        <p className="text-muted mt-1 text-[11px]">
          {wave.unfiledOpen} more not filed under a stage, so not drawn
        </p>
      )}
    </Link>
  );
}
