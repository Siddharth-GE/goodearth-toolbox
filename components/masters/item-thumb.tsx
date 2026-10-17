import { colorForName } from "@/lib/color-hash";
import { cn } from "@/lib/utils";
import Image from "next/image";
import type { CSSProperties } from "react";

/**
 * The hash colours are one fixed set used on white and near-black tiles, so the colour arrives as a custom property
 * and the mode picks the treatment (heavier tint, lifted text in dark). The palette itself stays untouched (DESIGN.md).
 */
const TILE_TINT =
  "bg-[color-mix(in_srgb,var(--thumb)_8%,transparent)] dark:bg-[color-mix(in_srgb,var(--thumb)_16%,transparent)]";
const TILE_TEXT = "text-[var(--thumb)] dark:text-[color-mix(in_srgb,var(--thumb)_70%,#fff)]";

/** An item's picture, or a tinted tile with its code (no broken-image icon, no request). Colour from lib/color-hash.ts. */
export function ItemThumb({
  code,
  name,
  thumbUrl,
  className,
  sizes = "160px",
}: {
  code: string | null;
  name: string;
  thumbUrl: string | null;
  className?: string;
  sizes?: string;
}) {
  const color = colorForName(code ?? name);

  return (
    <div
      className={cn(
        "border-border bg-surface relative aspect-square overflow-hidden rounded-xl border",
        className,
      )}
    >
      {thumbUrl ? (
        <Image
          src={thumbUrl}
          // Decorative: the item's name is always rendered next to this.
          alt=""
          fill
          sizes={sizes}
          className="object-contain p-1.5"
        />
      ) : (
        <div
          className={cn("flex size-full items-center justify-center", TILE_TINT)}
          // Custom properties aren't in React's CSSProperties, hence the cast.
          style={{ "--thumb": color } as CSSProperties}
        >
          <span
            className={cn(
              "px-1.5 text-center text-[11px] font-semibold tracking-wider uppercase",
              TILE_TEXT,
            )}
          >
            {code ?? name.slice(0, 12)}
          </span>
        </div>
      )}
    </div>
  );
}
